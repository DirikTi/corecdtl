import { runBenchmark, hypernode } from "./utils.js";

const {
  registerRoutes,
  scannerRouteFirst
} = hypernode;

const MAX_HEADER_SIZE = 8 * 1024;
const MAX_CONTENT_LENGTH = 1024 * 1024;
const QUERY_LIMIT = 10;

// --- routes
const routes = [];
for (let i = 0; i < 50; i++) {
  routes.push({
    method: "GET",
    url: `/route${i}`,
    vptrTableIndex: i
  });
}
registerRoutes(routes);

// --- buffers
const existsBuf = Buffer.from(
  "GET /route25 HTTP/1.1\r\nHost: a\r\n\r\n"
);

const notExistsBuf = Buffer.from(
  "GET /not-found HTTP/1.1\r\nHost: a\r\n\r\n"
);

function freshReq() {
  return {
    retFlag: 0,
    mainOffset: 0,
    headerSize: 0,
    headers: {},
    method: 0,
    params: [],
    query: {}
  };
}

// --- benchmarks
runBenchmark(
  "scannerRouteFirst (route exists)",
  () => {
    const req = freshReq();
    scannerRouteFirst(
      existsBuf,
      req,
      MAX_HEADER_SIZE,
      MAX_CONTENT_LENGTH,
      QUERY_LIMIT
    );
  },
  200_000
);

runBenchmark(
  "scannerRouteFirst (route NOT exists)",
  () => {
    const req = freshReq();
    scannerRouteFirst(
      notExistsBuf,
      req,
      MAX_HEADER_SIZE,
      MAX_CONTENT_LENGTH,
      QUERY_LIMIT
    );
  },
  200_000
);
