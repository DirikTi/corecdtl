import fs from "fs";
import path from "path";

const SEGMENTS = [
  "user", "profile", "settings", "auth", "session",
  "account", "orders", "items", "search", "notifications",
  "messages", "billing", "payments", "history"
];

function randSegment() {
  return SEGMENTS[Math.floor(Math.random() * SEGMENTS.length)];
}

let index = 0;

function generatePath(depth) {
  let p = "";
  for (let i = 0; i < depth; i++) {
    p += "/" + randSegment() + "/" + index++;
  }
  return p;
}

const routes = [];

for (let i = 0; i < 100; i++) {
  routes.push({
    method: "PUT",
    path: generatePath(2 + (i % 3)), // depth 2–4
    id: i
  });
}

const outDir = path.resolve("benchmark/e2e/data");
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(
  path.join(outDir, "routes.json"),
  JSON.stringify(routes, null, 2)
);

console.log("✔ routes.json generated (100 routes)");
