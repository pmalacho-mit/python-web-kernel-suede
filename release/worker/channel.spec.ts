import { describe, expect, it } from "vitest";
import { AsyncMemory } from "./async-memory";
import { ChannelHost, ChannelWorker } from "./channel";

/**
 * The worker only ever blocks on a host that has not answered yet, so a host
 * that answers inside `postMessage` lets both ends run on one thread.
 */
const loopback = (capacity = AsyncMemory.MINIMUM_CAPACITY) => {
  const memory = new AsyncMemory({ capacity });
  const host = new ChannelHost(memory);
  let answer: () => void = () => {};
  const worker = new ChannelWorker(memory, () => host.sendNextChunk());
  return {
    capacity,
    host,
    worker,
    respondWith: (payload: Uint8Array) => (answer = () => host.send(payload)),
    receive: () => worker.request(() => answer()),
  };
};

const locks = (channel: ReturnType<typeof loopback>) => {
  const { lockAndSize } = channel.host.memory;
  return {
    worker: lockAndSize[AsyncMemory.LOCK_WORKER_INDEX],
    size: lockAndSize[AsyncMemory.LOCK_SIZE_INDEX],
  };
};

const free = { worker: AsyncMemory.UNLOCKED, size: AsyncMemory.UNLOCKED };

const pattern = (length: number) =>
  Uint8Array.from({ length }, (_, index) => (index * 7 + 1) % 256);

describe("payload framing", () => {
  it.each([0, 1, 17, 1023, 1024])(
    "delivers a %i byte payload that fits in one slice",
    (length) => {
      const channel = loopback();
      const payload = pattern(length);
      channel.respondWith(payload);
      expect(channel.receive()).toEqual(payload);
    },
  );

  it.each([1025, 2048, 4097, 100_000])(
    "delivers a %i byte payload across several slices",
    (length) => {
      const channel = loopback();
      const payload = pattern(length);
      channel.respondWith(payload);
      expect(channel.receive()).toEqual(payload);
    },
  );

  it("delivers payloads back to back over the same memory", () => {
    const channel = loopback();
    for (const length of [10, 5000, 3, 20_000]) {
      const payload = pattern(length);
      channel.respondWith(payload);
      expect(channel.receive()).toEqual(payload);
    }
  });

  it("copies out of shared memory rather than viewing it", () => {
    const channel = loopback();
    channel.respondWith(pattern(64));
    const received = channel.receive();
    expect(received.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it("leaves the locks free once a payload has been delivered", () => {
    const channel = loopback();
    channel.respondWith(pattern(5000));
    channel.receive();
    expect(locks(channel)).toEqual(free);
  });

  it("frees the locks even when the host fails to answer", () => {
    const channel = loopback();
    expect(() =>
      channel.worker.request(() => {
        throw new Error("host exploded");
      }),
    ).toThrow("host exploded");
    expect(locks(channel)).toEqual(free);
  });
});
