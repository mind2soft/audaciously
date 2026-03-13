// stores/timeline.ts
// useTimelineStore — wraps the Timeline engine with reactive Vue state.
// See: .opencode/context/refactor/03-state-management.md (P2-02)
//
// The Timeline engine (lib/timeline.ts) is kept UNCHANGED.
// This store syncs ratio/offsetTime refs from engine change events.

import { defineStore } from "pinia";
import { ref } from "vue";
import { createTimeline, scaleRatio, ScaleDirection, type Timeline } from "../lib/timeline";

export const useTimelineStore = defineStore("timeline", () => {
  // ── Internal engine ───────────────────────────────────────────────────────
  const engine: Timeline = createTimeline();

  // ── Reactive state (mirrors engine state) ─────────────────────────────────
  const ratio = ref(engine.ratio);
  const offsetTime = ref(engine.offsetTime);

  // ── Sync engine change events → reactive refs ─────────────────────────────
  engine.addEventListener("change", () => {
    ratio.value = engine.ratio;
    offsetTime.value = engine.offsetTime;
  });

  // ── Actions ────────────────────────────────────────────────────────────────

  function setRatio(v: number): void {
    engine.ratio = v;
    // The change event handler will update ratio.value
  }

  function setOffsetTime(v: number): void {
    engine.offsetTime = v;
    // The change event handler will update offsetTime.value
  }

  function setValues(r: number, o: number): void {
    engine.setValues(r, o);
  }

  function scaleUp(): void {
    engine.ratio = scaleRatio(engine.ratio, ScaleDirection.UP);
  }

  function scaleDown(): void {
    engine.ratio = scaleRatio(engine.ratio, ScaleDirection.DOWN);
  }

  // ── Engine access ─────────────────────────────────────────────────────────

  function getEngine(): Timeline {
    return engine;
  }

  // ── Canvas render helper (delegated to engine) ────────────────────────────
  function render(canvas: HTMLCanvasElement, currentTime: number): void {
    engine.render(canvas, currentTime);
  }

  return {
    // state
    ratio,
    offsetTime,
    // actions
    setRatio,
    setOffsetTime,
    setValues,
    scaleUp,
    scaleDown,
    // engine access
    getEngine,
    render,
  };
});
