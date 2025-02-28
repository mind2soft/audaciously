import { createAudioBufferSequence } from "../audio/sequence/AudioBufferSequence";
import type { AudioBufferSequence } from "../audio/sequence/AudioBufferSequence";
import type { AudioSequence } from "../audio/sequence";

export function getSequenceGaps(
  sequence: AudioSequence<any>,
  sequences?: Iterable<AudioSequence<any>>
): { before: number; after: number } {
  let before = Infinity;
  let after = Infinity;

  if (sequences) {
    for (const seq of sequences) {
      if (seq === sequence) {
        continue;
      }

      const seqEnd = seq.time + seq.playbackDuration;

      if (seqEnd <= sequence.time) {
        before = Math.min(before, sequence.time - seqEnd);
      } else if (seq.time >= sequence.time + sequence.playbackDuration) {
        after = Math.min(
          after,
          seq.time - (sequence.time + sequence.playbackDuration)
        );
      }
    }
  }

  return {
    before: before === Infinity ? sequence.time : before,
    after,
  };
}

export function splitSequence(
  sequence: AudioBufferSequence,
  splitTime: number
): { left: AudioBufferSequence; right: AudioBufferSequence } {
  const buffer = sequence.buffer;
  const sampleRate = buffer.sampleRate;
  const splitSample = Math.round(splitTime * sampleRate);

  const leftBuffer = new AudioBuffer({
    length: splitSample,
    sampleRate,
    numberOfChannels: buffer.numberOfChannels,
  });
  const rightBuffer = new AudioBuffer({
    length: buffer.length - splitSample,
    sampleRate,
    numberOfChannels: buffer.numberOfChannels,
  });

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    const leftChannelData = leftBuffer.getChannelData(channel);
    const rightChannelData = rightBuffer.getChannelData(channel);

    leftChannelData.set(channelData.subarray(0, splitSample));
    rightChannelData.set(channelData.subarray(splitSample));
  }

  const left = createAudioBufferSequence(leftBuffer, sequence.time);
  const right = createAudioBufferSequence(
    rightBuffer,
    sequence.time + splitTime
  );

  return { left, right };
}
