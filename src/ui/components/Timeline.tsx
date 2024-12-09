import { createEffect, createSignal, onCleanup } from "solid-js";
import { throttle } from "@solid-primitives/scheduled";
import {
  timelineAction,
  timelineView,
  type TimelineView,
} from "../../store/timeline";
import { formatTimeScale } from "../../utils/formatTime";
import { createSpring } from "@solid-primitives/spring";

type PointerMoveDelta = {
  value: number;
  timestamp: number;
};

const REFRESH_THOTTLE = 10; // ms
const AVG_DELTA_COUNT = 20;
const AVG_DELTA_TIMEOUT = 200; // ms

const render = throttle(function renderTimeline(
  canvas: HTMLCanvasElement,
  view: TimelineView,
  pointerX?: number
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const computedStyle = getComputedStyle(canvas);
  const fgColor = computedStyle.getPropertyValue("color");
  const font = computedStyle.getPropertyValue("font");
  const fontScale = 0.75;

  const tickStart = view.tickOffset;
  const tickWidth = view.tickIncrement;
  const timeStart = view.timeStart;
  const timeIncrement = view.timeIncrement;

  const canvasWidth = (canvas.width = canvas.offsetWidth);
  const canvasHeight = (canvas.height = canvas.offsetHeight);

  const interTicks = view.tickIntermediate;
  const interTicksLen = interTicks.length;
  const interWidth = interTicksLen ? tickWidth / (interTicksLen + 1) : 0;
  const tickLowHeight = canvasHeight / 6;
  const tickMidHeight = canvasHeight / 3;

  ctx.strokeStyle = fgColor;
  ctx.lineWidth = 2;

  ctx.beginPath();
  for (let x = tickStart; x < canvasWidth; x = x + tickWidth) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);

    for (let j = 0, xx; j < interTicksLen; j++) {
      xx = x + (j + 1) * interWidth;
      ctx.moveTo(
        xx,
        canvasHeight - (interTicks[j] === 1 ? tickLowHeight : tickMidHeight)
      );
      ctx.lineTo(xx, canvasHeight);
    }
  }
  ctx.stroke();

  if (pointerX !== undefined) {
    ctx.strokeStyle = fgColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pointerX, 0);
    ctx.lineTo(pointerX, canvasHeight);
    ctx.stroke();
  }

  ctx.save();
  ctx.scale(fontScale, fontScale);
  ctx.fillStyle = fgColor;
  ctx.font = font;
  ctx.textAlign = "start";
  ctx.textBaseline = "top";
  for (
    let i = tickStart, step = timeStart;
    i < canvasWidth;
    i = i + tickWidth, step = step + timeIncrement
  ) {
    ctx.fillText(formatTimeScale(step), (i + 4) / fontScale, 0);
  }
  ctx.restore();
}, REFRESH_THOTTLE);

function monitorCanvas(canvas: HTMLCanvasElement): () => void {
  const resizeObserver = new ResizeObserver(() => {
    render(canvas, timelineView(), pointerOffset());
  });
  resizeObserver.observe(canvas);

  return () => {
    resizeObserver.disconnect();
  };
}

const [pointerOffset, setPointerOffset] = createSignal(0);

function Timeline() {
  const [drawCursor, setDrawCursor] = createSignal(false);
  const [deltaMove, setDeltaMove] = createSpring(0, { stiffness: 0.03 });
  let canvasRef: HTMLCanvasElement | undefined;
  let isMoving: boolean = false;
  let initialOffset: number;
  let initialClientX: number;
  let averageDeltaIndex = 0;
  let lastClientX: number;
  const averageDelta: PointerMoveDelta[] = [];

  const handleCanvasScroll = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const factor = Math.sign(e.deltaY);

    if (factor && canvasRef) {
      const rect = canvasRef.getBoundingClientRect();
      const containerWidth = rect.width;
      const cursorPosition = e.clientX - rect.left;
      timelineAction({ type: "zoom", factor, containerWidth, cursorPosition });
    }
  };
  const handleCanvasTouch = (_e: TouchEvent) => {
    /* implement pinch */
  };

  const handleSlideStart = (target: HTMLElement, initialX: number) => {
    if (target === canvasRef) {
      isMoving = true;
      initialOffset = timelineView().scrollOffset;
      lastClientX = initialClientX = initialX;
      document.documentElement.style.userSelect = "none";

      setDeltaMove(0, { hard: true });
    }
  };
  const handleMouseDown = (e: MouseEvent) => {
    handleSlideStart(e.target as HTMLElement, e.clientX);
  };
  const handleTouchStart = (e: TouchEvent) => {
    handleSlideStart(e.target as HTMLElement, e.touches[0].clientX);
  };

  const handleSlideStop = () => {
    if (isMoving) {
      isMoving = false;
      document.documentElement.style.userSelect = "";

      const tsThreshold = Date.now() - AVG_DELTA_TIMEOUT;
      const totalDelta = averageDelta.splice(0, AVG_DELTA_COUNT);
      const residualDelta =
        totalDelta.reduce(
          (sum, delta) =>
            sum + (delta.timestamp > tsThreshold ? delta.value : 0),
          0
        ) / totalDelta.length;
      averageDeltaIndex = 0;

      setDeltaMove(residualDelta, { hard: true });
      setDeltaMove(0);
    }
  };

  const handleSliding = (newX: number) => {
    if (isMoving) {
      const delta = initialClientX - newX;
      averageDelta[averageDeltaIndex] = {
        value: lastClientX - newX,
        timestamp: Date.now(),
      };
      averageDeltaIndex = (averageDeltaIndex + 1) % AVG_DELTA_COUNT;
      lastClientX = newX;
      timelineAction({
        type: "seek",
        offset: initialOffset + delta,
        unit: "px",
      });
    }
  };
  const handleMouseMove = (e: MouseEvent) => {
    handleSliding(e.clientX);

    if (canvasRef) {
      const rect = canvasRef.getBoundingClientRect();
      setPointerOffset(e.clientX - rect.left);
    }
  };
  const handleTouchMove = (e: TouchEvent) => {
    handleSliding(e.touches[0].clientX);
  };

  createEffect(() => {
    const offset = deltaMove();

    if (!isMoving && offset) {
      timelineAction({ type: "seek", offset, unit: "px", relative: true });
    }
  });

  createEffect(() => {
    if (canvasRef) {
      onCleanup(monitorCanvas(canvasRef));
    }
  });
  createEffect(() => {
    const pointerX = pointerOffset();
    const showCursor = drawCursor();

    if (canvasRef) {
      render(canvasRef, timelineView(), showCursor ? pointerX : undefined);
    }
  });
  createEffect(() => {
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleSlideStop);
    document.addEventListener("mousemove", handleMouseMove);

    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchend", handleSlideStop);
    document.addEventListener("touchmove", handleTouchMove);

    onCleanup(() => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleSlideStop);
      document.removeEventListener("mousemove", handleMouseMove);

      document.addEventListener("touchstart", handleTouchStart);
      document.addEventListener("touchend", handleSlideStop);
      document.addEventListener("touchmove", handleTouchMove);
    });
  });

  return (
    <canvas
      ref={canvasRef}
      class="w-full h-full cursor-pointer"
      on:mouseenter={() => setDrawCursor(true)}
      on:mouseleave={() => setDrawCursor(false)}
      on:wheel={handleCanvasScroll}
      on:touchmove={handleCanvasTouch}
    ></canvas>
  );
}

export default Timeline;
