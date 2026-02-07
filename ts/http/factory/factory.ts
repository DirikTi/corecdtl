import { Http } from "../../http";

function validateRouteUrl(url: string) {
    if (url.includes("//")) {
        throw new Error(`Route URL contains '//' double-slash: ${url}`);
    }

    // Split and remove empty segments to avoid false positives
    const segments = url.split("/").filter(Boolean);
    const nameRegex = /^[a-zA-Z0-9_]+$/;

    for (const seg of segments) {

        // Parameter segment ":id"
        if (seg.startsWith(":")) {
            const name = seg.slice(1);
            if (!name)
                throw new Error(`Empty parameter name ':' in route: ${url}`);
            if (!nameRegex.test(name))
                throw new Error(`Invalid parameter name '${name}' in route: ${url}`);
            continue;
        }

        // Wildcard segment "*rest"
         if (seg.startsWith("*")) {
            const name = seg.slice(1);
            
            // "*" is VALID → unnamed wildcard
            if (name && !nameRegex.test(name)) {
                throw new Error(`Invalid wildcard name '${name}' in route: ${url}`);
            }
            continue;
        }

        // Regular segments have no special constraints for now
    }

    return true;
}

function normalizeRouteUrl(url: string): string {
    if (typeof url !== "string") url = String(url);

    // Convert Windows-style slashes
    url = url.replace(/\\/g, "/");

    // Collapse duplicate slashes (but do not force a leading slash)
    url = url.replace(/\/{2,}/g, "/");

    // If the whole route is just "/", return as-is
    if (url === "/") return "/";

    // Remove trailing slash
    if (url.endsWith("/")) {
        url = url.slice(0, -1);
    }

    return url;
}

function createRoute(url: string): Http.Route {
    url = normalizeRouteUrl(url);
    validateRouteUrl(url);

    return {
        routes: [],
        endpoints: [],
        middlewares: [],
        url,

        addRoute(r) {
            (this as Http.Route).routes.push(r);
            return this;
        },

        addMiddleware(mw) {
            (this as Http.Route).middlewares.push(mw);
            return this;
        },

        addEndpoint(ep) {
            (this as Http.Route).endpoints.push(ep);
            return this;
        }
    }
}


function createMiddleware(handle: Http.MiddlewareHandleFn | any) : Http.Middleware {
    return {
        handle
    }
}

function createEndpoint(
    method: Http.HttpMethod,
    url: string,
    handle: Http.EndpointHandleFn | null,
    ct?: Http.ContentConfig,
    cfg?: Http.EndpointOpt,
    accumulateHandle?: Http.AccumulateHandleFn
): Http.Endpoint {
    url = normalizeRouteUrl(url);
    validateRouteUrl(url);
    return {
        middlewares: [],
        
        url,
        method,
        handle,
        ct,
        
        maxContentSize: cfg?.maxContentSize,
        maxHeaderSize: cfg?.maxHeaderSize,
        untilEnd: cfg?.untilEnd,
        accumulateHandle,
        addMiddleware(mw) {
            (this as Http.Endpoint).middlewares.push(mw);
            return this;
        },        
    }
}

export {
    createRoute,
    createMiddleware,
    createEndpoint,
}