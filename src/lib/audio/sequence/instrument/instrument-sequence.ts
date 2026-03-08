import {
  bufferedAudioSequenceType,
  type AudioSequencePlayback,
  type BufferedAudioSequenceType,
} from "../index";
import { createAudioSequence } from "../sequence";
import type { InstrumentTrackKind } from "../../track/instrument/index";
import type { InstrumentalSequence } from "./index";

// ─── Internal playback state ──────────────────────────────────────────────────

interface InstrumentalSequencePlayback extends AudioSequencePlayback {
  activeSource?: AudioBufferSourceNode;
  controller?: AbortController;
}

interface InstrumentalSequencePlaybackInternal {
  playback?: InstrumentalSequencePlayback;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createInstrumentSequence(
  buffer: AudioBuffer,
  time: number,
): InstrumentalSequence {
  return createAudioSequence<
    InstrumentTrackKind,
    BufferedAudioSequenceType,
    InstrumentalSequence
  >(bufferedAudioSequenceType, time, (base, dispatchEvent) => {
    const state: InstrumentalSequencePlaybackInternal = {};

    function initPlayback(context: AudioContext, outputNode?: AudioNode) {
      state.playback = {
        context,
        outputNode: outputNode ?? context.destination,
      };
    }

    function startPlayback(startTime: number, currentTime?: number) {
      if (
        !state.playback ||
        base.time + buffer.duration / base.playbackRate < startTime
      ) {
        return;
      }

      const sourceTime = base.time - startTime;
      const controller = new AbortController();
      const source = state.playback.context.createBufferSource();

      currentTime = currentTime ?? state.playback.context.currentTime;

      source.buffer = buffer;
      const playbackRate = isFinite(base.playbackRate) && base.playbackRate > 0
        ? base.playbackRate
        : 1;
      source.playbackRate.value = playbackRate;

      state.playback.activeSource = source;
      state.playback.controller = controller;

      source.connect(state.playback.outputNode);
      source.addEventListener(
        "ended",
        () => {
          cleanupPlayback();
          dispatchEvent({ type: "stop" });
        },
        { signal: controller.signal },
      );

      if (sourceTime >= 0) {
        source.start(currentTime + sourceTime);
      } else {
        source.start(currentTime, -sourceTime);
      }
    }

    function stopPlayback() {
      if (state.playback?.activeSource) {
        state.playback.controller?.abort();
        state.playback.activeSource.stop();
        state.playback.activeSource.disconnect();
        state.playback.activeSource = undefined;
      }
    }

    function cleanupPlayback() {
      stopPlayback();
      state.playback = undefined;
    }

    return {
      get buffer() {
        return buffer;
      },

      get duration() {
        return buffer.duration;
      },
      get playbackDuration() {
        return buffer.duration / base.playbackRate;
      },

      get isPlaying() {
        return !!state.playback?.activeSource;
      },

      set playbackRate(value: number) {
        const hasChanged = value !== base.playbackRate;

        base.playbackRate = value;

        if (hasChanged && state.playback?.activeSource) {
          const safeRate = isFinite(base.playbackRate) && base.playbackRate > 0
            ? base.playbackRate
            : 1;
          state.playback.activeSource.playbackRate.value = safeRate;
          dispatchEvent({ type: "change" });
        }
      },

      async play(
        context: AudioContext,
        options: {
          output?: AudioNode;
          currentTime?: number;
          startTime?: number;
        } = {},
      ) {
        if (state.playback?.activeSource) {
          return;
        }

        const startTime = options.startTime ?? 0;

        initPlayback(context, options.output);
        startPlayback(startTime, options.currentTime);
        dispatchEvent({ type: "play" });
      },

      seek(time: number) {
        if (!state.playback) {
          return;
        }

        stopPlayback();
        startPlayback(time);
        dispatchEvent({ type: "seek" });
      },

      stop() {
        if (!state.playback) {
          return;
        }

        cleanupPlayback();
        dispatchEvent({ type: "stop" });
      },
    };
  });
}
