import { Http } from "../../http";
import { hypernode, type IHttpCore, type ICPool } from "../../hypernode";
import { createPipeline } from "../factory/pipeline";
import net from "net";
import { PipeResponseBase } from "../response/PipeResponseBase";
import ChunkProgression from "../chunker/ChunkProgression";
import { createAccumulators } from "../factory/accumulator";

abstract class HttpContext implements Http.HttpContext {
    protected MODE!: "web" | "api";

    protected abstract contentDecoding: Http.ContentDecoding;
    protected abstract contentEncoding: Http.ContentEncoding;
    protected abstract contentTypeParsers: Http.ContentTypeParser;
    protected errorRespMap: Http.HttpStaticResponseMap = {
        RESP_505: Buffer.from("HTTP/1.1 505 HTTP Version Not Supported\r\nContent-Length: 0\r\n\r\n"),
        RESP_405: Buffer.from("HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n"),
        RESP_400: Buffer.from("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n"),
        RESP_404: Buffer.from("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"),
        RESP_413: Buffer.from("HTTP/1.1 413 Payload Too Large\r\nContent-Length: 0\r\n\r\n"),
        RESP_414: Buffer.from("HTTP/1.1 414 Request-URI Too Large\r\nContent-Length: 0\r\n\r\n"),
        RESP_204: Buffer.from("HTTP/1.1 204 No Content\r\n\r\n")
    };  
    
    public server!: net.Server;

    protected chunkPool!: ICPool;
    protected respPool!: ICPool;
    protected routePipes!: Http.RoutePipe[];

    // protected chunkObjs!: ChunkProgression[];
    protected accumulators!: ReturnType<typeof createAccumulators>;

    protected abstract parseInitial: Http.ParseInitialFn;

    protected state!: Http.ServerState;
    protected isEnableCors = false;
    
    protected httpCore!: IHttpCore;
    protected setHttpCore(mode: "web" | "api"): void {
        this.MODE = mode;
        this.httpCore = new hypernode.HttpCore();
    }

    private bootstrapPoolChunkProgressionFn?: (createdChunkProgression: ChunkProgression) =>  void;

    constructor(opts?: Http.ServerOptions) {
        this.state = {
            corsHeaders: "" as string,
            maxHeaderSize: opts?.maxHeaderSize || 10 * 1024,
            maxHeaderNameSize: opts?.maxHeaderNameSize || 512,
            maxHeaderValueSize: opts?.maxHeaderValueSize || 1024,
            maxContentSize: opts?.maxContentSize || 3 * 1024 * 1024 as number,
            requestQuerySize: opts?.requestQuerySize || 2048,
            timeout: opts?.timeout || 3000,
            untilEnd: opts?.untilEnd || false,
            maxRequests: opts?.maxRequests || 5000,
            ResponseCtor: opts?.ResponseCtor || PipeResponseBase
        }

        if (opts?.bootstrapPoolChunkProgression) {
            // @ts-ignore
            this.bootstrapPoolChunkProgressionFn = opts?.bootstrapPoolChunkProgression;
        }
    }

    private setRegisterResp(n: number, cPool: any) {
        for (let i = 0; i < n; i++) {
            let cObj = new this.state.ResponseCtor();
            let objId = cPool.registerObj(cObj);
            cObj.setCPool(cPool, objId);
        }
    }

    private setRegisterChunkProgression(n: number, cPool: any, respCPool: any) {
        const objs: ChunkProgression[] = [];
        for (let i = 0; i < n; i++) {
            const cpObj = new ChunkProgression(cPool, this.parseInitial, respCPool);
            if (this.bootstrapPoolChunkProgressionFn) {
                this.bootstrapPoolChunkProgressionFn(cpObj);
            }
            objs.push(cpObj);
        }
        return objs;
    }

    protected initRuntime() {
        this.respPool = new hypernode.CPool();
        this.respPool.initializePool(this.state.maxRequests);
        this.setRegisterResp(this.state.maxRequests, this.respPool);

        this.chunkPool = new hypernode.CPool();
        this.chunkPool.initializePool(this.state.maxRequests);
        this.setRegisterChunkProgression(
            this.state.maxRequests,
            this.chunkPool,
            this.respPool
        );
    }

    protected registerRouters(mainRoute: Http.Route) {
        this.accumulators = createAccumulators({
            contentDecoding: this.contentDecoding,
            contentTypeParsers: this.contentTypeParsers,
            errorRespMap: this.errorRespMap
        });
        this.buildRoute(mainRoute, this.state);
    }

    private buildRoute(_Route: Http.Route, state: Http.ServerState) {
        let buildedRoutes: Http.BuildedRoute[] = [];
        let routePipes: Http.RoutePipe[] = [];
        let accumulators = this.accumulators;

        function getMethodStr(method: Http.HttpMethod) {
            switch (method) {
                case Http.HttpMethod.GET:     return "GET";
                case Http.HttpMethod.POST:    return "POST";
                case Http.HttpMethod.PUT:     return "PUT";
                case Http.HttpMethod.PATCH:   return "PATCH";
                case Http.HttpMethod.DELETE:  return "DELETE";
                case Http.HttpMethod.OPTIONS: return "OPTIONS";
                case Http.HttpMethod.HEAD:    return "HEAD";
                default: return "UNKNOWN";
            }
        }

        function normalizeRoutePattern(route: string) {
            let normalized = route.replace(/:([^\/]*)/g, ':');

            if (normalized.endsWith(':')) {
                normalized += '/';
            }

            return normalized;
        }

        function desicionMaker(ep: Http.Endpoint)  {
            if (ep.method === Http.HttpMethod.GET || ep.method === Http.HttpMethod.HEAD)
                return accumulators.accumulatorHeadGet;

            if (ep.accumulateHandle)
                return ep.accumulateHandle;

            if (ep.ct) {
                if (ep.ct.encoding && ep.ct.type)
                    return accumulators.accumulatorDefinedTypeEncode;
                else if (ep.ct.encoding)
                    return accumulators.accumulatorDefinedEncode;
                else if (ep.ct.type)
                    return accumulators.accumulatorDefinedType;
            }

            return accumulators.decisionAccumulate;
        }

        function buildSubTree(rootRoute: Http.Route, url: string, _mws: Http.Middleware[]) {
            let mws = [..._mws];
            
            let mwIdx = 0;
            while (mwIdx < rootRoute.middlewares.length) {
                let mw = rootRoute.middlewares[mwIdx++];
                mws.push(mw);
            }

            let epIdx = 0;
            while (epIdx < rootRoute.endpoints.length) {
                let ep = rootRoute.endpoints[epIdx++];
                let pipeFns = [...mws.map((v) => v.handle), ...ep.middlewares.map((v) => v.handle), ep.handle ];
                let accumulateHandler = desicionMaker(ep);
                let mainIndex = routePipes.push({
                    url: url + ep.url,
                    ct: ep?.ct,
                    mws: pipeFns,
                    pipeHandler: createPipeline(ep, pipeFns),
                    ResponseCtor: state.ResponseCtor,
                    accumulateHandler: accumulateHandler,
                    routeId: epIdx,

                    maxContentSize: ep.maxContentSize || state.maxContentSize,
                    maxHeaderSize: ep.maxHeaderSize || state.maxHeaderNameSize,
                    untilEnd: ep.untilEnd || state.untilEnd,
                }) - 1;
                let bRoute = {
                    method: getMethodStr(ep.method),
                    route: normalizeRoutePattern(url + ep.url), 
                    vptrTableIndex: mainIndex 
                };
                buildedRoutes.push(bRoute)
            }

            let routeIdx = 0;
            while (routeIdx < rootRoute.routes.length) {
                let childRoute = rootRoute.routes[routeIdx++];
                let childUrl = url + childRoute.url;
                buildSubTree(childRoute, childUrl, mws);
            }
        }

        buildSubTree(_Route, _Route.url, []);
        if (this.httpCore.registerRoutes(buildedRoutes) != buildedRoutes.length) throw new Error("Building Route Tree");

        this.routePipes = routePipes;
    }

    public enableCors(cfg: Http.CorsConfig) {
        function toHeaderValue(v?: Http.CorsValue): string | undefined {
            if (!v) return undefined;
            return Array.isArray(v) ? v.join(",") : v;
        }

        const headers: string[] = [];

        const allowedOrigins   = cfg.allowedOrigins == true ? "*" : toHeaderValue(cfg.allowedOrigins as Http.CorsValue | undefined);
        const allowedMethods   = toHeaderValue(cfg.allowedMethods);
        const allowedHeaders   = toHeaderValue(cfg.allowedHeaders);
        const exposedHeaders   = toHeaderValue(cfg.exposedHeaders);
        const credentials      = cfg.credentials;
        const maxAge           = cfg.maxAge;

        if (allowedOrigins)
            headers.push(`Access-Control-Allow-Origin: ${allowedOrigins}`);

        if (allowedMethods)
            headers.push(`Access-Control-Allow-Methods: ${allowedMethods}`);

        if (allowedHeaders)
            headers.push(`Access-Control-Allow-Headers: ${allowedHeaders}`);

        if (exposedHeaders)
            headers.push(`Access-Control-Expose-Headers: ${exposedHeaders}`);

        if (credentials !== undefined)
            headers.push(`Access-Control-Allow-Credentials: ${credentials}`);

        if (maxAge !== undefined)
            headers.push(`Access-Control-Max-Age: ${maxAge}`);

        this.state.corsHeaders = headers.join("\n");
        this.errorRespMap.RESP_204 = Buffer.from(
                        "HTTP/1.1 404 Not Found\r\n" +
                        this.state.corsHeaders + "\r\n" +
                        "Content-Length: 0\r\n\r\n"
                    );
        this.isEnableCors = true;

        return this;
    }

    public setTimeout(timeout: number) { 
        timeout > 0 ? this.state.timeout = timeout : null 
    }

    public setRequestQuerySize(requestQuerySize: number) { 
        requestQuerySize > 0 ? this.state.requestQuerySize = requestQuerySize : null 
    }

    public setMaxHeaderNameSize(maxHeaderNameSize: number) { 
        maxHeaderNameSize > 0 ? this.state.maxHeaderNameSize = maxHeaderNameSize : null 
    }

    public setMaxHeaderValueSize(maxHeaderValueSize: number) { 
        maxHeaderValueSize > 0 ? this.state.maxHeaderValueSize = maxHeaderValueSize : null 
    }

    public setMaxContentSize(maxContentSize: number) { 
        maxContentSize > 0 ? this.state.maxContentSize = maxContentSize : null
    }

    public listen(
        port?: number | undefined,
        hostname?: string | undefined,
        backlog?: number | undefined,
        listeningListener?: (() => void) | undefined
    ) {
        this.server.listen(port, hostname, backlog, listeningListener);
        return this;
    }

    public setMaxRequests(n: number) {
        if (n < 1) {
            return false;
        }
        this.state.maxRequests = n;
        try {
            this.chunkPool.resizePool(n);
            this.respPool.resizePool(n);
        } catch (error) {
            console.error(error);
            return false;
        }
        return true;
    }
    

    public getTimeout() { return this.state.timeout }
    public getRequestQuerySize() { return this.state.requestQuerySize }
    public getMaxHeaderNameSize() { return this.state.maxHeaderNameSize }
    public getMaxHeaderValueSize() { return this.state.maxHeaderValueSize }
    public getMaxContentSize() { return this.state.maxContentSize }
}

export default HttpContext;