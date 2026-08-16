import { parentPort, workerData } from "node:worker_threads";
import { WorkerBridge } from "../release/worker/bridge";
import type { AsyncMemory } from "../release/worker/async-memory";
import { settled } from "../release/worker/settled";
import type { SyncFileSystem } from "../release/worker/emscripten-fs";

/**
 * Drives the worker half of the bridge from another thread, so tests exercise
 * the blocking protocol exactly as the kernel worker does.
 */
export type Task =
  | { id: number; kind: "call"; target: string; method: string; args: unknown[] }
  | { id: number; kind: "read"; path: string[] }
  | { id: number; kind: "apply"; path: string[]; args: unknown[] }
  | { id: number; kind: "awaited"; path: string[]; args: unknown[] }
  | { id: number; kind: "reflect"; path: string[]; argument: string[] }
  | { id: number; kind: "fileSystem"; method: keyof SyncFileSystem; args: unknown[] };

export type Outcome = {
  type: "outcome";
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
};

const { buffers, rootId, patience } = workerData as {
  buffers: AsyncMemory.Buffers;
  rootId: string;
  patience?: { interval: number; limit: number };
};

const post = (message: any) => parentPort!.postMessage(message);

const bridge = new WorkerBridge(buffers, post, patience);
const root = bridge.objects.getObjectProxy(rootId);
const fileSystem = bridge.calls.facade<SyncFileSystem>("fs", [
  "get",
  "stat",
  "put",
  "delete",
  "move",
  "listDirectory",
]);

const walk = (path: string[]) => path.reduce<any>((value, key) => value[key], root);

const applyAt = (path: string[], args: unknown[]) => {
  const owner = walk(path.slice(0, -1));
  return owner[path[path.length - 1]](...args);
};

const perform = (task: Task): unknown => {
  if (task.kind === "call")
    return bridge.calls.call(task.target, task.method, ...task.args);
  if (task.kind === "read") return walk(task.path);
  if (task.kind === "apply") return applyAt(task.path, task.args);
  if (task.kind === "awaited")
    return bridge.objects.thenSync(applyAt(task.path, task.args));
  if (task.kind === "reflect")
    return applyAt(task.path, [walk(task.argument)]);
  return (fileSystem[task.method] as any)(...task.args);
};

parentPort!.on("message", (task: Task) => {
  const result = settled.capture(() => perform(task));
  post(
    result.ok
      ? { type: "outcome", id: task.id, ok: true, value: result.value }
      : { type: "outcome", id: task.id, ok: false, error: result.error.message },
  );
});
