import { createSignal } from "solid-js";
import { createReducer } from "@solid-primitives/memo";

export type TimelineTickIntermediate = 1 | 2;

export type TimelineView = {
  tickOffset: number; // position to start drawing ticks (in px)
  tickIncrement: number; // the distance between two ticks (in px)
  tickIntermediate: TimelineTickIntermediate[]; // the number of intermediate ticks (0 for none, 1 for a single mid-tick, 2 for quad ticks)
  timeStart: number; // first tick at duration (in seconds)
  timeIncrement: number; // the increment between two ticks (in seconds)
  scrollOffset: number; // the scroll offset (px)
};

export type TimelineAction =
  | {
      type: "zoom";
      factor: number;
      cursorPosition: number; // the position (px) of the zoom event
      containerWidth: number; // the dimension (px) of the container
    }
  | {
      type: "seek";
      offset: number; // the offset (px) of the seek event
      unit: "px" | "sec"; // defaults to "px"
      relative?: boolean;
    };

export type TimelineState = {
  offset: number; // scaled
  zoom: number; // scale factor : 1ms / zoom
};

const TICK_TARGET_WIDTH = 96; // ticks should at best match this distance

const TICK_ZOOM = 10; // 1 is 100% for 1sec
const TICK_ZOOM_MUL = 0.25; // %
const TICK_MIN_ZOOM = Math.pow(1 - TICK_ZOOM_MUL, 24);
const TICK_MAX_ZOOM = Math.pow(1 + TICK_ZOOM_MUL, 48);

const initialState: TimelineState = {
  offset: 0,
  zoom: TICK_ZOOM,
};

const incrementSteps = [
  0.001,
  0.002,
  0.005,
  0.01,
  0.025,
  0.05,
  0.1,
  0.25,
  0.5, // less than 1 second
  1,
  2,
  5,
  10,
  15,
  20,
  30, // less than 1 minute
  60,
  120,
  300,
  600,
  900,
  1200,
  1800, // less than 1 hour
  3600, // 1
  7200, // 2
  10800, // 3
  18000, // 5
  21600, // 6
  43200, // 12
  86400,
];
const findOptimalTimeIncrement = (tickIncrement: number) => {
  let low = 0;
  let high = incrementSteps.length - 1;

  let realTimeIncrement = TICK_TARGET_WIDTH * tickIncrement;
  let bestTimeIncrement = realTimeIncrement;
  let bestTimeDelta = Infinity;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const timeIncrementStep = incrementSteps[mid];
    const delta = Math.abs(timeIncrementStep - realTimeIncrement);

    if (delta < bestTimeDelta) {
      bestTimeIncrement = timeIncrementStep;
      bestTimeDelta = delta;
    }

    if (timeIncrementStep === realTimeIncrement) {
      low = high + 1;
    } else if (timeIncrementStep < realTimeIncrement) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return bestTimeIncrement;
};

const findTickIntermediate = (
  timeIncrement: number
): TimelineTickIntermediate[] => {
  if (timeIncrement > 3600) {
    timeIncrement = (timeIncrement / 3600) | 0;
  } else if (timeIncrement > 60) {
    timeIncrement = (timeIncrement / 60) | 0;
  } else if (timeIncrement < 1) {
    timeIncrement = (timeIncrement * 1000) | 0;
    if (timeIncrement === 1) {
      return [];
    } else if (timeIncrement === 2) {
      return [1];
    }
  }

  if (0 === timeIncrement % 3 && 0 !== timeIncrement % 5) {
    return [1, 1];
  } else {
    return [1, 2, 1, 2];
  }
};

const computeView = (state: TimelineState): TimelineView => {
  const offsetScale = state.zoom / TICK_TARGET_WIDTH;
  const scrollOffset = state.offset / offsetScale;
  const timeIncrement = findOptimalTimeIncrement(offsetScale);
  const tickIntermediate = findTickIntermediate(timeIncrement);
  const tickIncrement = timeIncrement / offsetScale;
  const tickOffset = -scrollOffset % tickIncrement;
  const timeStart = ((scrollOffset / tickIncrement) | 0) * timeIncrement;

  const view = {
    tickOffset,
    tickIncrement,
    tickIntermediate,
    timeStart,
    timeIncrement,
    scrollOffset,
  };

  return view;
};

const reducer = (state: TimelineState, action: TimelineAction) => {
  switch (action.type) {
    case "zoom":
      {
        const cursorFraction = action.cursorPosition / action.containerWidth;

        const prevOffsetScale = state.zoom / TICK_TARGET_WIDTH;
        const prevWidth = action.containerWidth * prevOffsetScale;
        const factor = 1 + TICK_ZOOM_MUL * Math.abs(action.factor);
        const newZoom =
          action.factor < 0
            ? Math.max(state.zoom / factor, TICK_MIN_ZOOM)
            : Math.min(state.zoom * factor, TICK_MAX_ZOOM);

        const newOffsetScale = newZoom / TICK_TARGET_WIDTH;
        const newWidth = action.containerWidth * newOffsetScale;
        const newOffset =
          state.offset + (prevWidth - newWidth) * cursorFraction;

        state = { zoom: newZoom, offset: Math.max(newOffset, 0) };
      }
      break;
    case "seek":
      {
        const offsetScale =
          action.unit === "px" ? state.zoom / TICK_TARGET_WIDTH : 1;
        const offset = action.offset * offsetScale;

        state = {
          zoom: state.zoom,
          offset: Math.max(action.relative ? state.offset + offset : offset, 0),
        };
      }
      break;
  }

  setTimelineView(computeView(state));

  return state;
};

const [timeline, timelineAction] = createReducer(reducer, initialState, {
  equals(prev, next) {
    return prev.offset === next.offset && prev.zoom === next.zoom;
  },
});
const [timelineView, setTimelineView] = createSignal(computeView(initialState));

export { timeline, timelineAction, timelineView };
