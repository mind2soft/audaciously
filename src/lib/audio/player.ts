import { createEmitter, type Emitter } from "../emitter";
import type { AudioTrack } from "./track";

interface AudioPlayerEvent<EventType extends string> {
  type: EventType;
  player: AudioPlayer;
}

export interface AudioPlayerTImeUpdateEvent extends AudioPlayerEvent<"timeupdate"> {
  readonly audioFrame: AudioBuffer;
}

type AudioPlayerEventMap = {
  play: (event: AudioPlayerEvent<"play">) => void;
  pause: (event: AudioPlayerEvent<"pause">) => void;
  resume: (event: AudioPlayerEvent<"resume">) => void;
  seek: (event: AudioPlayerEvent<"seek">) => void;
  stop: (event: AudioPlayerEvent<"stop">) => void;
  timeupdate: (event: AudioPlayerTImeUpdateEvent) => void;
  change: (event: AudioPlayerEvent<"change">) => void;
  volumechange: (event: AudioPlayerEvent<"volumechange">) => void;
  // error: (event: PlayerEvent<"error">) => void;
};

type AudioPlayerState = "ready" | "playing" | "paused";

export interface AudioPlayer extends Emitter<AudioPlayerEventMap> {
  readonly state: AudioPlayerState;
  readonly trackCount: number;
  readonly totalDuration: number;

  currentTime: number;
  volume: number;

  addTrack(track: AudioTrack<any>, insertIndex?: number): void;
  countTracks(): number;
  setTrack(track: AudioTrack<any>, index: number): void;
  removeTrack(track: AudioTrack<any>): boolean;
  getTracks(): Iterable<AudioTrack<any>>;
  setTracks(tracks: AudioTrack<any>[]): void;

  /**
   * Moves the track at `fromIndex` to `toIndex` without stopping or resetting
   * playback.  Both indices are clamped to valid range.  Dispatches a `change`
   * event so reactive consumers (e.g. AudioTracks.vue) update automatically.
   */
  reorderTracks(fromIndex: number, toIndex: number): void;

  /**
   * Registers an external callback that contributes additional duration to
   * `totalDuration` (e.g. instrument track duration when there are no audio
   * tracks).  Each registered callback is kept in a Set; call
   * `removeExtraDuration` with the same function reference to unregister.
   */
  setExtraDuration(fn: () => number): void;

  /**
   * Unregisters a previously-registered extra-duration callback.
   */
  removeExtraDuration(fn: () => number): void;

  /**
   * Returns the active AudioContext, or null when the player is stopped.
   *
   * Consumers (e.g. useInstrumentPlayback) can schedule audio into the same
   * context to guarantee perfect clock synchronisation with the player cursor.
   */
  getAudioContext(): AudioContext | null;

  /**
   * Returns the master output GainNode that all tracks feed into, or null when
   * the player is stopped.  Scheduling instrument notes into this node ensures
   * they pass through master volume and the waveform analyser.
   */
  getOutputNode(): AudioNode | null;

  /**
   * @param timeSec the start time in seconds (ex: 0.5 for half a second)
   */
  play(): Promise<void>;
  pause(): void;
  stop(): void;

  /** Returns the currently selected audio output device ID, or null if the
   *  system default is in use. */
  getOutputDeviceId(): string | null;

  /**
   * Selects the audio output device.  Pass an empty string to revert to the
   * system default.  If a playback context is currently active and the browser
   * supports `AudioContext.setSinkId`, the change takes effect immediately;
   * otherwise it applies on the next `play()` call.
   */
  setOutputDeviceId(deviceId: string): Promise<void>;
}

export type SequenceEffectStep =
  | {
      time: number;
      value: number;
      interpolation?: "discrete" | "linear" | "exponential";
    }
  | {
      time: number;
      values: number[];
    };

export type AudioPlayerSequenceEffect = {
  type: "volume" | "balance";
  defaultValue?: number;
  steps: SequenceEffectStep[];
};

export type AudioPlayerSequence = {
  time: number;
  buffer: AudioBuffer;
  effects?: AudioPlayerSequenceEffect[];
};

export type AudioPlayerTrack = {
  name: string;
  sequences: AudioPlayerSequence[];
};

export type MediaProject = {
  name: string;
  tracks: AudioPlayerTrack[];
};

interface PlaybackAnalyser {
  invalidated: boolean;
  node: AnalyserNode;
  data: Float32Array<ArrayBuffer>;
  audioFrame: AudioBuffer;
}

interface AudioPlayerNodes {
  analyser: PlaybackAnalyser;
  gain: GainNode; // master volume
}

interface AudioPlayerInternal {
  state: AudioPlayerState;
  tracks: AudioTrack<any>[];
  volume: number;
  audioContext?: AudioContext;
  nodes?: AudioPlayerNodes;
  pauseTime: number;
  resumeTime: number;
  outputDeviceId?: string;
  extraDurationCallbacks: Set<() => number>;
}

const createPlayer = (): AudioPlayer => {
  const internal: AudioPlayerInternal = {
    state: "ready",
    volume: 1,
    tracks: [],
    pauseTime: 0,
    resumeTime: 0,
    extraDurationCallbacks: new Set(),
  };

  const { dispatchEvent, ...emitter } = createEmitter<AudioPlayerEventMap>(
    (event) => {
      event.player = player;
      return event;
    },
  );

  function getCurrentTime() {
    if (internal.state !== "playing") {
      // When stopped or paused, return the recorded pause position directly.
      // Do NOT clamp against totalDuration here — that would prevent seeking
      // when the only tracks are instrument tracks (which have duration 0
      // until they are rendered).
      return internal.pauseTime;
    }

    const elapsed =
      (internal.audioContext?.currentTime ?? 0) - internal.resumeTime;
    const maxTime = getTotalDuration();
    return Math.min(internal.pauseTime + elapsed, maxTime);
  }
  function getTotalDuration() {
    let totalDuration = 0;
    let trackIndex = internal.tracks.length;
    while (--trackIndex >= 0) {
      const track = internal.tracks[trackIndex];
      if (isFinite(track.duration)) {
        totalDuration = Math.max(track.duration, totalDuration);
      }
    }

    // Include any externally-registered duration callbacks (e.g. instrument tracks).
    for (const fn of internal.extraDurationCallbacks) {
      totalDuration = Math.max(totalDuration, fn());
    }

    return totalDuration;
  }
  function getAnalyserBufferFrame() {
    const analyserNode = internal.nodes?.analyser;

    if (!internal.audioContext || !analyserNode) {
      return null;
    }

    if (analyserNode.invalidated) {
      analyserNode.node.getFloatTimeDomainData(analyserNode.data);
      analyserNode.audioFrame.copyToChannel(analyserNode.data, 0, 0);
      analyserNode.invalidated = false;
    }

    return analyserNode.audioFrame;
  }
  function initPlayback() {
    const audioContext = new AudioContext(
      internal.outputDeviceId
        ? ({ sinkId: internal.outputDeviceId } as AudioContextOptions)
        : undefined,
    );

    internal.audioContext = audioContext;
    internal.resumeTime = 0;
  }
  function updatePlaybackTime() {
    if (internal.state === "playing") {
      if (getCurrentTime() >= getTotalDuration()) {
        stopPlayback(false);
        dispatchEvent({ type: "stop" });
        return;
      }

      if (internal.nodes?.analyser) {
        internal.nodes.analyser.invalidated = true;
      }

      dispatchEvent({
        type: "timeupdate",
        get audioFrame() {
          const buffer = getAnalyserBufferFrame();

          if (!buffer) {
            throw new Error("invalid state");
          }

          return buffer;
        },
      } as AudioPlayerTImeUpdateEvent);

      requestAnimationFrame(updatePlaybackTime);
    }
  }
  async function startPlayback() {
    if (internal.audioContext) {
      const promises: Promise<void>[] = [];

      // Disconnect any orphaned nodes from a previous pause/resume cycle
      if (internal.nodes) {
        internal.nodes.analyser.node.disconnect();
        internal.nodes.gain.disconnect();
        internal.nodes = undefined;
      }

      const analyserNode = internal.audioContext.createAnalyser();
      const gainNode = internal.audioContext.createGain();

      analyserNode.fftSize = 2048;
      analyserNode.connect(internal.audioContext.destination);

      gainNode.gain.value = internal.volume;
      gainNode.connect(analyserNode);

      internal.nodes = {
        analyser: {
          invalidated: true,
          node: analyserNode,
          data: new Float32Array(
            analyserNode.frequencyBinCount,
          ) as Float32Array<ArrayBuffer>,
          audioFrame: internal.audioContext.createBuffer(
            1,
            analyserNode.frequencyBinCount,
            internal.audioContext.sampleRate,
          ),
        },
        gain: gainNode,
      };
      internal.resumeTime = internal.audioContext.currentTime;
      internal.state = "playing";

      for (const track of internal.tracks) {
        promises.push(
          track.play(internal.audioContext, {
            currentTime: internal.resumeTime,
            output: gainNode,
            startTime: internal.pauseTime,
          }),
        );
      }

      await Promise.all(promises);

      requestAnimationFrame(updatePlaybackTime);
    }
  }
  function pausePlayback() {
    if (internal.state === "playing") {
      const currentTime = internal.audioContext?.currentTime ?? 0;

      internal.state = "paused";
      internal.pauseTime =
        internal.pauseTime + currentTime - internal.resumeTime;

      for (const track of internal.tracks) {
        track.stop();
      }
    }
  }
  function seekPlayback(time: number) {
    const isPlaying = internal.state === "playing";
    const currentTime = internal.audioContext?.currentTime ?? 0;

    internal.pauseTime = Math.max(time, 0);

    if (isPlaying) {
      internal.resumeTime = currentTime;

      for (const track of internal.tracks) {
        track.seek(time);
      }
    }
  }
  function stopPlayback(resetTime: boolean) {
    if (internal.state !== "ready") {
      for (const track of internal.tracks) {
        track.stop();
      }
    }

    if (resetTime) {
      internal.pauseTime = 0;
    } else {
      const currentTime = internal.audioContext?.currentTime ?? 0;

      internal.pauseTime =
        internal.pauseTime + currentTime - internal.resumeTime;
    }

    internal.resumeTime = 0;

    internal.nodes?.analyser?.node?.disconnect();
    internal.audioContext?.close();

    internal.nodes = undefined;
    internal.audioContext = undefined;
    internal.state = "ready";
  }

  const player: AudioPlayer = {
    get state() {
      return internal.state;
    },
    get trackCount() {
      return internal.tracks.length;
    },
    get totalDuration() {
      return getTotalDuration();
    },
    get currentTime() {
      return getCurrentTime();
    },
    set currentTime(value) {
      seekPlayback(value);
      dispatchEvent({ type: "seek" });
    },

    get volume() {
      return internal.volume;
    },
    set volume(volume) {
      internal.volume = Math.max(Math.min(volume, 3), 0); // TODO : specify over amplitude value

      if (internal.nodes) {
        internal.nodes.gain.gain.value = internal.volume;
      }

      dispatchEvent({ type: "volumechange" });
    },

    addTrack(track, insertIndex) {
      if (insertIndex !== undefined) {
        insertIndex = Math.min(insertIndex, internal.tracks.length);
        internal.tracks.splice(insertIndex, 0, track);
      } else {
        internal.tracks.push(track);
      }

      dispatchEvent({ type: "change" });
    },
    countTracks() {
      return internal.tracks.length;
    },
    setTrack(track, index) {
      index = Math.min(index, internal.tracks.length);

      internal.tracks[index] = track;

      dispatchEvent({ type: "change" });
    },
    removeTrack(track) {
      stopPlayback(true);
      const trackIndex = internal.tracks.findIndex((t) => t.id === track.id);
      const trackFound = trackIndex >= 0;

      if (trackFound) {
        internal.tracks.splice(trackIndex, 1).forEach((track) => {
          track.stop();
        });

        dispatchEvent({ type: "change" });
      }

      return trackFound;
    },
    *getTracks() {
      for (const track of internal.tracks) {
        yield track;
      }
    },
    setTracks(tracks) {
      stopPlayback(true);
      internal.tracks = [...tracks];

      dispatchEvent({ type: "change" });
    },
    reorderTracks(fromIndex, toIndex) {
      const len = internal.tracks.length;
      fromIndex = Math.max(0, Math.min(fromIndex, len - 1));
      toIndex = Math.max(0, Math.min(toIndex, len - 1));

      if (fromIndex === toIndex) return;

      const [removed] = internal.tracks.splice(fromIndex, 1);
      internal.tracks.splice(toIndex, 0, removed);

      dispatchEvent({ type: "change" });
    },

    async play() {
      if (internal.state === "playing") {
        return;
      }

      if (internal.state === "ready") {
        initPlayback();
      }
      return startPlayback().then(() => {
        dispatchEvent({ type: "play" });
      });
    },
    pause() {
      if (internal.state !== "playing") {
        return;
      }

      pausePlayback();
      dispatchEvent({ type: "pause" });
    },
    stop() {
      if (internal.state === "ready") {
        return;
      }

      stopPlayback(true);
      dispatchEvent({ type: "stop" });
    },

    getOutputDeviceId() {
      return internal.outputDeviceId ?? null;
    },
    async setOutputDeviceId(deviceId) {
      internal.outputDeviceId = deviceId;

      // Apply immediately on an active context if the browser supports setSinkId
      // (Chrome 110+).  The method is not yet in the standard TypeScript DOM
      // types so we feature-detect at runtime.
      if (internal.audioContext && "setSinkId" in internal.audioContext) {
        await (
          internal.audioContext as unknown as {
            setSinkId(id: string): Promise<void>;
          }
        ).setSinkId(deviceId);
      }
    },
    setExtraDuration(fn) {
      internal.extraDurationCallbacks.add(fn);
    },
    removeExtraDuration(fn) {
      internal.extraDurationCallbacks.delete(fn);
    },
    getAudioContext() {
      return internal.audioContext ?? null;
    },
    getOutputNode() {
      return internal.nodes?.gain ?? null;
    },

    ...emitter,
  };

  return player;
};

export { createPlayer };
