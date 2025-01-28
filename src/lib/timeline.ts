import { createEmitter, type Emitter } from "./emitter";
import { formatTimeScale } from "./util/formatTime";

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

  render(canvas: HTMLCanvasElement, currentTime: number): void;
}

export enum ScaleDirection {
  UP,
  DOWN,
}

const tickWidth = 128;
const baseWidth = 16;
const scale_a = 4;
const scale_b = 3;
const scale_min = 0.01;
const scale_max = 5000;

const getOptimalTimeStep = (ratio: number) => {
  let timeStep = 1;

  while (formatTimeToPixel(ratio, timeStep) <= tickWidth) {
    timeStep = timeStep * 2;
  }
  while (formatTimeToPixel(ratio, timeStep) > tickWidth) {
    timeStep = timeStep / 2;
  }

  return timeStep;
};

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

    render(canvas, currentTime) {
      const ctx = canvas.getContext("2d");

      if (!ctx) return;

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      const maxOffset = canvas.clientWidth;
      const tickHeight = canvas.clientHeight / 2;

      const computedStyle = getComputedStyle(canvas);
      const fgColor = computedStyle.getPropertyValue("color");
      const font = computedStyle.getPropertyValue("font");

      const timeStep = getOptimalTimeStep(internal.ratio);
      const offsetWidth = formatTimeToPixel(internal.ratio, timeStep);
      const scrollOffset = (offsetWidth / timeStep) * internal.offsetTime;
      let offset = -(scrollOffset % offsetWidth) - offsetWidth;
      let time = ((scrollOffset / offsetWidth) | 0) * timeStep - timeStep;
      let lblText: string;
      let lblMetrics: TextMetrics;
      let lblPrevLimit: number = -offsetWidth;

      ctx.beginPath();

      ctx.textAlign = "start";
      ctx.textBaseline = "top";
      ctx.fillStyle = fgColor;
      ctx.strokeStyle = fgColor;
      ctx.font = font;

      const table: [number, number, string][] = [];

      while (offset < maxOffset) {
        lblText = formatTimeScale(time);
        lblMetrics = ctx.measureText(lblText);

        ctx.moveTo(offset, tickHeight);
        ctx.lineTo(offset, canvas.height);

        if (offset > lblPrevLimit) {
          ctx.fillText(lblText, offset, 5);
          lblPrevLimit = offset + lblMetrics.width;
        }

        table.push([offset, time, formatTimeScale(time)]);

        offset = offset + offsetWidth;
        time = time + timeStep;
      }

      // console.table(table);

      ctx.stroke();
    },

    ...emitter,
  };

  return timeline;
};
