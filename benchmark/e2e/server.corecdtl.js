import fs from "fs";
import path from "path";

import { createServer } from "../../dist/index.js";
import * as CoreCDTLFactory from "../../dist/http/factory/factory.js";
import { Http } from "../../dist/http.js";
import { contentParserTable } from "../../dist/http/content/parser.js";
import { contentDecodingTable } from "../../dist/http/content/encoding.js";

const routes = JSON.parse(
  fs.readFileSync(
    path.resolve("benchmark/e2e/data/routes.json"),
    "utf-8"
  )
);

export function startCoreCDTLServer(port = 3000) {

  const root = CoreCDTLFactory.createRoute("/api/v1");
  const middlewares = Array(15);

  for (let i = 0; i < middlewares.length; i++ ) {
    middlewares[i] = CoreCDTLFactory.createMiddleware((req, res) => {
      req.xBenchmarkStep = i;
      res.setHeader("X-Benchmark-Step-" + req.xBenchmarkStep, "tests");
    });
  }

  for (const mw of middlewares) {
    root.addMiddleware(mw);
  }

  // ---- DYNAMIC ROUTES ----
  for (const r of routes) {
    const base = CoreCDTLFactory.createRoute(r.path);

    base.addEndpoint(
      CoreCDTLFactory.createEndpoint(
        Http.HttpMethod[r.method],
        "",
        (req, res) => {
          res.json({ ok: true }, 0);
        },
        {
          encoding: null,
          type: "application/json"
        },
        undefined,
        (socket, p) => {
          const h = p.headers;
          const contentLenStr = h["content-length"];
          p.contentLen = parseInt(contentLenStr);
          const already = p.rawBuf.slice(p.mainOffset);

          if (already.length === p.contentLen) {
            p.routePipe.pipeHandler(
                already, p, contentParserTable, contentDecodingTable, p.routePipe.mws, (ret) => {
                    socket.write(ret);

                    if (h.connection == "close") {
                        socket.destroySoon();
                    }
                    else {
                        p.reset();
                        socket.resume();
                    }
                }
            )

            return;
          }
        }
      )
    );
    
    root.addRoute(base);
  }
  const api = createServer({
    timeout: 10_000,
    untilEnd: false
  }).Api(root);

  api.listen(port);
  console.log(`[CoreCDTL] API server listening on :${port}`);
}