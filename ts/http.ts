import net from "net";
import { PipeResponseBase } from "./http/response/PipeResponseBase";
import { ChunkParser } from "./http/chunker/ChunkParser";

export namespace Http {
    /**
     * @type {MiddlewareHandleFn<P, T, R>}
     * @description Defines the signature for a Middleware handler function.
     * Middleware functions intercept requests before they reach the final endpoint.
     *
     * @template P - The type of the request body (payload) expected by this handler (e.g., when a request body schema is known). Defaults to `any` if not specified.
     * @template T - The specific Request object type used by the handler. Defaults to `Request<P>`.
     * @template R - The specific Response object type used by the handler. Defaults to `PipeResponseBase`.
     *
     * @param {T} req - The request object (defaults to Request<P>).
     * @param {R} res - The response object.
     * @returns {void | Promise<void>} The function can be synchronous or asynchronous.
     */
    export type MiddlewareHandleFn<P = any, T = Request<P>, R = PipeResponseBase> = (
        req: T,
        res: R,
    ) => void | Promise<void>;

    /**
     * @type {EndpointHandleFn<T, R>}
     * @description Defines the signature for an Endpoint handler function.
     * This function executes the final business logic for a matched route.
     *
     * @template T - The type of the request body (payload) expected by this endpoint. Defaults to `any` if not specified.
     * @template R - The specific Response object type used by the handler. Defaults to `PipeResponseBase`.
     *
     * @param {Request<T>} req - The request object, explicitly typed with the expected body type T.
     * @param {R} res - The response object.
     * @returns {void | Promise<void>} The function can be synchronous or asynchronous.
     */
    export type EndpointHandleFn<T = any, R = PipeResponseBase> = (
        req: Request<T>,
        res: R,
    ) => void | Promise<void>;

    export type HandlerPipeFn = (
        socket: net.Socket,
        chunk: Buffer,
        p: Http.ChunkProgression
    ) => void;

    export type HandlerParserFn = (
        socket: net.Socket,
        p: Http.ChunkProgression
    ) => void;

    /**
     * @interface Request
     * @description Represents the processed incoming HTTP request object passed to the route handlers (endpoints/middlewares).
     * This object contains all essential parsed request information, ready for developer consumption.
     * The generic type <T> is typically used for the request body data type (e.g., JSON payload).
     * @template T - The expected type of the request body (e.g., object, string, Buffer).
     */
    export interface Request<T> {
        [key: string]: any;
        /**
         * @property {string} url
         * @description The full request URL path, including the query string (e.g., "/users/123?active=true").
         */
        url: string;

        /**
         * @property {Record<string, string>} headers
         * @description A key-value map of the parsed HTTP request headers.
         * Keys are typically normalized (e.g., lowercased).
         */
        headers: Record<string, string>;

        /**
         * @property {string[]} params
         * @description An array containing the values of the dynamic URL parameters defined in the route path.
         * E.g., for route "/users/:id", this array would contain the value of "id".
         */
        params: string[];

        /**
         * @property {Record<string, string>} query
         * @description A key-value map of the parsed URL query string parameters.
         * E.g., for "?search=term&page=2", this would be { search: "term", page: "2" }.
         */
        query: Record<string, string>;

        /**
         * @property {T} body
         * @description The request payload (body). The type <T> is determined by the expected content
         * type and how the middleware/framework chooses to process it (e.g., JSON object, raw string, or Buffer).
         */
        body: T;
    }

    export enum HttpMethod {
        HEAD,
        GET,
        POST,
        PUT,
        DELETE,
        PATCH,
        OPTIONS
    }

    export enum RetFlagBits {
        FLAG_OK = 0x0000,
        FLAG_BAD_REQUEST = 0x0001,
        FLAG_METHOD_NOT_ALLOWED = 0x0002,
        FLAG_NOT_FOUND = 0x0004,
        FLAG_CORS_PREFLIGHT = 0x0008,
        FLAG_HTTP_VERSION_UNSUPPORTED = 0x0010,
        FLAG_CONTENT_LENGTH_TOO_LARGE = 0x0020,
        FLAG_MISSING_HOST = 0x0040,
        FLAG_HAS_BODY = 0x0080,
        FLAG_INVALID_ARGUMENT = 0x0100,
        FLAG_INVALID_HEADER = 0x0200,
        FLAG_INVALID_HEADER_VALUE = 0X0300,
        FLAG_INVALID_CONTENT_LENGTH = 0x0400,
        FLAG_CONTENT_LENGTH_EXCEEDED = 0x0800,
        FLAG_UNTERMINATED_HEADERS = 0x1000,
        FLAG_MAX_HEADER_SIZE = 0X2000,
        FLAG_MAX_HEADER_NAME_SIZE = 0X2100,
        FLAG_MAX_HEADER_VALUE_SIZE = 0X2200,
        FLAG_DUPLICATE_SINGLE_HEADER = 0X3000,
        FLAG_REQUEST_QUERY_EXCEEDED = 0X4000,
        FLAG_REQUEST_URL_EXCEEDED = 0X5000,
        FLAG_SMUGGING_TE_CL = 0x6000
    }


    /**
     * @interface HttpContext
     * @description Public API surface of the HTTP runtime context.
     * Wraps Node.js `net.Server` and provides HTTP features such as
     * routing, pooling, limits, CORS and lifecycle management.
     */
    export interface HttpContext {

        /**
         * Underlying raw Node.js server instance.
         * Can be used for low-level socket/event access when needed.
         */
        readonly server: net.Server;


        // --------------------------------------------------
        // CORS
        // --------------------------------------------------

        /**
         * Enables and configures Cross-Origin Resource Sharing (CORS).
         *
         * Automatically injects CORS headers into responses.
         *
         * @returns {this} Context instance (chainable)
         */
        enableCors(cfg: CorsConfig): this;


        // --------------------------------------------------
        // Configuration
        // --------------------------------------------------

        /**
         * Sets the connection timeout.
         * @default 3000 ms
         */
        setTimeout(timeout: number): void;

        /**
         * Sets the maximum allowed query string size.
         * @default 2048 bytes
         */
        setRequestQuerySize(requestQuerySize: number): void;

        /**
         * Sets the maximum allowed request body (payload) size.
         * @default 3145728 bytes (3MB)
         */
        setMaxContentSize(maxContentSize: number): void;

        /**
         * Sets the max header name size.
         * @default 512 bytes
         */
        setMaxHeaderNameSize(maxHeaderNameSize: number): void;

        /**
         * Sets the max header value size.
         * @default 1024 bytes
         */
        setMaxHeaderValueSize(maxHeaderValueSize: number): void;

        // --------------------------------------------------
        // Getters
        // --------------------------------------------------

        getTimeout(): number;
        getRequestQuerySize(): number;
        getMaxHeaderNameSize(): number;
        getMaxHeaderValueSize(): number;
        getMaxContentSize(): number;


        // --------------------------------------------------
        // Lifecycle
        // --------------------------------------------------

        /**
         * Starts listening for incoming connections.
         * @returns {this} Context instance (chainable)
         */
        listen(
            port?: number,
            hostname?: string,
            backlog?: number,
            listeningListener?: () => void
        ): this;


        // --------------------------------------------------
        // Resource Management
        // --------------------------------------------------

        /**
         * Sets maximum number of concurrent requests.
         * Resizes internal pools.
         *
         * @default 5000
         */
        setMaxRequests(n: number): boolean;
    }

    /**
     * @description Represents a map of pre-defined HTTP response buffers for common errors and status codes.
     */
    export type HttpStaticResponseMap = {
        /** HTTP Version Not Supported: The server does not support the HTTP protocol version used in the request. */
        RESP_505: Buffer;
        /** Method Not Allowed: The request method is known by the server but has been disabled and cannot be used. */
        RESP_405: Buffer;
        /** Bad Request: The server cannot or will not process the request due to something that is perceived to be a client error. */
        RESP_400: Buffer;
        /** Not Found: The server cannot find the requested resource. */
        RESP_404: Buffer;
        /** Payload Too Large: The request entity is larger than limits defined by server. */
        RESP_413: Buffer;
        /** Request-URI Too Large: The URI provided was too long for the server to process. */
        RESP_414: Buffer;
        /** No Content: The server successfully processed the request, and is not returning any content. */
        RESP_204: Buffer;
    };

    /**
     * @typedef {string | string[]} CorsValue
     * @description CORS settings array or single one string.
     */
    export type CorsValue = string | string[];

    /**
     * @interface CorsConfig
     * @description Configuration necessary for CORS settings.
     * The fields directly map to the corresponding Access-Control-... response headers.
     */
    export interface CorsConfig {
        /**
         * Maps to 'Access-Control-Allow-Origin'.
         * Can be a single origin string, an array of origins, or boolean 'true' for '*' (wildcard).
         */
        allowedOrigins?: CorsValue | boolean; // 'origin' yerine 'allowedOrigins' kullanıldı.

        /**
         * Maps to 'Access-Control-Allow-Methods'.
         */
        allowedMethods?: CorsValue; // 'methods' yerine 'allowedMethods' kullanıldı.

        /**
         * Maps to 'Access-Control-Allow-Headers'.
         */
        allowedHeaders?: CorsValue;

        /**
         * Maps to 'Access-Control-Expose-Headers'.
         */
        exposedHeaders?: CorsValue;

        /**
         * Maps to 'Access-Control-Allow-Credentials'.
         */
        credentials?: boolean;

        /**
         * Maps to 'Access-Control-Max-Age'.
         */
        maxAge?: number;
    }

    /**
 * Configuration options used to initialize the HTTP context/server.
 */
    export interface ServerOptions {

        /**
         * Options forwarded directly to the underlying Node.js `net.Server`.
         */
        netServerOptions?: net.ServerOpts;

        /**
         * Maximum total header size in bytes.
         * @default 2048
         * @recommended 2048 – 4096
         */
        maxHeaderSize?: number;

        /**
         * Maximum allowed header name size in bytes.
         * @default 256
         */
        maxHeaderNameSize?: number;

        /**
         * Maximum allowed header value size in bytes.
         * @default 2048
         */
        maxHeaderValueSize?: number;

        /**
         * Maximum allowed request body (payload) size in bytes.
         * @default 3145728 (3MB)
         * @recommended 1MB – 10MB
         */
        maxContentSize?: number;

        /**
         * Socket timeout duration in milliseconds.
         * 0 disables timeout.
         * @default 3000
         */
        timeout?: number;

        /**
         * Determines behavior when `Content-Length` or `Transfer-Encoding` is missing.
         *
         * false → close immediately  
         * true → wait until stream ends
         *
         * @default false
         */
        untilEnd?: boolean;

        /**
         * Maximum number of concurrent requests/connections.
         * Also defines internal pool size.
         * @default 5000
         * @recommended 5000 – 10000
         */
        maxRequests?: number;

        /**
         * Custom response constructor.
         * Extend `PipeResponseBase` to implement JSON/XML/custom responses.
         */
        ResponseCtor?: typeof PipeResponseBase;

        /**
         * Callback triggered when a new pool chunk is created during bootstrap.
         */
        bootstrapPoolChunkProgression?: (createdChunkProgression: ChunkProgression) => void;

        /**
         * Maximum allowed request query string size in bytes.
         * @default 2048
         */
        requestQuerySize?: number;
    }


    /**
     * @interface ServerState
     * @description Holds the runtime configuration state of the server.
     * @property {string} corsHeaders - The pre-built string of CORS response headers.
     * @property {number} maxHeaderNameSize - The maximum allowed request header name size (bytes).
     * @property {number} maxHeaderValueSize - The maximum allowed request header value size (bytes).
     * @property {number} maxContentSize - The maximum allowed request body size (bytes).
     * @property {number} timeout - The socket timeout duration (milliseconds).
     * @property {boolean} untilEnd - Whether to wait until the end of the stream when Content-Length/Transfer-Encoding is missing.
     * @property {number} requestQuerySize - Request Query Size
     * @property {number} maxRequests - Max requests
     * @property {typeof PipeResponseBase} ResponseCtor - The constructor function of the Response class in use.
     */
    export interface ServerState {
        corsHeaders: string;
        maxHeaderSize: number;
        maxHeaderNameSize: number;
        maxHeaderValueSize: number;
        maxContentSize: number;
        timeout: number;
        untilEnd: boolean;
        requestQuerySize: number;
        maxRequests: number;
        ResponseCtor: typeof PipeResponseBase;
    }

    export interface Middleware {
        handle: MiddlewareHandleFn;
    }

    export type AccumulateHandleFn = (socket: net.Socket, p: ChunkProgression) => void;

    /**
     * Represents a single HTTP endpoint bound to a specific route + method.
     * Contains handler, middleware chain and per-endpoint limits.
     */
    export interface Endpoint {

        /**
         * URL path segment of the endpoint.
         * Example: "/users", "/:id"
         */
        url: string;

        /**
         * HTTP method handled by this endpoint.
         */
        method: HttpMethod;

        /**
         * Optional content configuration (type/encoding rules).
         */
        ct?: ContentConfig;

        /**
         * Optional custom accumulate handler used during request parsing.
         * Overrides default accumulation behavior.
         */
        accumulateHandle?: AccumulateHandleFn;

        /**
         * Middleware chain executed before the main handler.
         */
        middlewares: Middleware[];

        /**
         * Adds a middleware to this endpoint.
         * @returns {Endpoint} same endpoint (chainable)
         */
        addMiddleware(mw: Middleware): Endpoint;

        /**
         * Main request handler function.
         */
        handle: EndpointHandleFn | any;

        /**
         * If true, waits until stream end even if
         * `Content-Length` / `Transfer-Encoding` is missing.
         *
         * Overrides global server setting.
         * @default false
         */
        untilEnd?: boolean;

        /**
         * Maximum request body size allowed for this endpoint.
         * Overrides global server limit.
         */
        maxContentSize?: number;

        /**
         * Maximum header size allowed for this endpoint.
         * Overrides global server limit.
         */
        maxHeaderSize?: number;
    }

    /**
     * Optional per-endpoint configuration overrides.
     * Used when creating endpoints to customize limits locally.
     */
    export interface EndpointOpt {

        /**
         * Overrides global `untilEnd` behavior.
         * @default false
         */
        untilEnd?: boolean;

        /**
         * Overrides global maximum content size.
         */
        maxContentSize?: number;

        /**
         * Overrides global maximum header size.
         */
        maxHeaderSize?: number;
    }

    /**
     * Represents a routing node in the HTTP routing tree.
     *
     * A route can:
     * - contain endpoints
     * - contain middlewares
     * - contain nested sub-routes
     *
     * Works similar to Express/Fastify router groups.
     */
    export interface Route {

        /**
         * Base URL path segment for this route.
         * Example: "/users"
         */
        url: string;

        /**
         * Endpoints registered for this route.
         */
        endpoints: Endpoint[];

        /**
         * Middlewares applied to this route and all child routes.
         */
        middlewares: Middleware[];

        /**
         * Nested child routes.
         */
        routes: Route[];

        /**
         * Adds a child route.
         * @returns {Route} same route (chainable)
         */
        addRoute(r: Route): Route;

        /**
         * Adds an endpoint to this route.
         * @returns {Route} same route (chainable)
         */
        addEndpoint(ep: Endpoint): Route;

        /**
         * Adds a middleware to this route.
         * @returns {Route} same route (chainable)
         */
        addMiddleware(mw: Middleware): Route;
    }

    export interface BuildedRoute {
        method: string;
        route: string;
        vptrTableIndex: number;
    }

    export interface Accumulate {
        handle: Function;
    }

    export type CompressionFn = (b: Buffer) => Buffer | null;
    export type DecompressionFn = (b: Buffer) => Buffer | null;

    export interface ContentDecoding {
        gzip?: DecompressionFn,
        br?: DecompressionFn,
        deflate?: DecompressionFn,
    }

    export interface ContentEncoding {
        gzip?: CompressionFn;
        br?: CompressionFn;
        deflate?: CompressionFn;
    }

    export type BodyParserFn = (b: Buffer) => Buffer | null;

    export type ContentTypeParser = {
        [K in ContentTypeTables]?: BodyParserFn | null;
    } & {
        [key: string]: BodyParserFn | null | undefined;
    };

    enum ContentTypeTables {
        JSON = 'application/json',
        URL_ENCODED_FORM = 'application/x-www-form-urlencoded',
        MULTIPART_FORM = 'multipart/form-data',
        TEXT_PLAIN = 'text/plain',
        HTML = 'text/html',
        CSS = 'text/css',
        JAVASCRIPT = 'application/javascript',
        OCTET_STREAM = 'application/octet-stream',
        XML = 'application/xml',
    }

    export enum ContentEncodingTables {
        gzip = "gzip",
        br = "br",
        deflate = "deflate",
    }

    /**
     * Defines content negotiation and parsing rules for an endpoint.
     *
     * Controls how request bodies are interpreted and decoded
     * based on Content-Type and Content-Encoding headers.
     */
    export interface ContentConfig {

        /**
         * Expected content type of the request body.
         *
         * If undefined → any type is accepted.
         */
        type?: ContentTypeTables | null;

        /**
         * Expected content encoding (gzip, br, deflate, etc.).
         *
         * If undefined → no decoding is applied.
         */
        encoding?: ContentEncodingTables | null;
    }

    /**
     * Internal compiled route representation used at runtime.
     *
     * Created after the routing tree is built.
     * Contains fully prepared handlers, middleware chain and limits
     * for fast request dispatching.
     */
    export interface RoutePipe {

        /**
         * Function responsible for accumulating and parsing
         * incoming socket data into a request.
         */
        accumulateHandler(
            socket: net.Socket,
            chunkProgression: ChunkProgression
        ): void;

        /**
         * Full normalized route URL.
         * Example: "/users/:id"
         */
        url: string;

        /**
         * Optional content configuration for this route.
         */
        ct?: ContentConfig;

        /**
         * Precompiled pipeline handler (middlewares + endpoint handler).
         */
        pipeHandler: Function;

        /**
         * Ordered middleware handlers executed before the endpoint.
         */
        mws: Http.MiddlewareHandleFn[];

        /**
         * Response constructor used to create response objects
         * for this route.
         */
        ResponseCtor: typeof PipeResponseBase;

        /**
         * Internal route identifier (used for fast lookup/dispatch).
         */
        routeId: number;

        /**
         * Determines whether to wait for stream end when
         * Content-Length / Transfer-Encoding is missing.
         */
        untilEnd: boolean;

        /**
         * Maximum allowed request body size in bytes for this route.
         */
        maxContentSize: number;

        /**
         * Maximum allowed header size in bytes for this route.
         */
        maxHeaderSize: number;
    }


    export type ParseInitialFn = (
        socket: net.Socket,
        chunk: Buffer,
        p: Http.ChunkProgression
    ) => void;

    /**
     * Configuration options for the Web HTTP context.
    */
    export interface WebContextState {
        /**
         * Physical folder name where static files are served from.
         * @default "dist"
         * @example "./dist", "./build", "./public"
        */
        publicStaticPath?: string;

        /**
         * URL route prefix for static assets.
         * @default "/public"
         * @example "/assets" -> http://host/assets/logo.png
        */
        publicStaticRoute?: string;

        /**
         * Entry HTML file for SPA fallback (used when route not found).
         * @default "dist/index.html"
        */
        spaRootPath?: string;
    }

    /**
     * @interface ChunkProgression
     * @description Represents the state and context of a single HTTP request connection (socket) as it is being parsed.
     * It manages the progression through the request parsing stages (request line, headers, body).
     */
    export interface ChunkProgression {
        /**
         * @method fn
         * @description The current parsing function to be executed when new data (chunk) arrives on the socket.
         * This function changes based on the request parsing state (e.g., from `parseInitial` to `parseHeader`, etc.).
         * @param {net.Socket} socket - The active network socket connection.
         * @param {Buffer} chunk - The newly received data buffer.
         * @param {Http.ChunkProgression} chunkProgression - A self-reference to the current state object.
         */
        fn: ParseInitialFn;

        /**
         * @method free
         * @description Releases this ChunkProgression object back to its object pool (`cPool`) for reuse.
         * This is crucial for performance and memory management (pooling strategy).
         */
        free(): void;

        /**
         * @method reset
         * @description Resets all internal fields and properties to their initial state, preparing the object for a new incoming request.
         */
        reset(): void;

        /**
         * @method allocateResp
         * @description Allocates a pre-initialized `PipeResponseBase` object from the response pool for the current request.
         * @returns {PipeResponseBase} A reusable response object.
         */
        allocateResp(): PipeResponseBase;

        /**
         * @property {number} objId
         * @description The unique identifier of this object within its associated object pool.
         * This ID is necessary for the `free()` method to return the object to the correct pool slot.
         */
        objId: number;

        /**
         * @property {Record<string, string>} headers
         * @description A map containing the parsed HTTP request headers (key-value pairs).
         */
        headers: Record<string, string>;

        /**
         * @property {number} headerSize
         * @description The size, in bytes, of the currently accumulated raw header data.
         * Used primarily during multi-chunk header parsing to track progress against `maxHeaderSize`.
         */
        headerSize: number;

        /**
         * @property {RoutePipe} routePipe
         * @description A reference to the specific route/endpoint handler object (`RoutePipe`) matched by the request URL and method.
         * It points to the function chain that will process the request.
         */
        routePipe: RoutePipe;

        /**
         * @property {string[]} params
         * @description An array of values extracted from the URL path as route parameters (e.g., `/users/:id` extracts `id`'s value).
         */
        params: string[];

        /**
         * @property {Record<string, string>} query
         * @description A map containing the parsed URL query string parameters (e.g., `?a=1&b=2`).
         */
        query: Record<string, string>;

        /**
         * @property {RetFlagBits} retFlag
         * @description A flag indicating the result of the last parsing operation.
         * Used to signal various states, including successful parsing (`OK`) or specific error conditions (e.g., `NOT_FOUND`, `MAX_HEADER_SIZE`).
         */
        retFlag: RetFlagBits;

        /**
         * @property {HttpMethod} method
         * @description The HTTP method of the current request (e.g., GET, POST, PUT).
         */
        method: HttpMethod;

        /**
         * @property {number} mainOffset
         * @description The byte offset within `rawBuf` where the **request body** begins (i.e., immediately after the double CRLF following the headers).
         * This is essential for separating headers from body data.
         */
        mainOffset: number;

        /**
         * @property {number | undefined} contentLen
         * @description The expected length of the request body, as indicated by the 'Content-Length' header.
         * Undefined if the header is not present.
         */
        contentLen: number | undefined;

        /**
         * @property {Buffer} rawBuf
         * @description A buffer holding the raw incoming request data, including the request line and headers.
         * If the headers and body arrive in the same chunk, `rawBuf` will contain the body part as well until it is fully processed.
         */
        rawBuf: Buffer;

        /**
         * @property {ChunkParser} chunkParser
         * @description An internal object responsible for parsing chunked transfer encoding body data.
         * Only used when the request uses 'Transfer-Encoding: chunked'.
         */
        chunkParser: ChunkParser;
    }

    /**
     * Minimal public contract for a response object.
     *
     * Allows setting headers, status and sending content,
     * then serializing into a raw HTTP buffer.
     */
    export interface IHttpResponseBase {

        /** Sets HTTP status code. */
        setStatus(code: number): this;

        /** Sets a single header. */
        setHeader(key: string, value: string): this;

        /** Sets multiple headers at once. */
        setHeaders(obj: Record<string, string>): this;

        /** Sends plain text payload. */
        send(payload: string): void;

        /** Sends JSON payload. */
        json(obj: unknown): void;

        /** Sends redirect response. */
        redirect(url: string, code?: number): void;

        /** Produces raw HTTP buffer for socket write. */
        getResp(): Buffer;

        /** Releases object back to pool. */
        freeCPool(): void;
    }

}
