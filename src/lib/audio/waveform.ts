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
    options: LinearPathOptions
  ): Promise<string>;
}

type PathPromise = {
  seqNum: number;
  resolve(path: string): void;
  reject(): void;
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
  animationframes: number
) => {
  const rawData = audioBuffer.getChannelData(channel);

  const framesData = [];
  if (animation) {
    const frames = audioBuffer.sampleRate / animationframes;
    for (let index = 0; index < rawData.length; index += frames) {
      const partraw = rawData.slice(index, index + frames);
      framesData.push(partraw);
    }
  } else {
    framesData.push(rawData);
  }

  return framesData;
};

export function createWaveformProcessor(): WaveformProcessor {
  const id = nanoid(8);
  let seqNum = 0;

  return {
    async getLinearPath(audioBuffer, options) {
      const { channel = 0, animation = false, animationframes = 10 } = options;

      promises.get(id)?.reject();
      promises.delete(id);

      seqNum = seqNum + 1;

      return new Promise<string>((resolve, reject) => {
        const framesData = getFramesData(
          audioBuffer,
          channel,
          animation,
          animationframes
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
  };
}
