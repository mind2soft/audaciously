import { createEmitter, type Emitter } from "./emitter";

interface TimelineEvent<EventType extends TimelineEventType> {
  type: EventType;
  timeline: Timeline;
}

type TimelineEventMap = {
  change: (event: TimelineEvent<"change">) => void;
};

type TimelineEventType = keyof TimelineEventMap;

interface TimelineInternal {
  ratio: number;
  offsetTime: number;
}

export type TimelineOptions = {
  ratio?: number;
  offsetTime?: number;
};

export interface Timeline extends Emitter<TimelineEventType, TimelineEventMap> {
  ratio: number;
  offsetTime: number;

  setValues(ratio: number, offsetTime: number): void;

  render(canvas: HTMLCanvasElement): void;
}

export enum ScaleDirection {
  UP,
  DOWN,
}

const baseWidth = 16;
const scale_a = 5;
const scale_b = 4;
const scale_min = 0.1;
const scale_max = 1000;

export const scaleRatio = (ratio: number, dir: ScaleDirection) => {
  const scaleValue =
    dir === ScaleDirection.UP ? scale_b / scale_a : scale_a / scale_b;
  const newRatio = ratio * scaleValue;

  return newRatio > scale_min && newRatio < scale_max ? newRatio : ratio;
};

export const formatTimeToPixel = (ratio: number, time: number) => {
  return ratio * time * baseWidth;
};

export const formatPixelToTime = (ratio: number, px: number) => {
  return px / baseWidth / ratio;
};

export const createTimeline = (options?: TimelineOptions): Timeline => {
  const internal: TimelineInternal = {
    ratio: options?.ratio ?? 1,
    offsetTime: options?.offsetTime ?? 0,
  };

  const { dispatchEvent, ...emitter } = createEmitter<
    TimelineEventType,
    TimelineEventMap,
    TimelineEvent<TimelineEventType>
  >((event) => {
    event.timeline = timeline;
    return event;
  });

  const timeline: Timeline = {
    get ratio() {
      return internal.ratio;
    },
    set ratio(value) {
      if (internal.ratio !== value) {
        internal.ratio = value;

        dispatchEvent({ type: "change" });
      }
    },

    get offsetTime() {
      return internal.offsetTime;
    },
    set offsetTime(value) {
      value = Math.max(value, 0);

      if (internal.offsetTime !== value) {
        internal.offsetTime = value;

        dispatchEvent({ type: "change" });
      }
    },

    setValues(ratio, offsetTime) {
      offsetTime = Math.max(offsetTime, 0);

      if (internal.ratio !== ratio || internal.offsetTime !== offsetTime) {
        internal.ratio = ratio;
        internal.offsetTime = Math.max(offsetTime, 0);

        dispatchEvent({ type: "change" });
      }
    },

    render(canvas) {
      // ...
    },

    ...emitter,
  };

  return timeline;
};
