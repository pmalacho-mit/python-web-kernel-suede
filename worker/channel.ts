import type { AsyncMemory } from "./async-memory";

/**
 * Divides a payload into the largest slices the shared memory can hold. Both
 * threads derive the same slices from the payload size, so no chunk headers
 * have to travel with the data.
 */
const slices = (total: number, capacity: number) => ({
  count: Math.max(1, Math.ceil(total / capacity)),
  start: (index: number) => index * capacity,
  end: (index: number) => Math.min(total, (index + 1) * capacity),
});

export type ChannelChunkMessage = {
  /** Sent by the worker to ask the host for the next slice of a payload. */
  channel_chunk: {};
};

/**
 * Writes payloads into shared memory for a worker that is blocked waiting on
 * them. Runs on the thread that owns the objects, usually the main thread.
 */
export class ChannelHost {
  private pending?: { payload: Uint8Array; sent: number };

  constructor(readonly memory: AsyncMemory) {}

  send(payload: Uint8Array) {
    this.pending = { payload, sent: 0 };
    this.memory.writeSize(payload.byteLength);
    this.flushNextSlice();
  }

  /** Answers a worker's request for the next slice of the payload in flight. */
  sendNextChunk() {
    if (!this.pending)
      return console.warn("No payload in flight to continue writing");
    this.flushNextSlice();
  }

  private flushNextSlice() {
    const { payload, sent } = this.pending!;
    const slice = slices(payload.byteLength, this.memory.memory.byteLength);
    this.memory.memory.set(
      payload.subarray(slice.start(sent), slice.end(sent)),
    );
    this.pending =
      sent + 1 < slice.count ? { payload, sent: sent + 1 } : undefined;
    this.memory.unlockSize();
  }
}

/**
 * Blocks this thread until the host has written a whole payload into shared
 * memory. Must run on a worker thread.
 */
export class ChannelWorker {
  constructor(
    readonly memory: AsyncMemory,
    private readonly requestNextChunk: () => void,
  ) {}

  /**
   * Sends a request to the host and blocks until its whole response has been
   * copied out of shared memory.
   */
  request(send: () => void): Uint8Array {
    const { memory } = this;
    try {
      memory.lockWorker();
      memory.lockSize();
      memory.writeSize(0);
      send();
      memory.waitForSize();
      return this.receive();
    } finally {
      memory.forceUnlockSize();
      memory.unlockWorker();
    }
  }

  private receive() {
    const total = this.memory.readSize();
    const slice = slices(total, this.memory.memory.byteLength);
    const payload = new Uint8Array(total);
    for (let index = 0; index < slice.count; index++) {
      if (index > 0) this.waitForNextChunk();
      const [start, end] = [slice.start(index), slice.end(index)];
      payload.set(this.memory.memory.subarray(0, end - start), start);
    }
    return payload;
  }

  private waitForNextChunk() {
    this.memory.lockSize();
    this.requestNextChunk();
    this.memory.waitForSize();
  }
}
