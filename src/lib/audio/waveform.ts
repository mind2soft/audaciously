import { nanoid } from "nanoid";
import type {
  LinearPathOptions,
  WaveformMessage,
  WaveformResponse,
} from "../../workers/waveform-processor";
import WaveformWorker from "../../workers/waveform-processor?worker";

export interface WaveformProcessor {
  getLinearPath(chunk: Float32Array, options: LinearPathOptions): Promise<string>;
  /** Reject any in-flight request for this processor and remove it from the
   *  promises map. Call when the owning component is unmounted / destroyed. */
  dispose(): void;
}

type PathPromise = {
  seqNum: number;
  resolve(path: string): void;
  reject(reason?: unknown): void;
};

const processor = new WaveformWorker();
const promises: Map<string, PathPromise> = new Map();

processor.addEventListener("message", (evt: MessageEvent<WaveformResponse>) => {
  const { id, seqNum, path } = evt.data;
  const promise = promises.get(id);

  if (promise?.seqNum === seqNum) {
    promise.resolve(path);
    promises.delete(id);
  }
});

export function createWaveformProcessor(): WaveformProcessor {
  const id = nanoid(8);
  let seqNum = 0;

  return {
    async getLinearPath(chunk, options) {
      promises.get(id)?.reject();
      promises.delete(id);

      seqNum = seqNum + 1;

      return new Promise<string>((resolve, reject) => {
        promises.set(id, { seqNum, resolve, reject });
        processor.postMessage({
          id,
          seqNum,
          type: "linear",
          framesData: [chunk],
          options,
        } satisfies WaveformMessage);
      });
    },

    dispose() {
      // Reject and remove the pending promise entry for this processor instance.
      // The module-level worker is shared across all instances and is not terminated here.
      const pending = promises.get(id);
      if (pending) {
        pending.reject(new Error("WaveformProcessor disposed"));
        promises.delete(id);
      }
    },
  };
}
