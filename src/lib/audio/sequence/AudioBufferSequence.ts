import { nanoid } from "nanoid";
import { createEmitter } from "../../emitter";
import {
  trackPropertySymbol,
  type AudioEffect,
  type AudioSequence,
  type AudioSequenceEvent,
  type AudioSequenceEventMap,
  type AudioSequenceEventType,
  type AudioSequenceInternal,
  type AudioSequencePlayback,
} from "../sequence";

interface AudioBufferSequencePlayback extends AudioSequencePlayback {
  activeSource?: AudioBufferSourceNode;
  controller?: AbortController;
}

interface AudioBufferSequenceInternal extends AudioSequenceInternal {
  playback?: AudioBufferSequencePlayback;
}

export type AudioBufferSequenceType = typeof audioBufferSequenceType;

export interface AudioBufferSequence
  extends AudioSequence<AudioBufferSequenceType> {}

export const audioBufferSequenceType = "audioBuffer" as const;

export function createAudioBufferSequence(
  buffer: AudioBuffer,
  time: number,
  effects?: AudioEffect[]
): AudioBufferSequence {
  const internal: AudioBufferSequenceInternal = {
    id: nanoid(),
    selected: false,
    playbackRate: 1,
    time,
  };

  const { dispatchEvent, ...emitter } = createEmitter<
    AudioSequenceEventType,
    AudioSequenceEventMap<AudioBufferSequenceType>,
    AudioSequenceEvent<AudioBufferSequenceType, AudioSequenceEventType>
  >((event) => {
    event.sequence = sequence;
    return event;
  });

  effects = effects || [];

  function initPlayback(context: AudioContext, outputNode?: AudioNode) {
    internal.playback = {
      context,
      outputNode: outputNode ?? context.destination,
    };
  }
  function startPlayback(startTime: number, currentTime?: number) {
    if (!internal.playback || internal.time + buffer.duration < startTime) {
      return;
    }

    const sourceTime = internal.time - startTime;
    const controller = new AbortController();
    const source = internal.playback.context.createBufferSource();

    currentTime = currentTime ?? internal.playback.context.currentTime;

    source.buffer = buffer;
    source.playbackRate.value = internal.playbackRate;

    internal.playback.activeSource = source;
    internal.playback.controller = controller;

    // TODO: apply effects

    source.connect(internal.playback.outputNode); // TOOD: effects
    source.addEventListener(
      "ended",
      () => {
        cleanupPlayback();
        dispatchEvent({ type: "stop" });
      },
      { signal: controller.signal }
    );

    if (sourceTime >= 0) {
      source.start(currentTime + sourceTime);
    } else {
      source.start(currentTime, -sourceTime);
    }
  }
  function stopPlayback() {
    if (internal.playback?.activeSource) {
      internal.playback.controller?.abort();
      internal.playback.activeSource.stop();
      internal.playback.activeSource.disconnect();
      internal.playback.activeSource = undefined;
    }
  }
  function cleanupPlayback() {
    stopPlayback();
    internal.playback = undefined;
  }

  const sequence: AudioBufferSequence = {
    get [trackPropertySymbol]() {
      return internal.track;
    },
    set [trackPropertySymbol](value) {
      internal.track = value;
    },

    get type() {
      return audioBufferSequenceType;
    },

    get track() {
      return internal.track;
    },

    get id() {
      return internal.id;
    },

    get time() {
      return internal.time;
    },
    set time(value) {
      const hasChanged = value !== internal.time;

      internal.time = value;

      if (hasChanged) {
        dispatchEvent({ type: "change" });
      }
    },

    get duration() {
      return buffer.duration;
    },
    get playbackDuration() {
      return buffer.duration / internal.playbackRate;
    },

    get isPlaying() {
      return !!internal.playback?.activeSource;
    },

    get playbackRate() {
      return internal.playbackRate;
    },
    set playbackRate(value) {
      const hasChanged = value !== internal.playbackRate;

      internal.playbackRate = value;

      if (hasChanged && internal.playback?.activeSource) {
        internal.playback.activeSource.playbackRate.value =
          internal.playbackRate;

        dispatchEvent({ type: "change" });
      }
    },
    get selected() {
      return internal.selected;
    },
    set selected(value) {
      const hasChanged = internal.selected !== value;

      internal.selected = value;

      if (hasChanged) {
        dispatchEvent({ type: "change" });
      }
    },

    get buffer() {
      return buffer;
    },

    async play(context, options = {}) {
      if (internal.playback?.activeSource) {
        return;
      }

      const startTime = options.startTime ?? 0;

      initPlayback(context, options.output);
      startPlayback(startTime, options.currentTime);
      dispatchEvent({ type: "play" });
    },
    seek(time) {
      if (!internal.playback) {
        return;
      }

      stopPlayback();
      startPlayback(time);
      dispatchEvent({ type: "seek" });
    },
    stop() {
      if (!internal.playback) {
        return;
      }

      cleanupPlayback();
      dispatchEvent({ type: "stop" });
    },

    ...emitter,
  };

  return sequence;
}
