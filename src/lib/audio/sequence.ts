export type AudioEffectStep =
  | {
      endTime: number;
      value: number;
      interpolation?: "discrete" | "linear" | "exponential";
    }
  | {
      endTime: number;
      values: number[];
    };

export type AudioEffect = {
  type: "volume" | "balance";
  initialValue: number;
  steps: AudioEffectStep[];
};

export interface AudioSequence {
  time: number;
  buffer: AudioBuffer;
  effects: AudioEffect[];

  getSource(context: AudioContext, output: AudioNode): AudioBufferSourceNode;
}

function createAudioSequence(
  buffer: AudioBuffer,
  time: number,
  effects?: AudioEffect[]
): AudioSequence {
  effects = effects || [];

  return {
    time,
    buffer,
    effects,

    getSource(context, output) {
      const source = context.createBufferSource();

      source.buffer = buffer;

      source.connect(output); // TOOD: effects

      return source;
    },
  };
}

export { createAudioSequence };
