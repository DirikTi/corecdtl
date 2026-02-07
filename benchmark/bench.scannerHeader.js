import { runBenchmark, hypernode } from "./utils.js";

const { scannerHeader } = hypernode;

const MAX_HEADER_SIZE = 8 * 1024;
const MAX_CONTENT_LENGTH = 2 * 1024;

const headerBuf = Buffer.from(
  "GET /x HTTP/1.1\r\n" +
  "Host: test\r\n" +
  "User-Agent: bench\r\n" +
  "Accept: */*\r\n" +
  "\r\n"
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

runBenchmark(
  "scannerHeader (pure header parse)",
  () => {
    const req = freshReq();
    scannerHeader(headerBuf, req, MAX_HEADER_SIZE, MAX_CONTENT_LENGTH);
  },
  300_000
);
