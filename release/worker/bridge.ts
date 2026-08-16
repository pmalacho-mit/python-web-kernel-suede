import { AsyncMemory } from "./async-memory";
import {
  ChannelHost,
  ChannelWorker,
  type ChannelChunkMessage,
} from "./channel";
import {
  ObjectProxyClient,
  ObjectProxyHost,
  type ProxyMessages,
} from "./object-proxy";
import {
  SyncCallClient,
  SyncCallHost,
  type SyncCallMessages,
  type SyncCallTargets,
} from "./sync-call";
import type { Typed } from "../utils";

export type BridgeMessages = ProxyMessages &
  SyncCallMessages &
  ChannelChunkMessage;

export type BridgeMessage = Typed<BridgeMessages>;

const BRIDGE_MESSAGE_TYPES = new Set<string>([
  "proxy_reflect",
  "proxy_promise",
  "sync_call",
  "channel_chunk",
]);

const isBridgeMessage = (message: { type: string }): message is BridgeMessage =>
  BRIDGE_MESSAGE_TYPES.has(message.type);

/**
 * The host end of the bridge: owns the shared memory, answers the worker's
 * blocking requests, and hands out ids for the objects it keeps.
 */
export class HostBridge {
  readonly memory: AsyncMemory;
  readonly channel: ChannelHost;
  readonly objects: ObjectProxyHost;
  private readonly calls: SyncCallHost;

  constructor(targets: SyncCallTargets, capacity?: number) {
    this.memory = new AsyncMemory({ capacity });
    this.channel = new ChannelHost(this.memory);
    this.objects = new ObjectProxyHost(this.channel);
    this.calls = new SyncCallHost(targets, this.channel, this.objects.references);
  }

  get buffers() {
    return this.memory.buffers;
  }

  /** @returns whether the message was addressed to the bridge */
  handle(message: { type: string }) {
    if (!isBridgeMessage(message)) return false;
    if (message.type === "sync_call") this.calls.respond(message);
    else if (message.type === "channel_chunk") this.channel.sendNextChunk();
    else this.objects.handleProxyMessage(message);
    return true;
  }

  dispose() {
    this.memory.dispose();
  }
}

/**
 * The worker end of the bridge: turns host objects into proxies and host
 * functions into calls that block until they settle.
 */
export class WorkerBridge {
  readonly memory: AsyncMemory;
  readonly channel: ChannelWorker;
  readonly objects: ObjectProxyClient;
  readonly calls: SyncCallClient;

  constructor(
    buffers: AsyncMemory.Buffers,
    postMessage: (message: BridgeMessage) => void,
  ) {
    this.memory = new AsyncMemory(buffers);
    this.channel = new ChannelWorker(this.memory, () =>
      postMessage({ type: "channel_chunk" }),
    );
    this.objects = new ObjectProxyClient(this.channel, postMessage);
    this.calls = new SyncCallClient(
      this.channel,
      postMessage,
      this.objects.references,
    );
  }
}
