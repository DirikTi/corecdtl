import fs from "fs";
import path from "path";
import express from "express";

const routes = JSON.parse(
  fs.readFileSync(path.resolve("benchmark/e2e/data/routes.json"))
);

export function startExpressServer(port = 3001) {
  const app = express();
  app.use(express.json());

  const middlewares = Array(15);

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
    app.put("/api/v1" + r.path, (req, res) => {
      res.json({ ok: true });
    });
  }

  app.get("/api/eren", (req, res) => {
    res.send("Test 123");
  });

  app.listen(port);
}