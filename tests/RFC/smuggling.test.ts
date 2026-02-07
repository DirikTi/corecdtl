import { describe, it, expect } from "vitest";
import { run } from "../helpers/run";
import { expectFlag } from "../helpers/assertFlag";
import { Http } from "../../ts/http";

describe("Request smuggling protection", () => {
  it("CL + Transfer-Encoding must be rejected", () => {
    const { req } = run(
      "POST /query HTTP/1.1\r\n" +
      "Host: test\r\n" +
      "Content-Length: 5\r\n" +
      "Transfer-Encoding: chunked\r\n\r\n" +
      "0\r\n\r\n"
    );

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_BAD_REQUEST);
  });

  /*
  // Body parser in accumulatorChunked
  it("invalid chunked body should fail", () => {
    const { req } = run(
      "POST /query HTTP/1.1\r\n" +
      "Host: test\r\n" +
      "Transfer-Encoding: chunked\r\n\r\n" +
      "ZZ\r\n"
    );
    console.log(req);
    expectFlag(req.retFlag, Http.RetFlagBits.BAD_REQUEST);
  });
  */
});
