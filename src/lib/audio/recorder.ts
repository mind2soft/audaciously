interface RecorderEvent<EventType extends RecorderEventType> {
  type: EventType;
  timestamp: number;
  recorder: Recorder;
}

interface RecorderTimeUpdateEvent extends RecorderEvent<"timeupdate"> {
  analyserBuffer: AudioBuffer;
}

interface RecorderDataEvent extends RecorderEvent<"data"> {
  data: Blob[];
}

type RecorderEventMap = {
  ready: (event: RecorderEvent<"ready">) => void;
  timeupdate: (event: RecorderTimeUpdateEvent) => void;
  record: (event: RecorderEvent<"record">) => void;
  pause: (event: RecorderEvent<"pause">) => void;
  resume: (event: RecorderEvent<"resume">) => void;
  stop: (event: RecorderEvent<"stop">) => void;
  data: (event: RecorderDataEvent) => void;
  error: (event: RecorderEvent<"error">) => void;
};

type RecorderEventType = keyof RecorderEventMap;
type RecorderEventCallback<T extends RecorderEventType> = RecorderEventMap[T];

type RecorderOptions = {
  contextOptions?: AudioContextOptions;
  mediaStreamConstraints?: MediaStreamConstraints;
  mediaRecorderOptions?: MediaRecorderOptions;
};

type RecorderState = "ready" | "loading" | "recording" | "error";

export interface Recorder {
  readonly state: RecorderState;

  record(timeslice?: number): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;

  getMediaStreamConstraints(): MediaStreamConstraints;
  setMediaStreamConstraints(constraints: MediaStreamConstraints): void;

  getAudioBuffer(): Promise<AudioBuffer>;
  getRecordedData(): Blob[];
  clearRecordedData(): void;

  addEventListener<EventType extends RecorderEventType>(
    type: EventType,
    callback: RecorderEventCallback<EventType>
  ): void;
  removeEventListener<EventType extends RecorderEventType>(
    type: EventType,
    callback: RecorderEventCallback<EventType>
  ): void;
}

interface RecorderInternal {
  state: RecorderState;
  listeners: Map<RecorderEventType, Set<Function>>;
  mediaStreamConstraints: MediaStreamConstraints;
  audioContext?: AudioContext | null;
  mediaRecorder?: MediaRecorder | null;
  sourceNode?: MediaStreamAudioSourceNode | null;
  analyserNode?: AnalyserNode | null;
  analyserData?: Float32Array | null;
  blobs: Blob[];
}

const sanitizeMediaRecorderOptions = (options?: MediaRecorderOptions) => {
  const validMimeType =
    !options?.mimeType || MediaRecorder.isTypeSupported(options.mimeType);

  return validMimeType ? options : undefined;
};

const createRecorder = (options?: RecorderOptions): Recorder => {
  const internal: RecorderInternal = {
    state: "loading",
    listeners: new Map<RecorderEventType, Set<Function>>(),
    mediaStreamConstraints: options?.mediaStreamConstraints ?? { audio: true },
    blobs: [],
  };

  function dispatchEvent<EventType extends RecorderEventType>(
    event: Omit<RecorderEvent<EventType>, "timestamp" | "recorder">
  ) {
    (event as RecorderEvent<EventType>).timestamp = Date.now();
    (event as RecorderEvent<EventType>).recorder = recorder;
    internal.listeners.get(event.type)?.forEach((callback) => callback(event));
  }

  function initAudioContext() {
    if (!internal.audioContext) {
      internal.audioContext = new AudioContext(options?.contextOptions);
    }
    return internal.audioContext;
  }
  function startEventListener() {
    internal.state = "recording";
    dispatchEvent({ type: "record" });
    updateAnalyserData();
  }
  function dateAvailableEventListener(event: BlobEvent) {
    internal.blobs?.push(event.data);
  }
  function pauseEventListener() {
    dispatchEvent({ type: "pause" });
  }
  function resumeEventListener() {
    dispatchEvent({ type: "resume" });
  }
  function stopEventListener() {
    internal.analyserNode?.disconnect();
    internal.sourceNode?.disconnect();
    internal.mediaRecorder?.stream.getTracks().forEach((track) => track.stop());

    internal.mediaRecorder?.removeEventListener("start", startEventListener);
    internal.mediaRecorder?.removeEventListener("pause", pauseEventListener);
    internal.mediaRecorder?.removeEventListener("resume", resumeEventListener);
    internal.mediaRecorder?.removeEventListener(
      "dataavailable",
      dateAvailableEventListener
    );
    internal.mediaRecorder?.removeEventListener("stop", stopEventListener);

    internal.analyserData = null;
    internal.analyserNode = null;
    internal.sourceNode = null;
    internal.mediaRecorder = null;

    internal.state = internal.state !== "error" ? "ready" : "error";
    dispatchEvent({ type: "stop" });

    if (internal.blobs.length && internal.audioContext) {
      dispatchEvent({
        type: "data",
        timestamp: Date.now(),
        data: internal.blobs,
      } as RecorderDataEvent);
    }
  }
  function updateAnalyserData() {
    if (
      internal.audioContext &&
      internal.analyserNode &&
      internal.analyserData
    ) {
      const buffer = internal.audioContext.createBuffer(
        1,
        internal.analyserData.length,
        internal.audioContext.sampleRate
      );

      internal.analyserNode.getFloatTimeDomainData(internal.analyserData);
      buffer.copyToChannel(internal.analyserData, 0, 0);

      dispatchEvent({
        type: "timeupdate",
        timestamp: Date.now(),
        analyserBuffer: buffer,
      } as RecorderTimeUpdateEvent);

      requestAnimationFrame(updateAnalyserData);
    }
  }
  function updatePermissionState(state: PermissionState) {
    const newRecorderState: RecorderState =
      state === "denied" ? "error" : "ready";
    if (newRecorderState !== internal.state) {
      internal.state = newRecorderState;
      dispatchEvent({ type: internal.state });
    }
  }

  const permissionStatus = navigator.permissions
    .query({
      name: "microphone" as PermissionName,
    })
    .then(
      (status) => {
        status.onchange = () => {
          if (internal.state === "recording") {
            internal.mediaRecorder?.stop();
          }

          updatePermissionState(status.state);
        };

        updatePermissionState(status.state);
      },
      () => {
        updatePermissionState("denied");
      }
    );

  const recorder: Recorder = {
    get state() {
      return internal.state;
    },
    async record(timeslice) {
      if (internal.state === "loading") {
        await permissionStatus;
      }

      if (internal.state === "recording") {
        throw new Error("recorder: already recording");
      } else if (internal.state === "error") {
        throw new Error("recorder: permission denied");
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(
        internal.mediaStreamConstraints
      );

      if (mediaStream) {
        const audioContext = initAudioContext();

        internal.blobs = [];
        internal.mediaRecorder = new MediaRecorder(
          mediaStream,
          sanitizeMediaRecorderOptions(options?.mediaRecorderOptions)
        );

        internal.sourceNode = audioContext.createMediaStreamSource(mediaStream);
        internal.analyserNode = audioContext.createAnalyser();

        internal.analyserData = new Float32Array(
          internal.analyserNode.frequencyBinCount
        );

        internal.sourceNode.connect(internal.analyserNode);

        internal.mediaRecorder.addEventListener("start", startEventListener);
        internal.mediaRecorder.addEventListener("pause", pauseEventListener);
        internal.mediaRecorder.addEventListener("resume", resumeEventListener);
        internal.mediaRecorder.addEventListener(
          "dataavailable",
          dateAvailableEventListener
        );
        internal.mediaRecorder.addEventListener("stop", stopEventListener);
        internal.mediaRecorder.start(timeslice);
      } else {
        updatePermissionState("denied");
      }
    },
    pause() {
      if (internal.state === "recording") {
        internal.mediaRecorder?.pause();
      }
    },
    resume() {
      if (internal.state === "recording") {
        internal.mediaRecorder?.resume();
      }
    },
    stop() {
      if (internal.state === "recording") {
        internal.mediaRecorder?.stop();
      }
    },

    getMediaStreamConstraints() {
      return { ...internal.mediaStreamConstraints };
    },
    setMediaStreamConstraints(constraints) {
      internal.mediaStreamConstraints = { ...constraints };
    },

    async getAudioBuffer() {
      const audioContext = initAudioContext();
      const bufferSize = internal.blobs.reduce(
        (len, blob) => len + blob.size,
        0
      );

      if (!bufferSize) {
        return audioContext.createBuffer(1, 0, audioContext.sampleRate);
      }

      const arrayBuffer = new ArrayBuffer(bufferSize);
      const byteArray = new Int8Array(arrayBuffer);
      let offset = 0;

      for (const blob of internal.blobs) {
        const arrayBuffer = await blob.arrayBuffer();

        byteArray.set(new Int8Array(arrayBuffer), offset);
        offset = offset + arrayBuffer.byteLength;
      }

      return audioContext.decodeAudioData(arrayBuffer);
    },
    getRecordedData() {
      return internal.blobs.slice();
    },
    clearRecordedData() {
      internal.blobs = [];
    },

    addEventListener(type, callback) {
      if (!internal.listeners.has(type)) {
        internal.listeners.set(type, new Set());
      }

      internal.listeners.get(type)?.add(callback);
    },
    removeEventListener(type, callback) {
      const callbacks = internal.listeners.get(type);

      if (callbacks?.size) {
        callbacks.delete(callback);

        if (!callbacks.size) {
          internal.listeners.delete(type);
        }
      }
    },
  };

  return recorder;
};

export { createRecorder };
