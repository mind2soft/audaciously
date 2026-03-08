import type { Timeline } from "../../timeline";
import { formatPixelToTime } from "../../util/formatTime";
import { splitSequence } from "../sequence/recorded/utils";
import type { BufferedAudioSequence } from "../sequence/index";
import type { AudioTrack } from "../track";
import type { AudioTool } from "../tools";

export const sequenceSplitToolKey = "sequence-split@tool" as const;

export function createSequenceSplitTool(
  timeline: Timeline,
  options?: { onInteract?: () => void },
): AudioTool {
  let abortController: AbortController | null = null;

  return {
    get key() {
      return sequenceSplitToolKey;
    },

    registerHandlers(sequence, target) {
      abortController ??= new AbortController();

      const signal = abortController.signal;

      target.addEventListener(
        "mousedown",
        (event) => {
          const track = sequence.track;

          if (!track || track?.locked) {
            return;
          }

          options?.onInteract?.();
          event.stopImmediatePropagation();
          event.preventDefault();

          const splitPosition = event.offsetX;
          const splitTime = formatPixelToTime(timeline.ratio, splitPosition);
          // The split tool is only registered on recorded sequences in practice.
          const split = splitSequence(sequence as BufferedAudioSequence<any>, splitTime);

          track.removeSequence(sequence.id);
          (track as AudioTrack<any>).addSequence(split.left);
          (track as AudioTrack<any>).addSequence(split.right);
        },
        { signal },
      );
    },

    unregisterHandlers() {
      abortController?.abort();
      abortController = null;
    },
  };
}
