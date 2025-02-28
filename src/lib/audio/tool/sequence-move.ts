import {
  formatPixelToTime,
  formatTime,
  formatTimeToPixel,
} from "../../util/formatTime";
import { getSequenceGaps } from "../../util/sequences";
import type { AudioSequence } from "../sequence";
import type { AudioTool } from "../tools";
import type { Timeline } from "../../timeline"; // Import Timeline type

type DraggableSequence = {
  sequenceId: string;
  ghost: HTMLElement;
  label: HTMLElement;
  initialClientX: number;
  minDeltaX: number;
  maxDeltaX: number;
};

export const sequenceMoveToolKey = "sequence-move@tool";

function getDraggable(
  sequence: AudioSequence<any>,
  timeline: Timeline,
  target: HTMLElement,
  event: MouseEvent
): DraggableSequence {
  const gaps = getSequenceGaps(sequence, sequence.track?.getSequences());

  const ghost = target.cloneNode(true) as HTMLElement;
  let minDeltaX = -formatTimeToPixel(timeline.ratio, gaps.before);
  let maxDeltaX = formatTimeToPixel(timeline.ratio, gaps.after);

  const label = document.createElement("div");
  label.style.position = "relative";
  label.style.left = "0px";
  label.style.bottom = "100%";

  ghost.appendChild(label);

  target.style.opacity = "0.4";
  target.parentElement?.appendChild(ghost);

  return {
    sequenceId: sequence.id,
    ghost,
    label,
    initialClientX: event.clientX,
    minDeltaX,
    maxDeltaX,
  };
}

function cleanDraggable(draggable: DraggableSequence, target?: HTMLElement) {
  if (target) {
    target.style.opacity = "";
  }

  draggable.ghost.remove();

  return null;
}

function clampedDetlaX(
  event: MouseEvent,
  draggable: DraggableSequence
): number {
  const deltaX = event.clientX - draggable.initialClientX;
  return Math.min(draggable.maxDeltaX, Math.max(draggable.minDeltaX, deltaX));
}

export function createeSequenceMoveTool(timeline: Timeline): AudioTool {
  let abortController: AbortController | null = null;
  let draggable: DraggableSequence | null = null;

  return {
    get key() {
      return sequenceMoveToolKey;
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
          draggable = getDraggable(sequence, timeline, target, event);
        },
        { signal }
      );
      document.addEventListener(
        "mousemove",
        (event) => {
          if (draggable?.sequenceId === sequence.id) {
            event.stopImmediatePropagation();
            event.preventDefault();

            const deltaX = clampedDetlaX(event, draggable);

            draggable.ghost.style.transform = `translateX(${deltaX}px)`;
            draggable.label.innerHTML = formatTime(
              sequence.time + formatPixelToTime(timeline.ratio, deltaX)
            );
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
            const newStartTime =
              sequence.time + formatPixelToTime(timeline.ratio, deltaX);

            sequence.time = newStartTime;

            draggable = cleanDraggable(draggable, target);
          }
        },
        { signal }
      );
    },
    unregisterHandlers() {
      abortController?.abort();
      abortController = null;

      if (draggable) {
        draggable = cleanDraggable(draggable);
      }
    },
  };
}
