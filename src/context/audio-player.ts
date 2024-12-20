import {
  Accessor,
  createContext,
  createEffect,
  untrack,
  useContext,
} from "solid-js";
import { isServer } from "solid-js/web";
import { createStaticStore } from "@solid-primitives/static-store";
import { createStore } from "solid-js/store";
import { noop } from "@solid-primitives/utils";

// Set of control enums
export enum AudioPlayerState {
  LOADING = "loading",
  PLAYING = "playing",
  PAUSED = "paused",
  SEEKING = "seeking",
  READY = "ready",
  ERROR = "error",
}

export interface AudioPlayerStore {
  state: AudioPlayerState;
  audioBuffer: AudioBuffer | null;
}

export interface AudioPlayerInternalStore {
  context: AudioContext | null;
  source: AudioBufferSourceNode | null;
  startTime: number;
  stopTime: number;
}

export interface AudioPlayer {
  state: AudioPlayerState;
  currentTime: number;
  play(time?: number): void;
  pause(): void;
  resume(): void;
  seek(time: number): void;
  stop(): void;
}

export const createAudioPlayer = (
  audioBuffer: Accessor<AudioBuffer | undefined>
): AudioPlayer => {
  if (isServer) {
    return {
      state: AudioPlayerState.LOADING,
      currentTime: 0,
      play: noop,
      pause: noop,
      resume: noop,
      seek: noop,
      stop: noop,
    };
  }

  const [audioStore, setAudioStore] = createStore<AudioPlayerStore>({
    state: AudioPlayerState.LOADING,
    audioBuffer: null,
  });
  const [internalStore, setInternalStore] =
    createStaticStore<AudioPlayerInternalStore>({
      context: null,
      source: null,
      stopTime: 0,
      startTime: 0,
    });

  createEffect(() => {
    const buffer = audioBuffer();

    if (buffer?.length) {
      const context = new AudioContext({ sampleRate: buffer.sampleRate });

      setInternalStore("context", context);
      setAudioStore({
        state: AudioPlayerState.READY,
        audioBuffer: buffer,
      });
    } else {
      setInternalStore("context", null);
      setAudioStore({
        state: AudioPlayerState.ERROR,
        audioBuffer: null,
      });
    }
  });

  const play = (time?: number) => {
    const { isReady, isPlaying, audioBuffer } = untrack(() => ({
      isReady:
        audioStore.state !== AudioPlayerState.ERROR &&
        audioStore.state !== AudioPlayerState.LOADING,
      isPlaying: audioStore.state === AudioPlayerState.PLAYING,
      audioBuffer: audioStore.audioBuffer,
    }));
    const context = internalStore.context;

    if (isReady && !isPlaying && audioBuffer && context) {
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.addEventListener("ended", () => {
        setInternalStore({
          stopTime: context.currentTime,
          source: null,
        });
        setAudioStore("state", AudioPlayerState.READY);
      });
      source.connect(context.destination);
      source.start(0, time);

      setInternalStore({
        source: source,
        startTime: context.currentTime - (time ?? 0),
        stopTime: 0,
      });
      setAudioStore("state", AudioPlayerState.PLAYING);
    }
  };
  const pause = () => {
    const isPlaying = untrack(
      () => audioStore.state === AudioPlayerState.PLAYING
    );

    if (isPlaying) {
      const context = internalStore.context;
      const source = internalStore.source;

      console.log("*** [PAUSE] source", source);
      if (source) {
        source.stop();
        source.disconnect();
      }

      setInternalStore({
        stopTime: context?.currentTime ?? 0,
        source: null,
      });
      setAudioStore("state", AudioPlayerState.PAUSED);
    }
  };
  const resume = () => {
    const isPaused = untrack(
      () => audioStore.state === AudioPlayerState.PAUSED
    );

    if (isPaused) {
      play(internalStore.stopTime - internalStore.startTime);
    }
  };
  const seek = (time: number) => {
    const isPlaying = untrack(
      () => audioStore.state === AudioPlayerState.PLAYING
    );
    const source = internalStore.source;
    const context = internalStore.context;

    if (isPlaying && source) {
      source.stop();
      source.disconnect();

      setInternalStore("source", null);
      setAudioStore("state", AudioPlayerState.SEEKING);

      play(time);
    } else if (context) {
      const currentTime = context.currentTime;

      setInternalStore({
        startTime: currentTime - time,
        stopTime: currentTime,
      });
      setAudioStore("state", AudioPlayerState.PAUSED);
    }
  };
  const stop = () => {
    const source = internalStore.source;

    if (source) {
      const context = internalStore.context;

      source.stop();
      source.disconnect();

      setInternalStore({
        stopTime: context?.currentTime ?? 0,
        source: null,
      });
      setAudioStore("state", AudioPlayerState.READY);
    }
  };

  return {
    get state() {
      return audioStore.state;
    },
    get currentTime() {
      const currentTime = internalStore.context?.currentTime ?? 0;
      const startTime = internalStore.startTime;
      const stopTime = internalStore.stopTime;

      return stopTime > startTime
        ? stopTime - startTime
        : currentTime - startTime;
    },
    play,
    pause,
    resume,
    seek,
    stop,
  };
};

export const AudioPlayerContext =
  createContext<ReturnType<typeof createAudioPlayer>>();

export const useAudioPlayer = () => {
  const ctx = useContext(AudioPlayerContext);

  if (!ctx) {
    throw new Error("useAudioPlayer: missing AudioPlayerProvider");
  }

  return ctx;
};
