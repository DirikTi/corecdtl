import fs from "fs";
import path from "path";
import Fastify from "fastify";

const routes = JSON.parse(
  fs.readFileSync(path.resolve("benchmark/e2e/data/routes.json"))
);

export async function startFastifyServer(port = 3002) {
  const app = Fastify();

  const middlewares = Array(15);

  await app.register(import('@fastify/express'));

  for (let i = 0; i < middlewares.length; i++ ) {
    middlewares[i] = ((req, res, next) => {
      req.xBenchmarkStep = i;
      res.setHeader("X-Benchmark-Step-" + req.xBenchmarkStep, "tests");
      next();
    });
  }

  for (const mw of middlewares) {
    app.use(mw);
  }

  for (const r of routes) {
    app.put("/api/v1" + r.path, async () => {
      return { ok: true };
    });
  }

  await app.listen({ port });
}