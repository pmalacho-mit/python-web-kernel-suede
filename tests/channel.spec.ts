import { describe, expect, it } from "vitest";
import { AsyncMemory } from "../release/worker/async-memory";
import {
  ChannelHost,
  ChannelWorker,
  InterruptedError,
  UnansweredError,
} from "../release/worker/channel";

/**
 * The worker only ever blocks on a host that has not answered yet, so a host
 * that answers inside `postMessage` lets both ends run on one thread.
 */
const loopback = (
  capacity = AsyncMemory.MINIMUM_CAPACITY,
  patience = { interval: 25, limit: 500 },
) => {
  const memory = new AsyncMemory({ capacity });
  const host = new ChannelHost(memory);
  let answer: () => void = () => {};
  const worker = new ChannelWorker(
    memory,
    () => host.sendNextChunk(),
    patience,
  );
  return {
    capacity,
    host,
    worker,
    respondWith: (payload: Uint8Array) =>
      (answer = () => host.send(payload, memory.request)),
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

describe("disposal", () => {
  it("frees an idle bridge without complaining", () => {
    const channel = loopback();
    expect(() => channel.host.memory.dispose()).not.toThrow();
  });

  it("frees a bridge the worker still holds", () => {
    const channel = loopback();
    channel.host.memory.lockWorker();
    channel.host.memory.dispose();
    expect(locks(channel)).toEqual(free);
  });
});

describe("a host that never answers", () => {
  it("gives up rather than parking forever", () => {
    const channel = loopback();
    expect(() => channel.worker.request(() => {})).toThrow(UnansweredError);
  });

  it("frees the locks when it gives up", () => {
    const channel = loopback();
    expect(() => channel.worker.request(() => {})).toThrow();
    expect(locks(channel)).toEqual(free);
  });

  it("surfaces an interrupt instead of waiting out the limit", () => {
    const channel = loopback();
    expect(() =>
      channel.worker.request(() => channel.host.memory.interrupt()),
    ).toThrow(InterruptedError);
  });

  it("ignores an answer belonging to a request it already gave up on", () => {
    const channel = loopback();
    const { memory } = channel.host;

    /** What a host mid-copy does after the worker has moved on. */
    const answerSomethingElse = () => {
      memory.writeSize(16);
      memory.writeAnswer(memory.request - 1);
      memory.unlockSize();
    };

    expect(() => channel.worker.request(answerSomethingElse)).toThrow(
      UnansweredError,
    );
  });

  it("takes the answer that belongs to the request it is waiting on", () => {
    const channel = loopback();
    const { memory } = channel.host;

    channel.respondWith(pattern(24));
    expect(channel.receive()).toEqual(pattern(24));
    expect(memory.answer).toBe(memory.request - 1);
  });

  it("stops waiting on a request the moment it gives up on it", () => {
    const channel = loopback();
    const awaited: number[] = [];
    expect(() =>
      channel.worker.request(() => awaited.push(channel.host.memory.request)),
    ).toThrow();
    expect(channel.host.memory.isAwaiting(awaited[0])).toBe(false);
  });

  it("drops an answer to a request that was abandoned", () => {
    const channel = loopback();
    expect(() => channel.worker.request(() => {})).toThrow();

    const stale = channel.host.memory.request;
    channel.respondWith(pattern(16));
    const payload = channel.receive();

    channel.host.send(pattern(64), stale);
    expect(payload).toEqual(pattern(16));
  });
});
