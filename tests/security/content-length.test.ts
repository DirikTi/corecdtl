import { describe, it, expect } from "vitest";
import { run } from "../helpers/run";
import { expectFlag } from "../helpers/assertFlag";
import { Http } from "../../ts/http";

describe("Content-Length security rules", () => {
  it("multiple Content-Length headers should be rejected (security hardening)", () => {
    const { req } = run(
      "POST /query HTTP/1.1\r\n" +
      "Host: test\r\n" +
      "Content-Length: 5\r\n" +
      "Content-Length: 5\r\n\r\n" +
      "12345"
    );

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_DUPLICATE_SINGLE_HEADER);
  });

  it("Content-Length on GET should be rejected (security)", () => {
    const { req } = run(
      "GET /search HTTP/1.1\r\n" +
      "Host: test\r\n" +
      "Content-Length: 10\r\n\r\n"
    );

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_OK);
  });
});
