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
        FLAG_OK                        = 0x0000,
        FLAG_BAD_REQUEST               = 0x0001,
        FLAG_METHOD_NOT_ALLOWED        = 0x0002,
        FLAG_NOT_FOUND                 = 0x0004,
        FLAG_CORS_PREFLIGHT            = 0x0008,
        FLAG_HTTP_VERSION_UNSUPPORTED  = 0x0010,
        FLAG_CONTENT_LENGTH_TOO_LARGE  = 0x0020,
        FLAG_MISSING_HOST              = 0x0040,
        FLAG_HAS_BODY                  = 0x0080,
        FLAG_INVALID_ARGUMENT          = 0x0100,
        FLAG_INVALID_HEADER            = 0x0200,
        FLAG_INVALID_HEADER_VALUE      = 0X0300,
        FLAG_INVALID_CONTENT_LENGTH    = 0x0400,
        FLAG_CONTENT_LENGTH_EXCEEDED   = 0x0800,
        FLAG_UNTERMINATED_HEADERS      = 0x1000,
        FLAG_MAX_HEADER_SIZE           = 0X2000,
        FLAG_MAX_HEADER_NAME_SIZE      = 0X2100,
        FLAG_MAX_HEADER_VALUE_SIZE     = 0X2200,
        FLAG_DUPLICATE_SINGLE_HEADER   = 0X3000,
        FLAG_REQUEST_QUERY_EXCEEDED    = 0X4000,
        FLAG_REQUEST_URL_EXCEEDED      = 0X5000,
        FLAG_SMUGGING_TE_CL            = 0x6000
    }

    /**
     * @interface Server
     * @description Defines the public methods and properties of the Http server instance.
     * It is used to configure and manage the server settings and lifecycle.
     */
    export interface Server {

        /**
         * @method enableCors
         * @description Enables and configures Cross-Origin Resource Sharing (CORS) for the server.
         * @param {CorsConfig} opts - CORS configuration options.
         * @returns {this} The server instance for chaining.
         */
        enableCors(opts: CorsConfig): this;

        // --- Server Configuration Getters/Setters ---

        /**
         * @method setTimeout
         * @description Sets the connection timeout value.
         * @param {number} timeout - Timeout duration in milliseconds. Must be greater than 0.
         */
        setTimeout(timeout: number): void;

        /**
         * @method setRequestQuerySize
         * @description Sets the maximum allowed size for the request query string.
         * @param {number} requestQuerySize - Maximum query string size in bytes. Must be greater than 0.
         */
        setRequestQuerySize(requestQuerySize: number): void;

        /**
         * @method setMaxHeaderSize
         * @description Sets the maximum allowed size for request headers.
         * @param {number} maxHeaderSize - Maximum header size in bytes. Must be greater than 0.
         */
        setMaxHeaderSize(maxHeaderSize: number): void;

        /**
         * @method setMaxContentSize
         * @description Sets the maximum allowed size for the request body (content/payload).
         * @param {number} maxContentSize - Maximum content size in bytes. Must be greater than 0.
         */
        setMaxContentSize(maxContentSize: number): void;

        /**
         * @method getTimeout
         * @description Gets the current connection timeout value.
         * @returns {number} The timeout duration in milliseconds.
         */
        getTimeout(): number;

        /**
         * @method getRequestQuerySize
         * @description Gets the current maximum request query string size.
         * @returns {number} The maximum query string size in bytes.
         */
        getRequestQuerySize(): number;

        /**
         * @method getMaxHeaderSize
         * @description Gets the current maximum request header size.
         * @returns {number} The maximum header size in bytes.
         */
        getMaxHeaderSize(): number;

        /**
         * @method getMaxContentSize
         * @description Gets the current maximum request content size.
         * @returns {number} The maximum content size in bytes.
         */
        getMaxContentSize(): number;

        // --- Server Lifecycle Methods ---

        /**
         * @property {boolean} listening
         * @description A boolean indicating whether or not the server is listening for connections.
         */
        listening: boolean;

        /**
         * @method listen
         * @description Starts the server listening for connections.
         * @param {number} [port] - The port to listen on.
         * @param {string} [hostname] - The host name or IP address to listen on.
         * @param {() => void} [listeningListener] - Callback function once the server starts listening.
         * @param {number} [backlog] - The maximum length of the queue of pending connections.
         * @returns {this} The server instance for chaining.
         */
        listen(port?: number, hostname?: string, listeningListener?: () => void, backlog?: number): this;

        /**
         * @method address
         * @description Returns the bound address, address family name, and port of the server.
         * @returns {net.AddressInfo | string | null} The address info.
         */
        address(): net.AddressInfo | string | null;

        // --- Resource Management ---

        /**
         * @method setMaxRequests
         * @description Sets the maximum number of concurrent requests the server can handle by resizing internal pools.
         * @param {number} n - The maximum number of concurrent requests. Must be 1 or greater.
         * @returns {boolean} Returns `true` if the pools were successfully resized, `false` otherwise.
         */
        setMaxRequests: (n: number) => boolean;

        /**
         * @method getMaxListeners
         * @description Gets the current maximum listener value.
         * @returns {number} The maximum number of listeners.
         */
        getMaxListeners(): number;

        /**
         * @method setMaxListeners
         * @description Sets the max number of listeners.
         * @param {number} n - The maximum number of listeners.
         * @returns {this} The server instance for chaining.
         */
        setMaxListeners(n: number): this;

        // --- Event Handling (net.Server methods) ---

        /**
         * @method on
         * @description Registers an event listener for the 'close' event.
         */
        on(event: 'close', listener: () => void): this;

        /**
         * @method on
         * @description Registers an event listener for the 'connection' event.
         */
        on(event: 'connection', listener: (socket: net.Socket) => void): this;

        /**
         * @method on
         * @description Registers an event listener for the 'error' event.
         */
        on(event: 'error', listener: (err: Error) => void): this;

        /**
         * @method on
         * @description Registers an event listener for the 'listening' event.
         */
        on(event: 'listening', listener: () => void): this;

        /**
         * @method on
         * @description Registers a listener for any specified event.
         * @param {string} event - The name of the event.
         * @param {Function} listener - The callback function.
         */
        on(event: string, listener: (...args: any[]) => void): this;

        /**
         * @method off
         * @description Removes a registered listener for the specified event.
         * @param {string} event - The name of the event.
         * @param {Function} listener - The callback function to remove.
         */
        off(event: string, listener: (...args: any[]) => void): this;

        // --- Stop Server ---

        /**
         * @method close
         * @description Stops the server from accepting new connections and keeps existing connections.
         * @param {(err?: Error) => void} [callback] - Called when the server has closed.
         * @returns {this} The server instance for chaining.
         */
        close(callback?: (err?: Error) => void): this;
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
     * @interface ServerOptions
     * @description Options used to configure the behavior of the Http server.
     * @property {net.ServerOpts} netServerOptions - Options passed to the underlying Node.js net.Server structure.
     * @property {number} [maxHeaderSize=2048] - The maximum allowed request header size (bytes). (Recommended: 2048 - 4096)
     * @property {number} [maxContentSize=3145728] - The maximum allowed request content/payload size (bytes). (Recommended: 1MB - 10MB)
     * @property {number} [timeout=0] - Socket timeout duration (milliseconds). (3000: No timeout)
     * @property {boolean} [untilEnd=false] - Determines if the server should wait for the end of the stream when Content-Length or Transfer-Encoding are not specified.
     * If `false` and these headers are missing, the request is closed immediately and ignored (Default behavior).
     * If `true`, it waits until the end of the stream.
     * @property {number} [maxRequests=5000] - The maximum number of simultaneous requests/connections that can be processed. Also determines the pool size. (Recommended: 5000 - 10000)
     * @property {typeof PipeResponseBase} ResponseCtor - The constructor function for the custom Response class to be used for requests.
     * Can be used by extending `PipeResponseBase` to add your own custom response types (e.g., for JSON, XML, etc.).
     * @property {number} [requestQuerySize=2048] - The maximum allowed request query string size (bytes). (Recommended: 1024 - 4096)
     */
    export interface ServerOptions {
        netServerOptions?: net.ServerOpts
        maxHeaderSize?: number;
        maxHeaderNameSize?: number;
        maxHeaderValueSize?: number;
        maxContentSize?: number;
        timeout?: number;
        untilEnd?: boolean;
        maxRequests?: number;
        ResponseCtor?: typeof PipeResponseBase;
        bootstrapPoolChunkProgression?: (createdChunkProgression: ChunkProgression) =>  void;
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

    export interface Endpoint {
        url: string;
        method: HttpMethod;
        ct?: ContentConfig;
        accumulateHandle?: AccumulateHandleFn;
        middlewares: Middleware[];
        addMiddleware(mw: Middleware): Endpoint;
        handle: EndpointHandleFn | any;

        untilEnd?: boolean;
        maxContentSize?: number;
        maxHeaderSize?: number;
    }
    
    export interface EndpointOpt {
        untilEnd?: boolean;
        maxContentSize?: number;
        maxHeaderSize?: number;
    }

    /**
     * @interface Route
     * @description Defines a routing structure for the Http server.
     * It is the basic building block of the routing tree.
     * @property {string} url - The URL path segment this route will match (e.g., '/users').
     * @property {Endpoint[]} endpoints - Endpoints corresponding to HTTP methods for this route.
     * @property {Middleware[]} middlewares - Middleware functions to run for requests to this route and its sub-routes.
     * @property {Route[]} routes - Nested sub-routes under this route.
     * @method addRoute - Adds a new sub-route.
     * @method addEndpoint - Adds a new endpoint.
     * @method addMiddleware - Adds a new middleware.
     */
    export interface Route {
        url: string;
        endpoints: Endpoint[];
        middlewares: Middleware[];
        routes: Route[];
        addRoute(r: Route): Route;
        addEndpoint(ep: Endpoint): Route;
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

    export interface ContentConfig {
        type: ContentTypeTables | null | undefined;
        encoding: ContentEncodingTables | null | undefined
    }

    export interface RoutePipe {
        accumulateHandler(socket: net.Socket, chunkProgression: ChunkProgression): void;
        url: string;
        ct?: ContentConfig;
        pipeHandler: Function;
        mws: Http.MiddlewareHandleFn[];
        ResponseCtor: typeof PipeResponseBase;
        routeId: number;

        untilEnd: boolean;
        maxContentSize: number;
        maxHeaderSize: number;
    }

    export type ParseInitialFn = (
        socket: net.Socket,
        chunk: Buffer,
        p: Http.ChunkProgression
    ) => void;

    export interface WebContextState {
        publicStaticPath?: string;
        publicStaticRoute?: string;
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
}
