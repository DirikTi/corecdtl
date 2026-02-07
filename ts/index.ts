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

export { createServer };

export * from "./http";
