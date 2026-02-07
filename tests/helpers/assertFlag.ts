import { expect } from "vitest";
import { Http } from "../../ts/http";

export function expectFlag(
  actual: number,
  expected: Http.RetFlagBits | any
) {
  expect(actual == expected).toBe(true);
}

export function expectNoFlag(
  actual: number,
  unexpected: Http.RetFlagBits
) {
  expect((actual & unexpected) === 0).toBe(true);
}
