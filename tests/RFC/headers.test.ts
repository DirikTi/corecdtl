import { describe, it, expect } from "vitest";
import { run } from "../helpers/run";
import { expectFlag } from "../helpers/assertFlag";
import { Http } from "../../ts/http";

describe("Header syntax", () => {
  it("control character in header value should fail", () => {
    const { req } = run("GET /search HTTP/1.1\r\n" + "Host: test\x01\r\n\r\n");
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_INVALID_HEADER_VALUE);
  });

  it("invalid header name", () => {
    const { req } = run("GET /search HTTP/1.1\r\nHo st: test\r\n\r\n");

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_INVALID_HEADER);
  });

  it("unterminated headers", () => {
    const { req } = run("GET /search HTTP/1.1\r\nHost: test");

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_UNTERMINATED_HEADERS);
  });

  it("header names are case-insensitive", () => {
    const { req } = run("GET /search HTTP/1.1\r\nhOsT: test\r\n\r\n");

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_OK);
  });

  it("empty header value is allowed", () => {
    const { req } = run("GET /search HTTP/1.1\r\nHost:\r\n\r\n");

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_OK);
  });

  it("optional whitespace around header value is allowed", () => {
    const { req } = run("GET /search HTTP/1.1\r\nHost:    test\r\n\r\n");

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_OK);
  });

  it("obsolete line folding should fail", () => {
    const { req } = run("GET /search HTTP/1.1\r\n" + "X-Test: a\r\n b\r\n\r\n");

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_INVALID_HEADER);
  });

  it("duplicate Host header should fail", () => {
    const { req } = run(
      "GET /search HTTP/1.1\r\n" +
      "Host: a\r\n" +
      "Host: b\r\n\r\n"
    );
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_DUPLICATE_SINGLE_HEADER);
  });
});
