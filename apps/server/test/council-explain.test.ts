import { describe, it, expect } from "vitest";
import { explanationMatches } from "../src/agents/council.js";

describe("council explanation consistency", () => {
  it("accepts the rule's direction and rejects the opposite", () => {
    expect(explanationMatches("Supply grew too fast, so we cut town buy orders to 63%.", "cut")).toBe(true);
    expect(explanationMatches("Growth is below target, so we raise rewards a little.", "raise")).toBe(true);
    expect(explanationMatches("Growth is below target, so we cut rewards.", "raise")).toBe(false);
    expect(explanationMatches("We raise rewards to boost trade.", "cut")).toBe(false);
    expect(explanationMatches("Too few pilots yet, so we hold rewards steady.", "hold")).toBe(true);
  });
});
