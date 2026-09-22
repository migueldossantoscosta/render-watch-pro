import type { ParsedProgress } from "./types";

const FRAME_RE = /^PROGRESS:\s+[\d:]+\s+\((\d+)\):/;
const FINISHED_RE = /^PROGRESS:\s+Total Time Elapsed/;

export function parseAfterEffectsLogLines(
  lines: string[],
  previous: ParsedProgress,
): ParsedProgress {
  const next = { ...previous };
  for (const line of lines) {
    const frameMatch = FRAME_RE.exec(line);
    if (frameMatch) {
      next.currentFrame = Number(frameMatch[1]);
    }
    if (FINISHED_RE.test(line)) {
      next.finished = true;
    }
  }
  return next;
}
