import { describe, it, expect } from "vitest";
import { run } from "../helpers/run";
import { expectFlag } from "../helpers/assertFlag";
import { Http } from "../../ts/http";

describe("Request line validation", () => {
  it("valid request line should pass", () => {
    const { req } = run(
      "GET /search HTTP/1.1\r\nHost: test\r\n\r\n"
    );
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_OK);
  });

  it("invalid HTTP version should fail", () => {
    const { req } = run(
      "GET /search HTTP/9.9\r\nHost: test\r\n\r\n"
    );
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_HTTP_VERSION_UNSUPPORTED);
  });

  it("malformed request line should fail", () => {
    const { req } = run(
      "GETSEARCHHTTP/1.1\r\nHost: test\r\n\r\n"
    );
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_BAD_REQUEST);
  });
});
