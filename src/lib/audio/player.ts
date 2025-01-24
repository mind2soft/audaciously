import { createEmitter, type Emitter } from "../emitter";
import type { AudioTrack } from "./track";

interface AudioPlayerEvent<EventType extends AudioPlayerEventType> {
  type: EventType;
  player: AudioPlayer;
}

interface AudioPlayerTImeUpdateEvent extends AudioPlayerEvent<"timeupdate"> {
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

type AudioPlayerEventType = keyof AudioPlayerEventMap;

type AudioPlayerState = "ready" | "playing" | "paused";

export interface AudioPlayer
  extends Emitter<AudioPlayerEventType, AudioPlayerEventMap> {
  readonly state: AudioPlayerState;
  readonly trackCount: number;
  readonly currentTime: number;
  readonly totalDuration: number;

  volume: number;
  playbackRate: number;

  addTrack(track: AudioTrack, insertIndex?: number): void;
  setTrack(track: AudioTrack, index: number): void;
  removeTrack(...index: number[]): void;
  getTracks(): Iterable<AudioTrack>;
  setTracks(tracks: AudioTrack[]): void;

  /**
   * @param timeSec the start time in seconds (ex: 0.5 for half a second)
   */
  play(timeSec?: number): Promise<void>;
  pause(): void;
  resume(): void;
  seek(time: number): void;
  stop(): void;
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
  data: Float32Array;
  audioFrame: AudioBuffer;
}

interface AudioPlayerNodes {
  analyser: PlaybackAnalyser;
  gain: GainNode; // master volume
}

interface AudioPlayerInternal {
  state: AudioPlayerState;
  tracks: AudioTrack[];
  volume: number;
  playbackRate: number;
  audioContext?: AudioContext;
  nodes?: AudioPlayerNodes;
  pauseTime: number;
  resumeTime: number;
}

const createPlayer = (): AudioPlayer => {
  const internal: AudioPlayerInternal = {
    state: "ready",
    volume: 1,
    playbackRate: 1,
    tracks: [],
    pauseTime: 0,
    resumeTime: 0,
  };

  const { dispatchEvent, ...emitter } = createEmitter<
    AudioPlayerEventType,
    AudioPlayerEventMap,
    AudioPlayerEvent<AudioPlayerEventType>
  >((event) => {
    event.player = player;
    return event;
  });

  function getCurrentTime() {
    const baseTime = internal.pauseTime;
    const currentTime =
      internal.state === "playing"
        ? (internal.audioContext?.currentTime ?? 0) - internal.resumeTime
        : 0;
    const maxTime = getTotalDuration();

    return Math.min(baseTime + currentTime, maxTime);
  }
  function getTotalDuration() {
    let totalDuration = 0;
    let trackIndex = internal.tracks.length;
    while (--trackIndex >= 0) {
      const track = internal.tracks[trackIndex];
      totalDuration = Math.max(track.duration, totalDuration);
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
  function initPlayback(time: number = 0) {
    const audioContext = new AudioContext();

    internal.audioContext = audioContext;
    internal.pauseTime = time;
    internal.resumeTime = 0;
  }
  function updatePlaybackTime() {
    if (internal.state === "playing") {
      if (!internal.tracks.some((track) => track.isPlaying)) {
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
  function startPlayback() {
    if (internal.audioContext) {
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
          data: new Float32Array(analyserNode.frequencyBinCount),
          audioFrame: internal.audioContext.createBuffer(
            1,
            analyserNode.frequencyBinCount,
            internal.audioContext.sampleRate
          ),
        },
        gain: gainNode,
      };
      internal.resumeTime = internal.audioContext.currentTime;

      for (const track of internal.tracks) {
        track.playbackRate = internal.playbackRate;

        track.play(internal.audioContext, {
          currentTime: internal.resumeTime,
          output: gainNode,
          startTime: internal.pauseTime,
        });
      }

      internal.state = "playing";
      requestAnimationFrame(updatePlaybackTime);
    }
  }
  function pausePlayback() {
    if (internal.state === "playing") {
      const currentTime = internal.audioContext?.currentTime ?? 0;

      internal.pauseTime =
        internal.pauseTime + currentTime - internal.resumeTime;

      for (const track of internal.tracks) {
        track.stop();
      }

      internal.state = "paused";
    }
  }
  function seekPlayback(time: number) {
    pausePlayback();
    if (internal.state === "paused") {
      internal.pauseTime = time;
    }
    startPlayback();
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
    get currentTime() {
      return getCurrentTime();
    },
    get totalDuration() {
      return getTotalDuration();
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
    get playbackRate() {
      return internal.playbackRate;
    },
    set playbackRate(value) {
      internal.playbackRate = value;

      for (const track of internal.tracks) {
        track.playbackRate = value;
      }
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
    setTrack(track, index) {
      index = Math.min(index, internal.tracks.length);

      internal.tracks[index] = track;

      dispatchEvent({ type: "change" });
    },
    removeTrack(...index) {
      stopPlayback(true);

      for (const i of index.slice().sort().reverse()) {
        internal.tracks.splice(i, 1);
      }

      dispatchEvent({ type: "change" });
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

    async play(time) {
      if (internal.state !== "ready") {
        stopPlayback(true);
      } else if (!internal.tracks.length) {
        return;
      }

      initPlayback(time);
      startPlayback();
      dispatchEvent({ type: "play" });
    },
    pause() {
      if (internal.state !== "playing") {
        return;
      }

      pausePlayback();
      dispatchEvent({ type: "pause" });
    },
    resume() {
      if (internal.state !== "paused") {
        return;
      }

      startPlayback();
      dispatchEvent({ type: "play" });
    },
    seek(time) {
      seekPlayback(time);
      dispatchEvent({ type: "seek" });
    },
    stop() {
      if (internal.state === "ready") {
        return;
      }

      stopPlayback(true);
      dispatchEvent({ type: "stop" });
    },

    ...emitter,
  };

  return player;
};

export { createPlayer };
