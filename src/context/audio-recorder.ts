import { falseFn, noop } from "@solid-primitives/utils";
import {
  Accessor,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { createStaticStore } from "@solid-primitives/static-store";
import { isServer } from "solid-js/web";
import { createPermission } from "@solid-primitives/permission";
import { createMicrophones } from "@solid-primitives/devices";
import { createStream } from "@solid-primitives/stream";

// Set of control enums
export enum RecorderState {
  LOADING = "loading",
  RECORDING = "recording",
  PAUSED = "paused",
  READY = "ready",
  ERROR = "error",
}

export interface RecorderStore {
  state: RecorderState;
  recorder: MediaRecorder | null;
  device: MediaDeviceInfo | null;
}

export interface RecorderStaticStore {
  active: boolean;
  duration: number;
  lastTimestamp: number;
  ignoreData: boolean;
}

export interface AudioRecorder {
  state: RecorderState; // TODO: remove this duplicate property
  recordingTime: number;
  stream: MediaStream | void;
  isActive(): boolean;
  setActive(active: boolean): void;
  isReady(): boolean;
  isRecording(): boolean;
  isPaused(): boolean;
  start(timeslice?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  clear(): void;
}

type AudioRecorderContext = [Accessor<Blob[] | void>, AudioRecorder];

type MediaRecorderEventHandlers = Partial<{
  [K in keyof MediaRecorderEventMap]: (e: MediaRecorderEventMap[K]) => void;
}>;

const createRecorder = (
  stream: MediaStream,
  handlers: MediaRecorderEventHandlers
) => {
  const recorder = new MediaRecorder(stream);

  for (const eventType of Object.keys(handlers)) {
    recorder.addEventListener(
      eventType,
      handlers[eventType as keyof MediaRecorderEventMap] as any
    );
  }

  return recorder;
};

const cleanupRecorder = (
  recorder: MediaRecorder | null,
  handlers: MediaRecorderEventHandlers
) => {
  if (recorder) {
    for (const eventType of Object.keys(handlers)) {
      recorder.removeEventListener(
        eventType,
        handlers[eventType as keyof MediaRecorderEventMap] as any
      );
    }
  }
  return null;
};

const updateRecordingDuration = (
  store: RecorderStaticStore
): RecorderStaticStore => {
  if (store.lastTimestamp > 0) {
    store = { ...store };

    const recTime = Date.now() - store.lastTimestamp;

    store.duration = store.duration + recTime;
    store.lastTimestamp = 0;
  }

  return store;
};

const createAudioRecorder = (): AudioRecorderContext => {
  if (isServer) {
    return [
      noop as () => Blob[],
      {
        state: RecorderState.LOADING,
        recordingTime: 0,
        stream: undefined,
        isActive: falseFn,
        setActive: noop,
        isReady: falseFn,
        isRecording: falseFn,
        isPaused: falseFn,
        start: noop,
        pause: noop,
        resume: noop,
        stop: noop,
        clear: noop,
      },
    ];
  }

  const [staticStore, setStaticStore] = createStaticStore<RecorderStaticStore>({
    active: false,
    lastTimestamp: 0,
    duration: 0,
    ignoreData: false,
  });
  const [store, setStore] = createStore<RecorderStore>({
    state: RecorderState.LOADING,
    recorder: null,
    device: null,
  });
  const microphonePermission = createPermission("microphone");
  const microphones = createMicrophones();

  const [constraints, setContraints] = createSignal<MediaStreamConstraints>();
  const [localStream, { mute, stop, refetch }] = createStream(constraints);
  const [audioBlobs, setAudioBlobs] = createSignal<Blob[]>([]);
  const [recorderData, setRecorderData] = createSignal<Blob[]>();

  const recorderHandlers: MediaRecorderEventHandlers = {
    dataavailable(e) {
      if (!staticStore.ignoreData) {
        setAudioBlobs((blobs) => {
          blobs.push(e.data);
          return blobs.slice();
        });
      }
    },
    start() {
      setStaticStore("lastTimestamp", Date.now());
      setStore("state", RecorderState.RECORDING);
    },
    stop() {
      setStaticStore({
        duration: 0,
        lastTimestamp: 0,
      });
      setStore("state", RecorderState.READY);
    },
    pause() {
      setStaticStore(updateRecordingDuration);
      setStore("state", RecorderState.PAUSED);
    },
    resume() {
      setStaticStore("lastTimestamp", Date.now());
      setStore("state", RecorderState.RECORDING);
    },
    error() {
      setStore("state", RecorderState.ERROR);
    },
  };

  createEffect(() => {
    const permission = microphonePermission();
    const mic = microphones();
    const isDenied = permission === "denied";
    // TODO: get selected mic device from prefs
    const device = mic.length ? mic[0] : null;
    const deviceNotFound = mic.length && !device;

    if (isDenied || deviceNotFound) {
      stop(); // stop any ongoing stream...
      setStore((store) => {
        return {
          state: RecorderState.ERROR,
          recorder: cleanupRecorder(store.recorder, recorderHandlers),
          device: null,
        };
      });
    } else if (device) {
      setStore((store) => {
        const newStore = { ...store };

        newStore.state = store.recorder?.stream.active
          ? RecorderState.RECORDING
          : RecorderState.READY;
        newStore.device = device;

        return newStore;
      });
    }
  });

  createEffect(() => {
    const stream = localStream();

    if (stream) {
      const recorder = createRecorder(stream, recorderHandlers);

      mute(false);
      setStore("recorder", recorder);
    }
  });

  createEffect(() => {
    const recorder = store.recorder;
    const blobs = audioBlobs();

    if (recorder?.state === "inactive" && blobs.length) {
      setRecorderData(blobs);
    }
  });

  onCleanup(() => {
    mute(true);
    stop();

    setStore("recorder", (recorder) =>
      cleanupRecorder(recorder, recorderHandlers)
    );
  });

  const controls: AudioRecorder = {
    get state() {
      return store.state;
    },
    get recordingTime() {
      let recTime = staticStore.duration;

      if (staticStore.lastTimestamp) {
        recTime = recTime + (Date.now() - staticStore.lastTimestamp);
      }

      return recTime / 1000;
    },
    get stream() {
      return store.recorder?.stream;
    },
    isActive() {
      return staticStore.active;
    },
    setActive(active) {
      const recorderState = untrack(() => store.state);

      if (active && recorderState === RecorderState.READY) {
        const recorder = untrack(() => store.recorder);
        const device = untrack(() => store.device);

        if (!device) {
          console.error(new Error("Recording error, missing device"));
        } else if (!recorder) {
          const deviceConstraints = untrack(constraints);

          if (!deviceConstraints) {
            setContraints({ audio: device });
          } else {
            refetch();
          }
        }

        setRecorderData(undefined);
        setStaticStore({
          active: true,
          ignoreData: false,
        });
      } else if (!active) {
        setStore((store) => ({
          state: store.device ? RecorderState.READY : RecorderState.ERROR,
          recorder: cleanupRecorder(store.recorder, recorderHandlers),
        }));
        setStaticStore({
          active: false,
          duration: 0,
          lastTimestamp: 0,
          ignoreData: true,
        });
        setAudioBlobs([]);
        stop();
      }
    },
    isReady() {
      return !!store.recorder;
    },
    isRecording() {
      const recorderState = store.state;
      return (
        recorderState === RecorderState.RECORDING ||
        recorderState === RecorderState.PAUSED
      );
    },
    isPaused() {
      const recorderState = store.state;
      return recorderState === RecorderState.PAUSED;
    },
    start(timeslice?: number) {
      const recorder = untrack(() => store.recorder);
      recorder?.start(timeslice);
    },
    pause() {
      const recorder = untrack(() => store.recorder);
      recorder?.pause();
    },
    resume() {
      const recorder = untrack(() => store.recorder);
      recorder?.resume();
    },
    stop() {
      const recorder = untrack(() => store.recorder);
      recorder?.stop();
    },
    clear() {
      setRecorderData(undefined);
    },
  };

  return [recorderData, controls];
};

const AudioRecorderContext = createContext<AudioRecorderContext>();

const useAudioRecorder = () => {
  const ctx = useContext(AudioRecorderContext);

  if (!ctx) {
    throw new Error("useAudioRecorder: missing AudioRecorderProvider");
  }

  return ctx;
};

export { createAudioRecorder, AudioRecorderContext, useAudioRecorder };
