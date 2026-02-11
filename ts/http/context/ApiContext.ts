import { contentParserTable } from "../content/parser";
import { contentDecodingTable, contentEncodingTable } from "../content/encoding";
import { Http } from "../../http";
import HttpContext from "./HttpContext";
import net from "net";
import { createAccumulators } from "../factory/accumulator";
import { exit } from "process";

class ApiContext extends HttpContext {
    protected contentDecoding = contentDecodingTable;
    protected contentEncoding = contentEncodingTable;
    protected contentTypeParsers = contentParserTable;

    constructor(opts?: Http.ServerOptions) {
        super(opts);
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
            // socket.setKeepAlive(true, 60000);
    
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
            this.state.maxHeaderNameSize, this.state.maxHeaderValueSize, 
            this.state.maxHeaderSize, this.state.requestQuerySize
        );
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
                    if (this.isEnableCors) {
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
        return;
    };

    protected parseHeader: Http.ParseInitialFn = (
        socket,
        chunk,
        p
    ) => {
        p.rawBuf = Buffer.concat([p.rawBuf, chunk]);
        this.httpCore.scannerHeader(p.rawBuf, p, this.state.maxHeaderNameSize, this.state.maxHeaderValueSize, 
            this.state.maxHeaderSize);
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
        const h = p.headers;
        const hostHeader = h.Host ?? h.host ?? h.HOST;

        if (!hostHeader) {
            socket.write(this.errorRespMap.RESP_400);
            return socket.destroy();
        }
        
        p.routePipe.accumulateHandler(socket, p);
        return;

    };

    override registerRouters(mainRoute: Http.Route) {
        super.registerRouters(mainRoute);
    }

    override setHttpCore(): void {
        super.setHttpCore("api");
    }
}

export default ApiContext;