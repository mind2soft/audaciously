import type { Timeline } from "../../timeline";
import type { AudioSequence } from "../sequence/index";
import type { AudioTool } from "../tools";

export const selectToolKey = "select@tool";

export function createSelectTool(
  _timeline: Timeline,
  options?: { onInteract?: () => void },
): AudioTool {
  let abortController: AbortController | null = null;
  let selectedSequence: AudioSequence<any, any> | null = null;

  return {
    get key() {
      return selectToolKey;
    },

    registerHandlers(sequence, target) {
      abortController ??= new AbortController();
      const signal = abortController.signal;

      target.addEventListener(
        "mousedown",
        (event) => {
          options?.onInteract?.();
          event.stopImmediatePropagation();
          event.preventDefault();

          if (selectedSequence) {
            selectedSequence.selected = false;
            selectedSequence = null;
          }

          sequence.selected = true;
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
