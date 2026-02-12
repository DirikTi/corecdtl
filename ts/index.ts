import { Http } from "./http";
import WebContext from "./http/context/WebContext";
import ApiContext from "./http/context/ApiContext";

function createServer(opts?: Http.ServerOptions) {
    return {
        Web(webCtxOpts: Http.WebContextState, mainRoute?: Http.Route) {
            const ctx = new WebContext(webCtxOpts, opts);
            ctx.setHttpCore();
            ctx.registerRouters(mainRoute);
            return ctx;
        },
        Api(mainRoute: Http.Route) {
            const ctx = new ApiContext(opts);
            ctx.setHttpCore();
            ctx.registerRouters(mainRoute);
            return ctx;
        }
    }
}

// ================================
// Server entry
// ================================
export { createServer };


// ================================
// Core types (main public API)
// ================================
export * from "./http";
export * from "./http/response/PipeResponseBase";

// ================================
// Factories / Builders
// ================================
export * as Factory from "./http/factory/factory";
export * as Pipeline from "./http/factory/pipeline";
export * as Accumulator from "./http/factory/accumulator";


// ================================
// Content layer
// ================================
export * as Content from "./http/content/encoding";
export { contentParserTable } from "./http/content/parser";


// ================================
// Low-level engine (advanced users)
// ================================
export * as Chunker from "./http/chunker/ChunkParser";
export * as ChunkProgression from "./http/chunker/ChunkProgression";
export * as Streaming from "./http/chunker/StreamingChunkedParser";
export * as Fixed from "./http/chunker/FixedChunkedParser";
export * as UntilEnd from "./http/chunker/UntilEndChunkerParser";
