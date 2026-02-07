import { describe, it, expect } from "vitest";
import { run } from "../helpers/run";
import { expectFlag } from "../helpers/assertFlag";
import { Http } from "../../ts/http";

describe("Headers security rules", () => {
  it("too large headers should fail", () => {
    const big = "A".repeat(9 * 1024);
    const { req } = run("GET /search HTTP/1.1\r\n" + `Host: ${big}\r\n\r\n`);
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_MAX_HEADER_VALUE_SIZE);
  });

  it("too many query params should fail", () => {
    const q = Array.from({ length: 20 })
      .map((_, i) => `a${i}=1`)
      .join("&");

    const { req } = run(`GET /search?${q} HTTP/1.1\r\nHost: test\r\n\r\n`);

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_REQUEST_QUERY_EXCEEDED);
  });
  
  it("request line too long should fail (security)", () => {
    const path = "/search/" + "a".repeat(10000);

    const { req } = run(`GET ${path} HTTP/1.1\r\nHost: test\r\n\r\n`);
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_REQUEST_URL_EXCEEDED);
  });

  it("too many headers should fail (security)", () => {
    let headers = "";
    for (let i = 0; i < 1000; i++) {
      headers += `X-${i}: a\r\n`;
    }
    const { req } = run("GET /search HTTP/1.1\r\n" + headers + "\r\n");
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_MAX_HEADER_SIZE);
  });

  it("empty repeated query params should fail (security)", () => {
    const q = Array.from({ length: 50 })
      .map(() => "=")
      .join("&");

    const { req } = run(`GET /search?${q} HTTP/1.1\r\nHost: test\r\n\r\n`);

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_REQUEST_QUERY_EXCEEDED);
  });
});
