import { nanoid } from "nanoid";
import WaveformWorker from "../../workers/waveform-processor?worker";
import type {
  WaveformMessage,
  LinearPathOptions,
  WaveformResponse,
} from "../../workers/waveform-processor";

export interface WaveformProcessor {
  getLinearPath(
    framesData: AudioBuffer,
    options: LinearPathOptions,
  ): Promise<string>;
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

const getFramesData = (
  audioBuffer: AudioBuffer,
  channel: number,
  animation: boolean,
  animationframes: number,
  start?: number,
  end?: number,
) => {
  const rawData = audioBuffer.getChannelData(channel);
  const slicedData =
    start !== undefined || end !== undefined
      ? rawData.slice(start ?? 0, end ?? rawData.length)
      : rawData;

  const framesData = [];
  if (animation) {
    const frames = audioBuffer.sampleRate / animationframes;
    for (let index = 0; index < slicedData.length; index += frames) {
      const partraw = slicedData.slice(index, index + frames);
      framesData.push(partraw);
    }
  } else {
    framesData.push(slicedData);
  }

  return framesData;
};

export function createWaveformProcessor(): WaveformProcessor {
  const id = nanoid(8);
  let seqNum = 0;

  return {
    async getLinearPath(audioBuffer, options) {
      const {
        channel = 0,
        animation = false,
        animationframes = 10,
        start,
        end,
      } = options;

      promises.get(id)?.reject();
      promises.delete(id);

      seqNum = seqNum + 1;

      return new Promise<string>((resolve, reject) => {
        const framesData = getFramesData(
          audioBuffer,
          channel,
          animation,
          animationframes,
          start,
          end,
        );

        promises.set(id, { seqNum, resolve, reject });
        processor.postMessage({
          id,
          seqNum,
          type: "linear",
          framesData,
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
