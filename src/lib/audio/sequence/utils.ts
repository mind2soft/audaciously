import type { AudioSequence } from "./index";

export function checkSequenceOverlap<Kind, Type>(
  a: AudioSequence<Kind, Type>,
  b: AudioSequence<Kind, Type>,
  tolerance = 0.001,
) {
  const a1 = a.time;
  const a2 = a1 + a.playbackDuration;
  const b1 = b.time;
  const b2 = b1 + b.playbackDuration;
  const overlap =
    (a1 > b1 + tolerance && a1 < b2 - tolerance) ||
    (b1 > a1 + tolerance && b1 < a2 - tolerance);

  if (overlap)
    console.warn(
      "Overlap detected",
      a1,
      a2,
      b1,
      b2,
      a1 > b1 + tolerance,
      a1 < b2 - tolerance,
      b1 > a1 + tolerance,
      b1 < a2 - tolerance,
    );

  return overlap;
}

export function getSequenceGaps<Kind, Type>(
  sequence: AudioSequence<Kind, Type>,
  sequences?: Iterable<AudioSequence<Kind, Type>>,
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
          seq.time - (sequence.time + sequence.playbackDuration),
        );
      }
    }
  }

  return {
    before: before === Infinity ? sequence.time : before,
    after,
  };
}
