import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNewLines, type TailState } from "./tail";

describe("readNewLines", () => {
  test("returns only lines appended since the last read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "renderwatch-log-"));
    const path = join(dir, "render.log");
    try {
      await Bun.write(path, "line one\nline two\n");
      const state: TailState = { offset: 0 };
      const first = await readNewLines(path, state);
      expect(first).toEqual(["line one", "line two"]);

      await Bun.write(path, "line one\nline two\nline three\n");
      const second = await readNewLines(path, state);
      expect(second).toEqual(["line three"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("restarts from the beginning when the file shrinks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "renderwatch-log-"));
    const path = join(dir, "render.log");
    try {
      await Bun.write(path, "aaaaaaaaaa\n");
      const state: TailState = { offset: 0 };
      await readNewLines(path, state);

      await Bun.write(path, "new\n");
      const afterTruncate = await readNewLines(path, state);
      expect(afterTruncate).toEqual(["new"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns an empty array when the file does not exist", async () => {
    const state: TailState = { offset: 0 };
    expect(await readNewLines(join(tmpdir(), "does-not-exist.log"), state)).toEqual([]);
  });
});
