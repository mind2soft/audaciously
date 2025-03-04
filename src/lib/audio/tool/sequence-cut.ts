import type { AudioTool } from "../tools";

export const sequenceCutToolKey = "sequence-cut@tool";

export function createSequenceCutTool(): AudioTool {
  let abortController: AbortController | null = null;

  return {
    get key() {
      return sequenceCutToolKey;
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

          track.removeSequence(sequence.id);
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
