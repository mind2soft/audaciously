import { formatPixelToTime, formatTimeToPixel } from "../../util/formatTime";
import { getSequenceGaps } from "../../util/sequences";
import type { AudioSequence } from "../sequence";
import type { AudioTool } from "../tools";
import type { Timeline } from "../../timeline"; // Import Timeline type

type DraggableSequence = {
  sequenceId: string;
  ghost: HTMLElement;
  initialClientX: number;
  minDeltaX: number;
  maxDeltaX: number;
};

export const startTimeToolKey = Symbol.for("#start-time");

function getInitialPointer(
  sequence: AudioSequence<any>,
  timeline: Timeline,
  target: HTMLElement,
  event: MouseEvent
): DraggableSequence {
  const gaps = getSequenceGaps(sequence, sequence.track?.getSequences());

  let minDeltaX = -formatTimeToPixel(timeline.ratio, gaps.before);
  let maxDeltaX = formatTimeToPixel(timeline.ratio, gaps.after);

  return {
    sequenceId: sequence.id,
    ghost: target.cloneNode(true) as HTMLElement,
    initialClientX: event.clientX,
    minDeltaX,
    maxDeltaX,
  };
}

function clampedDetlaX(
  event: MouseEvent,
  draggable: DraggableSequence
): number {
  const deltaX = event.clientX - draggable.initialClientX;
  return Math.min(draggable.maxDeltaX, Math.max(draggable.minDeltaX, deltaX));
}

export function createeStartTimeTool(timeline: Timeline): AudioTool {
  // Add timeline parameter
  let abortController: AbortController | null = null;
  let draggable: DraggableSequence | null = null;

  return {
    get key() {
      return startTimeToolKey;
    },

    registerHandlers(sequence, target) {
      if (!abortController) {
        abortController = new AbortController();
      }

      const signal = abortController.signal;

      target.addEventListener(
        "mousedown",
        (event) => {
          if (sequence.track?.locked) {
            return;
          }

          event.stopImmediatePropagation();
          event.preventDefault();
          draggable = getInitialPointer(sequence, timeline, target, event);

          target.style.opacity = "0.8";
          target.parentElement?.appendChild(draggable.ghost);
        },
        { signal }
      );
      document.addEventListener(
        "mousemove",
        (event) => {
          if (draggable) {
            event.stopImmediatePropagation();
            event.preventDefault();

            const deltaX = clampedDetlaX(event, draggable);

            draggable.ghost.style.transform = `translateX(${deltaX}px)`;
          }
        },
        { signal }
      );
      document.addEventListener(
        "mouseup",
        (event) => {
          if (draggable?.sequenceId === sequence.id) {
            event.stopImmediatePropagation();
            event.preventDefault();

            const deltaX = clampedDetlaX(event, draggable);

            target.style.opacity = "";
            draggable.ghost.remove();

            const newStartTime =
              sequence.time + formatPixelToTime(timeline.ratio, deltaX);

            sequence.time = newStartTime;
            draggable = null;
          }
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
