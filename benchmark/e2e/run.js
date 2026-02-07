import autocannon from "autocannon";
import { realisticHeaders } from "./headers.js";

import { startCoreCDTLServer } from "./server.corecdtl.js";
import { startExpressServer } from "./server.express.js";
import { startFastifyServer } from "./server.fastify.js";
import fs from "fs"

const TARGET_PATH =
  "/api/v1/user/profile/settings"; // routes.json içinden biri

let connections = process.env.connections
if (connections) {
  connections = parseInt(connections);
  if (connections < 0) {
    connections = 100;
  }
} else {
  connections = 100;
}

let duration = process.env.duration
if (duration) {
  duration = parseInt(duration);
  if (duration < 0) {
    duration = 15;
  }
} else {
  duration = 15;
}

function run(name, url) {
  return new Promise((resolve) => {
    autocannon(
      {
        url: url + TARGET_PATH,
        method: "PUT",
        headers: realisticHeaders,
        body: JSON.stringify({ a: 1 }),
        connections: connections,
        pipelining: 1,
        duration: duration,
      },
      (_, result) => {
        fs.writeFileSync(name + ".json", JSON.stringify(result));
        console.log("Done", name);
        resolve();
      }
    );
  });
}

async function main() {
  startCoreCDTLServer(3000);
  startExpressServer(3001);
  startFastifyServer(3002);

  await new Promise(r => setTimeout(r, 1000));

  await run("CoreCDTL", "http://localhost:3000");
  await run("Express", "http://localhost:3001");
  await run("Fastify", "http://localhost:3002");

  process.exit(0);
}

main();
