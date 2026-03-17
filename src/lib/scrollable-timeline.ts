import type { InjectionKey, Ref } from "vue";

export interface ScrollableTimelineContext {
  offsetTime: Ref<number>;
  scaleFactor: Ref<number>;
  viewportWidth: Ref<number>;
  viewportHeight: Ref<number>;
  contentWidth: Ref<number>;
  gutterWidth: Ref<number>;
  pixelsPerSecond: Ref<number>;
  totalDuration: Ref<number>;
  visibleDuration: Ref<number>;
  scrollEl: Ref<HTMLDivElement | undefined>;
}

export const scrollableTimelineKey: InjectionKey<ScrollableTimelineContext> =
  Symbol("scrollable-timeline");
