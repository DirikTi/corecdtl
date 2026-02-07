import { describe, it, expect } from "vitest";
import { run } from "../helpers/run";
import { expectFlag } from "../helpers/assertFlag";
import { Http } from "../../ts/http";

describe("Content-Length rules", () => {
  it("duplicate conflicting Content-Length should fail", () => {
    const { req } = run(
      "POST /query HTTP/1.1\r\n" +
      "Host: test\r\n" +
      "Content-Length: 5\r\n" +
      "Content-Length: 10\r\n\r\n" +
      "12345"
    );
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_DUPLICATE_SINGLE_HEADER);
  });

  it("valid Content-Length should pass", () => {
    const { req } = run(
      "POST /query HTTP/1.1\r\n" +
      "Host: test\r\n" +
      "Content-Length: 5\r\n\r\n" +
      "12345"
    );
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_OK);
  });

  it("invalid Content-Length value should fail", () => {
    const { req } = run(
      "POST /query HTTP/1.1\r\n" +
      "Host: test\r\n" +
      "Content-Length: abc\r\n\r\n"
    );
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_INVALID_HEADER_VALUE);
  });

  it("negative Content-Length should fail", () => {
    const { req } = run(
      "POST /query HTTP/1.1\r\n" +
      "Host: test\r\n" +
      "Content-Length: -10\r\n\r\n"
    );

    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_INVALID_HEADER_VALUE);
  });
});
