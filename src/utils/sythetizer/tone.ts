export type ToneOptions = {
  frequency: number;
  startTime?: number;
  durationTime: number;
  channels?: number | number[];
  volume?: number;
};

export type Note =
  | {
      type: "note";
      frequency: number;
      tempo?: number;
    }
  | {
      type: "silence";
      tempo?: number;
    };

export type MelodyOptions = {
  startTime?: number;
  noteDuration?: number;
};

export function fillTone(buffer: AudioBuffer, options: ToneOptions) {
  const sampleRate = buffer.sampleRate;
  const startOffset = Math.min(
    (options.startTime ?? 0) * sampleRate,
    buffer.length
  );
  const duration = Math.min(
    options.durationTime * sampleRate,
    buffer.length - startOffset
  );

  if (duration > 0) {
    const frequency = options.frequency;
    const volume = options.volume ?? 1;
    const channels = Array.isArray(options.channels)
      ? options.channels
      : options.channels !== undefined
        ? [options.channels]
        : Array.from({ length: buffer.numberOfChannels }).map(
            (_, index) => index
          );
    const toneData = new Float32Array(duration);

    for (let offset = 0; offset < duration; offset++) {
      toneData[offset] =
        Math.sin((2 * Math.PI * frequency * offset) / sampleRate) * volume;
    }

    for (const channel of channels) {
      buffer.copyToChannel(toneData, channel, startOffset);
    }
  }

  return buffer;
}

export function melody(
  buffer: AudioBuffer,
  melody: Note[],
  options?: MelodyOptions
) {
  const noteDuration = options?.noteDuration ?? 0.4;
  let offset = options?.startTime ?? 0;

  for (let note of melody) {
    if (note.type === "note") {
      const durationTime = (note.tempo ?? 1) * noteDuration;

      fillTone(buffer, {
        startTime: offset,
        durationTime: durationTime - 0.07,
        frequency: note.frequency,
        volume: 0.5,
      });

      offset = offset + durationTime;
    } else if (note.type === "silence") {
      offset = offset + (note.tempo ?? 1) * noteDuration;
    }
  }

  return buffer;
}
