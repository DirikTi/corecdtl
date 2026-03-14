import { hypernode } from "../dist/hypernode.js";
import { createServer } from "../dist/index.js";
import * as CoreCDTLFactory from "../dist/http/factory/factory.js";
import { Http } from "../dist/http.js";

const httpCore = new hypernode.HttpCore();

const MAX_HEADER_NAME_SIZE = 8 * 1024;
const MAX_HEADER_VALUE_SIZE = 8 * 1024;
const MAX_CONTENT_LENGTH = 1024 * 1024;
const QUERY_LIMIT = 10;

function freshReqObj() {
  return {
    retFlag: 0,
    mainOffset: 0,
    headerSize: 0,
    headers: {},
    method: 0,
    params: [],
    query: {},
  };
}

const root = CoreCDTLFactory.createRoute("/api/v1");

for (let i = 0; i < 15; i++ ) {
    const mw = CoreCDTLFactory.createMiddleware((req, res) => {
        req.xBenchmarkStep = i;
        res.setHeader("X-Benchmark-Step-" + req.xBenchmarkStep, "tests");
    });

    root.addMiddleware(mw);
}

const base = CoreCDTLFactory.createRoute("/users");

const ep = CoreCDTLFactory.createEndpoint(
    Http.HttpMethod.GET,
    "",
    (req, res) => {
        res.json({ ok: true }, 0);
    },
    {
        encoding: null,
        type: "application/json"
    },
    undefined
);

const authBase = CoreCDTLFactory.createRoute("/auth");

const epAuth = CoreCDTLFactory.createEndpoint(
    Http.HttpMethod.POST,
    "/login",
    (req, res) => {
        res.json({ ok: true }, 0);
    },
    {
        encoding: null,
        type: "application/json"
    },
    undefined
);

base.addEndpoint(ep);
authBase.addEndpoint(epAuth);

root.addRoute(base);
root.addRoute(authBase);

const api = createServer({
    timeout: 10_000,
    untilEnd: false,
    
}).Api(root);

api.listen(3000);
console.log(`[CoreCDTL] API server listening on :3000`);