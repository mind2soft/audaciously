import { noop } from "@solid-primitives/utils";
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

export interface RecorderInternalStore {
  enabled: boolean;
  duration: number;
  lastTimestamp: number;
}

export interface AudioRecorder {
  recordingTime: number;
  setActive(active: boolean): void;
  start(timeslice?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

type AudioRecorderContext = [
  RecorderStore,
  Accessor<Blob | undefined>,
  AudioRecorder,
];

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
  store: RecorderInternalStore
): RecorderInternalStore => {
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
      {
        state: RecorderState.LOADING,
        recorder: null,
        device: null,
      },
      noop as () => Blob | undefined,
      {
        recordingTime: 0,
        setActive: noop,
        start: noop,
        pause: noop,
        resume: noop,
        stop: noop,
      },
    ];
  }

  const [internalStore, setInternalStore] =
    createStaticStore<RecorderInternalStore>({
      enabled: false,
      lastTimestamp: 0,
      duration: 0,
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
  const [recorderData, setRecorderData] = createSignal<Blob>();

  const recorderHandlers: MediaRecorderEventHandlers = {
    dataavailable(e) {
      setRecorderData(e.data);
    },
    start() {
      setInternalStore("lastTimestamp", Date.now());
      setStore("state", RecorderState.RECORDING);
    },
    stop() {
      setInternalStore({
        duration: 0,
        lastTimestamp: 0,
      });
      setStore("state", RecorderState.READY);
    },
    pause() {
      setInternalStore(updateRecordingDuration);
      setStore("state", RecorderState.PAUSED);
    },
    resume() {
      setInternalStore("lastTimestamp", Date.now());
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

  onCleanup(() => {
    mute(true);
    stop();

    setStore("recorder", (recorder) =>
      cleanupRecorder(recorder, recorderHandlers)
    );
  });

  const controls: AudioRecorder = {
    get recordingTime() {
      let recTime = internalStore.duration;

      if (internalStore.lastTimestamp) {
        recTime = recTime + (Date.now() - internalStore.lastTimestamp);
      }

      return recTime / 1000;
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

        setInternalStore("enabled", active);
      } else if (!active) {
        setStore((store) => ({
          state: store.device ? RecorderState.READY : RecorderState.ERROR,
          recorder: cleanupRecorder(store.recorder, recorderHandlers),
        }));
        setInternalStore({
          duration: 0,
          lastTimestamp: 0,
        });
        stop();
      }
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
  };

  return [store, recorderData, controls];
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
