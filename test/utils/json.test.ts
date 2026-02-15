import { describe, expect, it } from "vitest";
import { safeArray, safeJson } from "@/lib/utils/json";

describe("json utils", () => {
  describe("safeJson", () => {
    it("parses valid JSON", () => {
      expect(safeJson('{"a":1}', null)).toEqual({ a: 1 });
    });

    it("returns null for invalid JSON", () => {
      expect(safeJson("invalid", null)).toBeNull();
    });

    it("returns null for null/undefined input", () => {
      expect(safeJson(null as any, null)).toBeNull();
      expect(safeJson(undefined as any, null)).toBeNull();
    });
  });

  describe("safeArray", () => {
    it("returns array if input is array", () => {
      expect(safeArray([1, 2])).toEqual([1, 2]);
    });

    it("returns empty array if input is null", () => {
      expect(safeArray(null)).toEqual([]);
    });

    it("returns empty array for non-array objects", () => {
      expect(safeArray({ a: 1 })).toEqual([]);
    });

    it("wraps non-JSON string into array", () => {
      expect(safeArray("string")).toEqual(["string"]);
    });
  });
});
