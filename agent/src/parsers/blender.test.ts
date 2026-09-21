import { describe, expect, test } from "bun:test";
import { parseBlenderLogLines } from "./blender";
import { initialProgress } from "./types";

describe("parseBlenderLogLines", () => {
  test("extracts frame and sample counts from Cycles output", () => {
    const lines = [
      "Fra:1 Mem:18.66M (Peak 18.66M) | Time:00:00.34 | Mem:0.00M, Peak:0.00M | Scene, ViewLayer | Sample 8/32",
      "Fra:1 Mem:18.66M (Peak 18.66M) | Time:00:00.68 | Mem:0.00M, Peak:0.00M | Scene, ViewLayer | Sample 32/32",
      "Saved: 'C:\\renders\\0001.png'",
    ];
    const result = parseBlenderLogLines(lines, initialProgress(1));
    expect(result.currentFrame).toBe(1);
    expect(result.samplesDone).toBe(32);
    expect(result.samplesTotal).toBe(32);
    expect(result.finished).toBe(true);
  });

  test("tracks frame number without samples for Eevee output", () => {
    const lines = [
      "Fra:5 Mem:22.10M (Peak 22.10M) | Time:00:01.02 | Scene, ViewLayer",
      "Saved: 'C:\\renders\\0005.png'",
    ];
    const result = parseBlenderLogLines(lines, initialProgress(10));
    expect(result.currentFrame).toBe(5);
    expect(result.samplesDone).toBeNull();
    expect(result.finished).toBe(false);
  });

  test("ignores unrelated log lines", () => {
    const result = parseBlenderLogLines(["Blender 4.2.0", "Read blend: file.blend"], initialProgress(10));
    expect(result.currentFrame).toBe(0);
  });
});
