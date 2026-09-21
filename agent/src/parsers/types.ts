export type ParsedProgress = {
  currentFrame: number;
  totalFrames: number | null;
  samplesDone: number | null;
  samplesTotal: number | null;
  finished: boolean;
};

export function initialProgress(totalFrames: number | null = null): ParsedProgress {
  return { currentFrame: 0, totalFrames, samplesDone: null, samplesTotal: null, finished: false };
}
