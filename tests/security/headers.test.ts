import { describe, it, expect } from "vitest";
import { run } from "../helpers/run";
import { expectFlag } from "../helpers/assertFlag";
import { Http } from "../../ts/http";

describe("Headers security rules", () => {
  it("duplicate Host header should fail (security)", () => {
    const { req } = run(
      "GET /search HTTP/1.1\r\n" + "Host: a\r\n" + "Host: b\r\n\r\n"
    );

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_DUPLICATE_SINGLE_HEADER);
  });
  it("too many headers should be rejected (security)", () => {
    let headers = "";
    for (let i = 0; i < 2000; i++) {
      headers += `X-Test-${i}: a\r\n`;
    }

    const { req } = run("GET /search HTTP/1.1\r\n" + headers + "\r\n");

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_MAX_HEADER_SIZE);
  });

  it("numeric-starting header name should fail (security)", () => {
    const { req } = run("GET /search HTTP/1.1\r\n" + "1Host: test\r\n\r\n");

    expectFlag(req.headers["headers"] == undefined ? 1 : 0, 1);
  });
});
