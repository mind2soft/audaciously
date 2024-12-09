import { noop } from "@solid-primitives/utils";
import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
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
  timeslice?: number;
}

export interface AudioRecorder {
  start(timeslice?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

type AudioRecorderContext = [RecorderStore, AudioRecorder];

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
  recorder: MediaRecorder,
  handlers: MediaRecorderEventHandlers
) => {
  for (const eventType of Object.keys(handlers)) {
    recorder.removeEventListener(
      eventType,
      handlers[eventType as keyof MediaRecorderEventMap] as any
    );
  }
};

const [audioRecorderData, setAudioRecorderData] = createSignal<Blob>();

const createAudioRecorder = (): AudioRecorderContext => {
  if (isServer) {
    return [
      {
        state: RecorderState.LOADING,
        recorder: null,
        device: null,
      },
      {
        start: noop,
        pause: noop,
        resume: noop,
        stop: noop,
      },
    ];
  }

  const [store, setStore] = createStore<RecorderStore>({
    state: RecorderState.LOADING,
    recorder: null,
    device: null,
  });
  const microphonePermission = createPermission("microphone");
  const microphones = createMicrophones();

  const [constraints, setContraints] = createSignal<MediaStreamConstraints>();
  const [localStream, { mute, stop, refetch }] = createStream(constraints);
  const recorderHandlers: MediaRecorderEventHandlers = {
    dataavailable(e) {
      setAudioRecorderData(e.data);
    },
    start() {
      setStore("state", RecorderState.RECORDING);
    },
    stop() {
      setStore("state", RecorderState.READY);
    },
    pause() {
      setStore("state", RecorderState.PAUSED);
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
        if (store.recorder) {
          cleanupRecorder(store.recorder, recorderHandlers);
        }

        return {
          state: RecorderState.ERROR,
          recorder: null,
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

      recorder.start(store.timeslice);
    }
  });

  onCleanup(() => {
    const recorder = store.recorder;

    mute(true);
    stop();

    if (recorder) {
      setStore("recorder", null);
      cleanupRecorder(recorder, recorderHandlers);
    }
  });

  const controls: AudioRecorder = {
    start(timeslice?: number) {
      const recorderState = untrack(() => store.state);

      if (recorderState === RecorderState.READY) {
        const recorder = untrack(() => store.recorder);
        const device = untrack(() => store.device);

        if (recorder) {
          recorder.start();
        } else if (!recorder && device) {
          const deviceConstraints = untrack(constraints);

          setStore("timeslice", timeslice);

          if (!deviceConstraints) {
            setContraints({ audio: device });
          } else {
            refetch();
          }
        } else {
          console.error(new Error("Recording error, missing device"));
        }
      }
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

      if (recorder) {
        recorder.stop();

        cleanupRecorder(recorder, recorderHandlers);
        setStore((store) => ({
          state: store.device ? RecorderState.READY : RecorderState.ERROR,
          recorder: null,
        }));
      }

      stop();
    },
  };

  return [store, controls];
};

const AudioRecorderContext = createContext<AudioRecorderContext>();

const useAudioRecorder = () => {
  const ctx = useContext(AudioRecorderContext);

  if (!ctx) {
    throw new Error("useAudioRecorder: missing AudioRecorderProvider");
  }

  return ctx;
};

export {
  audioRecorderData,
  createAudioRecorder,
  AudioRecorderContext,
  useAudioRecorder,
};
