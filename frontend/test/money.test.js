import { test } from "node:test";
import assert from "node:assert/strict";
import { toMinor, money } from "../src/money.js";
test("decimal conversion preserves exact cents", () => {
  for (const [value, minor] of [
    ["12500.75", 1250075],
    ["0.29", 29],
    ["1.2", 120],
    ["0", 0],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])
    assert.equal(toMinor(value), minor);
});
test("invalid, negative, fractional-cent and unsafe amounts are rejected", () => {
  for (const value of [
    "-1",
    "1.001",
    "1e5",
    "",
    "abc",
    "90071992547409.92",
    "NaN",
    "Infinity",
  ])
    assert.throws(() => toMinor(value));
});
test("formatting keeps cents at safe-integer boundary", () => {
  assert.equal(money(1250075, "CAD"), "CAD 12,500.75");
  assert.equal(
    money(Number.MAX_SAFE_INTEGER, "USD"),
    "USD 90,071,992,547,409.91",
  );
});
