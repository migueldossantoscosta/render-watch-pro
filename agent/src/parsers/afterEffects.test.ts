import { describe, expect, test } from "bun:test";
import { parseAfterEffectsLogLines } from "./afterEffects";
import { initialProgress } from "./types";

describe("parseAfterEffectsLogLines", () => {
  test("extracts the frame number from PROGRESS lines", () => {
    const lines = [
      "PROGRESS:  0:00:00:00 (0): 0 Seconds",
      "PROGRESS:  0:00:00:01 (1): 2 Seconds",
      "PROGRESS:  0:00:00:02 (2): 4 Seconds",
    ];
    const result = parseAfterEffectsLogLines(lines, initialProgress(250));
    expect(result.currentFrame).toBe(2);
    expect(result.finished).toBe(false);
  });

  test("marks the job finished on the total time elapsed summary line", () => {
    const lines = ["PROGRESS:  Total Time Elapsed: 0:03:12"];
    const result = parseAfterEffectsLogLines(lines, initialProgress(250));
    expect(result.finished).toBe(true);
  });

  test("ignores unrelated log lines", () => {
    const result = parseAfterEffectsLogLines(
      ["aerender.exe 24.0", "Starting composition..."],
      initialProgress(250),
    );
    expect(result.currentFrame).toBe(0);
  });
});
