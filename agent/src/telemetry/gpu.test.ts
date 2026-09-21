import { describe, expect, test } from "bun:test";
import { emptyGpuStats, parseNvidiaSmiOutput } from "./gpu";

describe("parseNvidiaSmiOutput", () => {
  test("parses a well-formed nvidia-smi CSV line", () => {
    const result = parseNvidiaSmiOutput("62, 98, 71, 210.50, 8192, 24576\n");
    expect(result).toEqual({
      tempC: 62,
      loadPct: 98,
      fanPct: 71,
      powerW: 210.5,
      vramUsedMb: 8192,
      vramTotalMb: 24576,
    });
  });

  test("returns empty stats for blank output", () => {
    expect(parseNvidiaSmiOutput("")).toEqual(emptyGpuStats());
  });

  test("returns empty stats for a malformed line", () => {
    expect(parseNvidiaSmiOutput("not,enough,fields")).toEqual(emptyGpuStats());
  });
});
