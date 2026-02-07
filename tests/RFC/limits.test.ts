import { describe, it, expect } from "vitest";
import { run } from "../helpers/run";
import { expectFlag } from "../helpers/assertFlag";
import { Http } from "../../ts/http";

describe("Limits enforcement", () => {
  it("empty request line should fail", () => {
    const { req } = run("\r\n");
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_BAD_REQUEST);
  });
  it("missing CRLF CRLF should fail", () => {
    const { req } = run("GET /search HTTP/1.1\r\nHost: test");
    expectFlag(req.retFlag, Http.RetFlagBits.FLAG_UNTERMINATED_HEADERS);
  });
});
