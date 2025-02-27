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
