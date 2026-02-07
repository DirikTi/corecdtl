import { hypernode } from "../dist/hypernode.js";

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

httpCore.registerRoutes([
  { method: "GET", route: "/search", vptrTableIndex: 3 },
  { method: "GET", route: "/search/*", vptrTableIndex: 4 },
  { method: "POST", route: "/query", vptrTableIndex: 2 },
]);
const txt = "POST /query HTTP/1.1\r\n" +
    "Host: localhost:3000\r\n" +
    "Connection: keep-alive\r\n" +
    "Content-Length:\t 222\t\r\n" +
    "Cache-Control: max-age=0\r\n" +
    'sec-ch-ua: "Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"\r\n' +
    "sec-ch-ua-mobile: ?0\r\n" +
    'sec-ch-ua-platform: "macOS"\r\n' +
    "Upgrade-Insecure-Requests: 1\r\n" +
    "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36\r\n" +
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7\r\n" +
    "Sec-Fetch-Site: none\r\n" +
    "Sec-Fetch-Mode: navigate\r\n" +
    "Sec-Fetch-User: ?1\r\n" +
    "Sec-Fetch-Dest: document\r\n" +
    "Accept-Encoding: gzip, deflate, br, zstd\r\n" +
    "Accept-Language: en-GB,en-US;q=0.9,en;q=0.8,tr;q=0.7\r\n\r\n";

const buf = Buffer.from(
    txt
);

/*
if (outHeaders->Has("authorization"))
                        return FLAG_DUPLICATE_SINGLE_HEADER;
*/

const req = freshReqObj();

const retRoute = httpCore.scannerRouteFirst(
    buf,
    req,
    MAX_HEADER_NAME_SIZE,
    MAX_HEADER_VALUE_SIZE,
    MAX_CONTENT_LENGTH,
    QUERY_LIMIT
);
console.log(req);