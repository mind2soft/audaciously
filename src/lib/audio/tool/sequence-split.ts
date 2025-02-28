import type { Timeline } from "../../timeline";
import { formatPixelToTime } from "../../util/formatTime";
import { splitSequence } from "../../util/sequences";
import type { AudioTool } from "../tools";

export const sequenceSplitToolKey = "sequence-split@tool";

export function createSequenceSplitTool(timeline: Timeline): AudioTool {
  let abortController: AbortController | null = null;

  return {
    get key() {
      return sequenceSplitToolKey;
    },

    registerHandlers(sequence, target) {
      if (!abortController) {
        abortController = new AbortController();
      }

      const signal = abortController.signal;

      target.addEventListener(
        "mousedown",
        (event) => {
          const track = sequence.track;

          if (!track || track?.locked) {
            return;
          }

          event.stopImmediatePropagation();
          event.preventDefault();

          const splitPosition = event.offsetX;
          const splitTime = formatPixelToTime(timeline.ratio, splitPosition);
          const split = splitSequence(sequence, splitTime);

          track.removeSequence(sequence.id);
          track.addSequence(split.left);
          track.addSequence(split.right);
        },
        { signal }
      );
    },

    unregisterHandlers() {
      abortController?.abort();
      abortController = null;
    },
  };
}
