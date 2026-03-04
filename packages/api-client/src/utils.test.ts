import { describe, expect, it } from "vitest";
import { mapKeysToCamel, snakeToCamel } from "./utils";

describe("snakeToCamel", () => {
  it("converts simple snake_case", () => {
    expect(snakeToCamel("hello_world")).toBe("helloWorld");
  });

  it("converts multiple underscores", () => {
    expect(snakeToCamel("this_is_a_test")).toBe("thisIsATest");
  });

  it("returns string unchanged if no underscores", () => {
    expect(snakeToCamel("hello")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(snakeToCamel("")).toBe("");
  });

  it("handles single character segments", () => {
    expect(snakeToCamel("a_b_c")).toBe("aBC");
  });

  it("converts leading underscore followed by lowercase", () => {
    // _l matches the regex _([a-z]) → "L", underscore is consumed
    expect(snakeToCamel("_leading")).toBe("Leading");
  });
});

describe("mapKeysToCamel", () => {
  it("converts all keys from snake_case to camelCase", () => {
    const input = {
      user_id: "123",
      first_name: "John",
      is_active: true,
    };
    const result = mapKeysToCamel(input);
    expect(result).toEqual({
      userId: "123",
      firstName: "John",
      isActive: true,
    });
  });

  it("handles empty object", () => {
    expect(mapKeysToCamel({})).toEqual({});
  });

  it("preserves camelCase keys", () => {
    const input = { alreadyCamel: true, also_snake: false };
    const result = mapKeysToCamel(input);
    expect(result).toEqual({ alreadyCamel: true, alsoSnake: false });
  });

  it("does shallow mapping only (does not recurse into nested objects)", () => {
    const input = { outer_key: { inner_key: "value" } };
    const result = mapKeysToCamel(input);
    expect(result).toEqual({ outerKey: { inner_key: "value" } });
  });
});
