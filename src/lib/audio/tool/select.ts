import type { Timeline } from "../../timeline";
import type { AudioSequence } from "../sequence";
import type { AudioTool } from "../tools";

export const selectToolKey = "select@tool";

export function createSelectTool(_timeline: Timeline): AudioTool {
  let abortController: AbortController | null = null;
  let selectedSequence: AudioSequence<any> | null = null;

  return {
    get key() {
      return selectToolKey;
    },

    registerHandlers(sequence, target) {
      if (!abortController) {
        abortController = new AbortController();
      }
      const signal = abortController.signal;

      target.addEventListener(
        "mousedown",
        (event) => {
          event.stopImmediatePropagation();
          event.preventDefault();

          if (selectedSequence) {
            selectedSequence.selected = false;
            selectedSequence = null;
          }

          sequence.selected = true;
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
