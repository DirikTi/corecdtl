import { contentParserTable } from "../content/parser";
import { contentDecodingTable, contentEncodingTable } from "../content/encoding";
import { Http } from "../../http";
import HttpContext from "./HttpContext";
import * as Factory from "../factory/factory";
import net from "net";
import fs from "fs";
import path from "path";
import { hypernode, IPublicAssetParser } from "../../hypernode";

type RouteDefinationFn = (
    socket: net.Socket,
    p: Http.ChunkProgression, 
    routeId: number, 
    chunk: Buffer<ArrayBufferLike>
) => void;

type CacheEntry = {
    headers: Buffer;
    body: Buffer;
    payload: Buffer;
    size: number
}

function isFingerprinted(name: string): boolean {
    return /\.[a-f0-9]{8,}\./i.test(name)
}

const MIME_MAP: Record<string, string> = {
    ".js":  "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
}

class WebContext extends HttpContext {
    protected contentDecoding = contentDecodingTable;
    protected contentEncoding = contentEncodingTable;
    protected contentTypeParsers = contentParserTable;

    private assetCache!: Map<string, CacheEntry>;
    private assetParser!: IPublicAssetParser;

    protected spaRootPath!: string;
    protected spaRespBuffer!: Buffer;

    private publicRoutePathName!: string;
    private publicStaticRoute!: string;
    private routeDefinationFns!: Array<RouteDefinationFn>;

    constructor(ctxOpts: Http.WebContextState, opts?: Http.ServerOptions) {
        super(opts);
        
        this.publicRoutePathName = ctxOpts?.publicStaticPath == undefined ? "dist" : ctxOpts.publicStaticPath;
        this.publicStaticRoute = ctxOpts?.publicStaticRoute == undefined ? "/public" : ctxOpts.publicStaticRoute;
        
        this.assetParser = new hypernode.PublicAssetParser();
        this.assetParser.setAssetRoute(this.publicStaticRoute);

        this.spaRootPath = ctxOpts?.spaRootPath == undefined ? "dist/index.html" : ctxOpts.spaRootPath
        let _data;
        try {
            _data = fs.readFileSync(this.spaRootPath);
        } catch (error) {
            console.error(error);
            return;
        }

        const __resp = Buffer.from(
            "HTTP/1.1 200 OK\r\n" +
            "Content-Type: text/html; charset=utf-8\r\n" +
            "Content-Length: " + _data!.length + "\r\n" +
            "Cache-Control: no-cache\r\n" +
            "\r\n",
            "ascii"
        );

        this.assetCache = new Map();
        this.setAllAssets();

        this.spaRespBuffer = Buffer.concat([__resp, _data!]);

        this.initRuntime();
        this.bindServer(opts?.netServerOptions);
    }

    private bindServer(netServerOptions?: net.ServerOpts) {
        this.server = new net.Server(netServerOptions, (socket) => {
            let p: Http.ChunkProgression = this.chunkPool.allocate();
            if (!p) {
                socket.destroy();
                return;
            }
    
            socket.setTimeout(this.state.timeout);
            // socket.setNoDelay(true);
    
            socket.on("data", chunk => {
                p.fn(socket, chunk, p);
            });
            
            socket.on("timeout", () => {
                socket.destroy();
            });
    
            socket.on("error", (err) => {
                socket.destroy();
            });
    
            socket.on("close", () => {
                p.free();
            })
        });
    }

    protected parseInitial: Http.ParseInitialFn = (
        socket,
        chunk,
        p
    ) => {
        const routeId = this.httpCore.scannerRouteFirst(
            chunk, p, 
            this.state.maxHeaderNameSize, this.state.maxHeaderValueSize, this.state.maxContentSize, this.state.requestQuerySize
        );
        console.log(chunk.toString());
        if (p.retFlag !== Http.RetFlagBits.FLAG_OK) {
            switch (p.retFlag) {
                // --- CORS 204 ---
                case Http.RetFlagBits.FLAG_CORS_PREFLIGHT:
                    socket.write(
                        Buffer.from(
                            "HTTP/1.1 204 No Content\r\n" +
                            this.state.corsHeaders + "\r\n" +
                            "Content-Length: 0\r\n\r\n"
                        )
                    );
                    socket.destroy();
                    return;

                // --- VERSION UNSUPPORTED ---
                case Http.RetFlagBits.FLAG_HTTP_VERSION_UNSUPPORTED:
                    socket.write(this.errorRespMap.RESP_505);
                    socket.destroy();
                    return;

                // --- METHOD NOT ALLOWED ---
                case Http.RetFlagBits.FLAG_METHOD_NOT_ALLOWED:
                    socket.write(this.errorRespMap.RESP_405);
                    socket.destroy();
                    return;

                // --- REQUEST QUERY EXCEEDED ---
                case Http.RetFlagBits.FLAG_REQUEST_QUERY_EXCEEDED:
                    socket.write(this.errorRespMap.RESP_414)
                    socket.destroySoon();
                    return;

                // --- NOT FOUND ---
                case Http.RetFlagBits.FLAG_NOT_FOUND:
                    if (this.enableCors) {
                        socket.write(
                            this.errorRespMap.RESP_204
                        );
                    } else {
                        socket.write(this.errorRespMap.RESP_404);
                    }
                    socket.destroy();
                    return;

                // === HEADER ERRORS ===
                case Http.RetFlagBits.FLAG_INVALID_ARGUMENT:
                case Http.RetFlagBits.FLAG_INVALID_HEADER:
                case Http.RetFlagBits.FLAG_INVALID_CONTENT_LENGTH:
                case Http.RetFlagBits.FLAG_CONTENT_LENGTH_EXCEEDED:
                case Http.RetFlagBits.FLAG_MAX_HEADER_SIZE:
                case Http.RetFlagBits.FLAG_MAX_HEADER_NAME_SIZE:
                case Http.RetFlagBits.FLAG_MAX_HEADER_VALUE_SIZE:
                case Http.RetFlagBits.FLAG_DUPLICATE_SINGLE_HEADER:
                    socket.write(this.errorRespMap.RESP_400);
                    socket.destroy();
                    return;

                case Http.RetFlagBits.FLAG_UNTERMINATED_HEADERS:
                    p.rawBuf = chunk;
                    p.routePipe = this.routePipes[routeId];
                    p.fn = this.parseHeader;
                    return; 

                // --- OTHER (fallback) ---
                default:
                    socket.write(this.errorRespMap.RESP_400);
                    socket.destroy();
                    return;
            }
        }
        this.routeDefinationFns[routeId](socket, p, routeId, chunk);
    };

    protected publicRouteDefinationFn: RouteDefinationFn = (socket, p, routeId, chunk) => {
        const assetPath = this.assetParser.handlePublicAsset(
            chunk, 4 + 1 // GET(3) 1 is SPACE and Last 1 is => /
        );
        
        let entry = this.assetCache.get(assetPath)

        if (!entry) {
            entry = this.loadAsset(assetPath)
            if (!entry) {
                socket.write(
                    "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"
                )
                p.free()
                socket.end()
                return
            }

            this.assetCache.set(assetPath, entry)
        }

        socket.write(entry.payload);
        p.reset();
        socket.end();
    }

    protected spaRouteDefinationFn: RouteDefinationFn = (socket, p, routeId, _) => {
        p.free();
        socket.write(this.spaRespBuffer);
        // socket.end();
    }

    protected dynamicRouteDefinationFn: RouteDefinationFn = (socket, p, routeId, chunk) => {
        p.rawBuf = chunk;

        const h = p.headers;
        const hostHeader = h.host;

        if (!hostHeader) {
            socket.write(this.errorRespMap.RESP_400);
            socket.destroy();
            return;
        }
        
        p.routePipe = this.routePipes[routeId];
        p.routePipe.accumulateHandler(socket, p);
    }

    protected parseHeader: Http.ParseInitialFn = (
        socket,
        chunk,
        p
    ) => {
        p.rawBuf = Buffer.concat([p.rawBuf, chunk]);
        this.httpCore.scannerHeader(p.rawBuf, p, 
            this.state.maxHeaderNameSize, this.state.maxHeaderValueSize, this.state.maxContentSize);
        if (p.retFlag !== Http.RetFlagBits.FLAG_OK) {
            switch (p.retFlag) {
                case Http.RetFlagBits.FLAG_INVALID_ARGUMENT:
                case Http.RetFlagBits.FLAG_INVALID_HEADER:
                case Http.RetFlagBits.FLAG_INVALID_CONTENT_LENGTH:
                case Http.RetFlagBits.FLAG_CONTENT_LENGTH_EXCEEDED:
                case Http.RetFlagBits.FLAG_MAX_HEADER_SIZE:
                case Http.RetFlagBits.FLAG_MAX_HEADER_NAME_SIZE:
                case Http.RetFlagBits.FLAG_MAX_HEADER_VALUE_SIZE:
                    socket.write(this.errorRespMap.RESP_400);
                    socket.destroySoon();
                    return;
                case Http.RetFlagBits.FLAG_UNTERMINATED_HEADERS:
                    return; 
            }
        }
        this.routeDefinationFns[p.routePipe!.routeId](socket, p, p.routePipe!.routeId, chunk);
    };

    override registerRouters(mainRoute: Http.Route | undefined) {
        let _startRoutePath = "/";
        
        if (mainRoute == undefined) {
            mainRoute = Factory.createRoute(_startRoutePath);
        } else {
            
            _startRoutePath = mainRoute.url;
            /* Same time add dynamic EPs */
        }

        const __routePublic = this.makeRoutePublic();
        const _routeSPA = this.makeRouteSPA();

        mainRoute.addRoute(__routePublic);
        mainRoute.addRoute(_routeSPA);

        super.registerRouters(mainRoute);

        this.setRouteDefinationFn(_startRoutePath);
    }

    private makeRouteSPA() {
        const spaRoute = Factory.createRoute("*");
        spaRoute.addEndpoint(
            Factory.createEndpoint(Http.HttpMethod.GET, "", null)
        );
        return spaRoute;
    }

    private makeRoutePublic() {
        const _route = Factory.createRoute(this.publicStaticRoute);
        const _ep = Factory.createEndpoint(Http.HttpMethod.GET, "/*", null);
        _route.addEndpoint(_ep);

        return _route;
    }

    private setRouteDefinationFn(_startRoute: string) {
        const _routeDefinationFns = Array<RouteDefinationFn>(this.routePipes.length);
        for (let i = 0; i < this.routePipes.length; i++) {
            const e = this.routePipes[i];
            
            if (e.url == _startRoute.concat("*")) {
                _routeDefinationFns[i] = this.spaRouteDefinationFn
            } else if (e.url == _startRoute.concat(this.publicStaticRoute).concat("/*")) {
                _routeDefinationFns[i] = this.publicRouteDefinationFn;
            } else {
                _routeDefinationFns[i] = this.dynamicRouteDefinationFn;
            }
        }

        this.routeDefinationFns = _routeDefinationFns;
    }

    protected setAllAssets() {
        const walk = (dir: string, baseUrl: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true })

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name)
                const urlPath = path.posix.join(baseUrl, entry.name)

                if (entry.isDirectory()) {
                    walk(fullPath, urlPath)
                    continue
                }

                if (!entry.isFile()) continue

                const asset = this.loadAsset(urlPath)
                if (!asset) continue

                this.assetCache.set(urlPath, asset)
            }
        }

        walk(this.publicRoutePathName, "")
    }

    private loadAsset(assetPath: string) {
        try {
            const fullPath = path.join(this.publicRoutePathName, assetPath)
            const body = fs.readFileSync(fullPath)
            const size = body.length

            const ext = path.extname(assetPath).toLowerCase()
            const mime = MIME_MAP[ext] ?? "application/octet-stream"

            const immutable = isFingerprinted(assetPath)

            const cacheControl = immutable
                ? "public, max-age=31536000, immutable"
                : "public, max-age=0, must-revalidate"

            const headers = Buffer.from(
                "HTTP/1.1 200 OK\r\n" +
                `Content-Type: ${mime}\r\n` +
                `Content-Length: ${size}\r\n` +
                `Cache-Control: ${cacheControl}\r\n` +
                "\r\n"
            )
            const payload = Buffer.concat([headers, body]);

            return { headers, body, size, payload }

        } catch {
            return undefined
        }
    }

    override setHttpCore(): void {
        super.setHttpCore("web");
    }
}

export default WebContext;