import { describe, expect, test } from "bun:test";
import {
  isBackgroundBlenderRender,
  matchEngine,
  parseFrameRange,
  parseProcessListJson,
  parseProjectFile,
} from "./detect";

describe("parseProcessListJson", () => {
  test("parses a JSON array of processes", () => {
    const json = JSON.stringify([
      { ProcessId: 1234, Name: "blender.exe", CommandLine: "blender.exe -b scene.blend -a" },
    ]);
    expect(parseProcessListJson(json)).toEqual([
      { ProcessId: 1234, Name: "blender.exe", CommandLine: "blender.exe -b scene.blend -a" },
    ]);
  });

  test("wraps a single object result in an array", () => {
    const json = JSON.stringify({ ProcessId: 1, Name: "blender.exe", CommandLine: null });
    expect(parseProcessListJson(json)).toEqual([
      { ProcessId: 1, Name: "blender.exe", CommandLine: null },
    ]);
  });

  test("returns an empty array for blank output", () => {
    expect(parseProcessListJson("  ")).toEqual([]);
  });
});

describe("matchEngine", () => {
  test("matches a known process name case-insensitively", () => {
    expect(matchEngine("Blender.exe")).toBe("blender");
    expect(matchEngine("aerender.exe")).toBe("after_effects");
  });

  test("returns null for unknown processes", () => {
    expect(matchEngine("notepad.exe")).toBeNull();
  });
});

describe("parseFrameRange", () => {
  test("extracts explicit -s/-e frame bounds", () => {
    expect(parseFrameRange("blender.exe -b scene.blend -s 1 -e 250 -a")).toEqual({
      start: 1,
      end: 250,
    });
  });

  test("returns null when no range flags are present", () => {
    expect(parseFrameRange("blender.exe -b scene.blend -a")).toBeNull();
  });

  test("returns null for a missing command line", () => {
    expect(parseFrameRange(null)).toBeNull();
  });
});

describe("parseProjectFile", () => {
  test("extracts the .blend path after -b", () => {
    expect(parseProjectFile('blender.exe -b "C:\\scenes\\shot01.blend" -a')).toBe(
      "C:\\scenes\\shot01.blend",
    );
  });

  test("extracts the .aep path after -project", () => {
    expect(parseProjectFile('aerender.exe -project "C:\\ae\\comp.aep" -comp Main')).toBe(
      "C:\\ae\\comp.aep",
    );
  });

  test("returns null when no project flag is present", () => {
    expect(parseProjectFile("blender.exe -a")).toBeNull();
  });
});

describe("isBackgroundBlenderRender", () => {
  test("accepts the short -b flag", () => {
    expect(isBackgroundBlenderRender('blender.exe -b "C:\\scenes\\shot01.blend" -a')).toBe(true);
  });

  test("accepts the long --background flag", () => {
    expect(isBackgroundBlenderRender("blender.exe --background scene.blend -a")).toBe(true);
  });

  test("rejects an interactive session with neither flag", () => {
    expect(isBackgroundBlenderRender('"C:\\Program Files\\Blender\\blender.exe"')).toBe(false);
    expect(isBackgroundBlenderRender(null)).toBe(false);
  });
});
