import hypernode from "../setup";
import { freshReqObj } from "./freshReq";

const { HttpCore } = hypernode;

const MAX_HEADER_NAME_SIZE = 4 * 1024;
const MAX_HEADER_VALUE_SIZE = 4 * 1024;
const MAX_HEADER_SIZE = 8 * 1024;
const QUERY_LIMIT = 10;

const httpCore = new HttpCore();

httpCore.registerRoutes([
  { method: "GET", route: "/search", vptrTableIndex: 3 },
  { method: "GET", route: "/search/*", vptrTableIndex: 4 },
  { method: "POST", route: "/query", vptrTableIndex: 2 },
]);

export function run(raw: string) {
  const buf = Buffer.from(raw);
  const req = freshReqObj();

  const ret = httpCore.scannerRouteFirst(
    buf,
    req,
    MAX_HEADER_NAME_SIZE,
    MAX_HEADER_VALUE_SIZE,
    MAX_HEADER_SIZE,
    QUERY_LIMIT
  );

  return { ret, req };
}
