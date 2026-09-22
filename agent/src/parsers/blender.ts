import type { ParsedProgress } from "./types";

const FRAME_RE = /^Fra:(\d+)/;
const SAMPLE_RE = /Sample (\d+)\/(\d+)/;

export function parseBlenderLogLines(lines: string[], previous: ParsedProgress): ParsedProgress {
  const next = { ...previous };
  for (const line of lines) {
    const frameMatch = FRAME_RE.exec(line);
    if (frameMatch) {
      next.currentFrame = Number(frameMatch[1]);
      const sampleMatch = SAMPLE_RE.exec(line);
      if (sampleMatch) {
        next.samplesDone = Number(sampleMatch[1]);
        next.samplesTotal = Number(sampleMatch[2]);
      } else {
        next.samplesDone = null;
        next.samplesTotal = null;
      }
    }
    if (
      /^Saved: /.test(line) &&
      next.totalFrames != null &&
      next.currentFrame >= next.totalFrames
    ) {
      next.finished = true;
    }
  }
  return next;
}
