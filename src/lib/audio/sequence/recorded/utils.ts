import type { RecordedSequence } from ".";
import type { BufferedAudioSequence } from "..";
import { createRecordedSequence } from "./recorded-sequence";

export function splitSequence<Kind>(
  sequence: BufferedAudioSequence<Kind>,
  splitTime: number,
): { left: RecordedSequence; right: RecordedSequence } {
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

  const left = createRecordedSequence(leftBuffer, sequence.time);
  const right = createRecordedSequence(rightBuffer, sequence.time + splitTime);

  return { left, right };
}
