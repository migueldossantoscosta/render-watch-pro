import { open, stat } from "node:fs/promises";

export type TailState = { offset: number };

export async function readNewLines(path: string, state: TailState): Promise<string[]> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return [];
  }
  if (size < state.offset) {
    state.offset = 0;
  }
  if (size === state.offset) {
    return [];
  }
  const handle = await open(path, "r");
  try {
    const length = size - state.offset;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, state.offset);
    state.offset = size;
    return buffer
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
  } finally {
    await handle.close();
  }
}
