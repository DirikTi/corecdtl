import path from "path";
import { Http } from "../../http";
import { createAccumulators } from "./accumulator";
import { createPipeline } from "./pipeline";
import fs from "fs";
import { createEndpoint } from "./factory";

export class RouteBuilder {
    protected accumulators!: ReturnType<typeof createAccumulators>;
    protected routePipes!: Http.RoutePipe[];
    protected _Route!: Http.Route;

    constructor(accumulators: ReturnType<typeof createAccumulators>, route: Http.Route) {
        this.accumulators = accumulators;
        this._Route = route;
    }

    static getMethodStr(method: Http.HttpMethod) {
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

    static normalizeRoutePattern(route: string): string {
        let normalized = route.replace(/:([^\/]*)/g, ':');

        if (normalized.endsWith(':')) {
            normalized += '/';
        }

        return normalized;
    }

    static decisionMaker(accumulators: ReturnType<typeof createAccumulators>, ep: Http.Endpoint)  {
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

    public buildOpenApi() {

        const paths: Record<string, any> = {};
        const tags: Record<string, boolean> = {};

        function walk(route: Http.Route, baseUrl: string) {

            const fullBase = baseUrl + route.url;

            // Route'dan tag üret
            const tagName = route.url
                .replace(/\//g, "")
                .replace(/-/g, " ")
                .trim();

            for (const ep of route.endpoints) {

                const fullPath = RouteBuilder.normalizeRoutePattern(fullBase + ep.url);
                const method = RouteBuilder.getMethodStr(ep.method).toLowerCase();

                if (!paths[fullPath]) {
                    paths[fullPath] = {};
                }

                if (tagName) {
                    tags[tagName] = true;
                }

                paths[fullPath][method] = {
                    tags: tagName ? [tagName] : [],
                    summary: "",
                    responses: {
                        "200": {
                            description: "Successful response"
                        }
                    }
                };
            }

            for (const child of route.routes) {
                walk(child, fullBase);
            }
        }

        walk(this._Route, "");

        return {
            openapi: "3.0.0",
            info: {
                title: "API",
                version: "1.0.0"
            },
            tags: Object.keys(tags).map((t) => ({ name: t })),
            paths
        };
    }

    public buildRoute(state: Http.ServerState) {
        let buildedRoutes: Http.BuildedRoute[] = [];
        let routePipes: Http.RoutePipe[] = [];
        let accumulators = this.accumulators;

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
                let accumulateHandler = RouteBuilder.decisionMaker(accumulators, ep);
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
                    method: RouteBuilder.getMethodStr(ep.method),
                    route: RouteBuilder.normalizeRoutePattern(url + ep.url), 
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

        buildSubTree(this._Route, this._Route.url, []);

        this.routePipes = routePipes;

        return buildedRoutes
    }

    public setSwagger(conf: Http.SwaggerConfig) {
        const docsUrl = conf.url ?? "/docs";

        const openApiEndpoint = docsUrl + "/openapi.json";

        let openApiDoc: Record<string, any> | undefined = undefined;

        if (conf.openApiPath) {
            try {

                const filePath = path.resolve(conf.openApiPath);
                const fileContent = fs.readFileSync(filePath, "utf8");

                openApiDoc = JSON.parse(fileContent);

            } catch (err) {
                console.error("Failed to read OpenAPI file:", err);
                return;
            }
        } else {
            openApiDoc = this.buildOpenApi();
        }

        if (!openApiDoc) {
            console.error("OpenAPI document could not be created.");
            return;
        }

        const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Swagger UI</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
</head>

<body>
<div id="swagger-ui"></div>

<script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>

<script>
window.onload = () => {
    SwaggerUIBundle({
        url: "${this._Route.url + openApiEndpoint}",
        dom_id: "#swagger-ui"
    });
};
</script>

</body>
</html>
        `;

        const ep = createEndpoint(Http.HttpMethod.GET, docsUrl,
            (req, res) => {
                res.setHeader("Content-Type", "text/html");
                res.send(html);
            }, {
            type: Http.ContentTypeTables.HTML
        });

        const epOpenApi = createEndpoint(Http.HttpMethod.GET, openApiEndpoint,
            (req, res) => {
                res.json(openApiDoc);
            });

        this._Route.addEndpoint(ep);
        this._Route.addEndpoint(epOpenApi);
        return html;        
    }

    public getRoutePipes() {
        return this.routePipes;
    }
}