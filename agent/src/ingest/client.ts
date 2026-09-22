export type IngestPayload = {
  telemetry?: Record<string, number | null> | null;
  jobs?: Record<string, unknown>[];
  events?: { level: string; source: string | null; message: string }[];
};

export type IngestClientOptions = {
  ingestUrl: string;
  agentToken: string;
  fetchImpl?: typeof fetch;
  maxQueueSize?: number;
  onTokenRejected?: () => void;
  onDrop?: (payload: IngestPayload) => void;
};

export class IngestClient {
  private queue: IngestPayload[] = [];
  private readonly maxQueueSize: number;
  private readonly fetchImpl: typeof fetch;
  private consecutiveFailures = 0;
  private skipTicks = 0;
  private flushing = false;

  constructor(private readonly options: IngestClientOptions) {
    this.maxQueueSize = options.maxQueueSize ?? 60;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  enqueue(payload: IngestPayload): void {
    this.queue.push(payload);
    if (this.queue.length > this.maxQueueSize) {
      const dropped = this.queue.shift();
      if (dropped) this.options.onDrop?.(dropped);
    }
  }

  get queueLength(): number {
    return this.queue.length;
  }

  async flush(): Promise<void> {
    // A slow send can outlast the tick interval; never let two flushes interleave.
    if (this.flushing) return;
    this.flushing = true;
    try {
      if (this.skipTicks > 0) {
        this.skipTicks -= 1;
        return;
      }
      while (this.queue.length > 0) {
        const payload = this.queue[0];
        const ok = await this.send(payload);
        if (!ok) {
          this.registerFailure();
          return;
        }
        this.consecutiveFailures = 0;
        this.queue.shift();
      }
    } finally {
      this.flushing = false;
    }
  }

  private registerFailure(): void {
    this.consecutiveFailures = Math.min(this.consecutiveFailures + 1, 6);
    this.skipTicks = 2 ** this.consecutiveFailures - 1;
  }

  private async send(payload: IngestPayload): Promise<boolean> {
    try {
      const response = await this.fetchImpl(this.options.ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.agentToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        this.options.onTokenRejected?.();
        return false;
      }
      return response.ok;
    } catch {
      return false;
    }
  }
}
