import { createEmitter, type Emitter } from "../emitter";

interface RecorderEvent<EventType extends string> {
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

export interface RecorderBufferUpdateEvent extends RecorderEvent<"bufferupdate"> {
  /** Decoded AudioBuffer containing everything recorded so far. */
  buffer: AudioBuffer;
}

type RecorderEventMap = {
  ready: (event: RecorderEvent<"ready">) => void;
  timeupdate: (event: RecorderTimeUpdateEvent) => void;
  record: (event: RecorderEvent<"record">) => void;
  pause: (event: RecorderEvent<"pause">) => void;
  resume: (event: RecorderEvent<"resume">) => void;
  stop: (event: RecorderEvent<"stop">) => void;
  data: (event: RecorderDataEvent) => void;
  /** Fired whenever a new recording chunk is decoded; use for live waveform preview. */
  bufferupdate: (event: RecorderBufferUpdateEvent) => void;
  error: (event: RecorderEvent<"error">) => void;
};

// type RecorderEventCallback<T extends RecorderEventType> = RecorderEventMap[T];

type RecorderOptions = {
  contextOptions?: AudioContextOptions;
  mediaStreamConstraints?: MediaStreamConstraints;
  mediaRecorderOptions?: MediaRecorderOptions;
};

type RecorderState = "ready" | "loading" | "recording" | "error";

export interface Recorder extends Emitter<RecorderEventMap> {
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
}

interface RecorderInternal {
  state: RecorderState;
  mediaStreamConstraints: MediaStreamConstraints;
  audioContext?: AudioContext | null;
  mediaRecorder?: MediaRecorder | null;
  sourceNode?: MediaStreamAudioSourceNode | null;
  analyserNode?: AnalyserNode | null;
  analyserData?: Float32Array<ArrayBuffer> | null;
  blobs: Blob[];
  /** Monotonically-increasing counter used to discard stale preview decodes. */
  previewSeq: number;
}

const sanitizeMediaRecorderOptions = (options?: MediaRecorderOptions) => {
  const validMimeType =
    !options?.mimeType || MediaRecorder.isTypeSupported(options.mimeType);

  return validMimeType ? options : undefined;
};

const createRecorder = (options?: RecorderOptions): Recorder => {
  const internal: RecorderInternal = {
    state: "loading",
    // Default to disabling browser echo-cancellation, noise-suppression and
    // auto-gain-control so that overdubbing (recording while tracks play back)
    // does not cause the browser's AEC to strip playback frequencies from the
    // microphone signal, which would produce a muffled / cut-out recording.
    // Users are expected to use headphones in a DAW context; these can be
    // re-enabled via the Settings dialog if desired.
    mediaStreamConstraints: options?.mediaStreamConstraints ?? {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    },
    blobs: [],
    previewSeq: 0,
  };

  const { dispatchEvent, ...emitter } = createEmitter<RecorderEventMap>(
    (event) => {
      event.recorder = recorder;
      event.timestamp = Date.now();
      return event;
    }
  );

  function initAudioContext() {
    if (!internal.audioContext || internal.audioContext.state === "closed") {
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
    // Fire-and-forget: decode accumulated audio for the live waveform preview.
    decodeAndDispatchPreview();
  }
  function pauseEventListener() {
    dispatchEvent({ type: "pause" });
  }
  function resumeEventListener() {
    dispatchEvent({ type: "resume" });
  }
  function stopEventListener() {
    // Cancel any in-flight preview decode.
    internal.previewSeq++;

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

    internal.mediaRecorder?.stream.getTracks().forEach((track) => track.stop());

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

      internal.audioContext.close();
      internal.audioContext = null;
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

  /**
   * Decode all accumulated blobs so far and dispatch a `bufferupdate` event
   * so listeners can render a live waveform preview.  Fires after each
   * `dataavailable` chunk.  Stale decodes (superseded by a newer chunk) are
   * silently discarded via the `previewSeq` counter.
   */
  async function decodeAndDispatchPreview(): Promise<void> {
    const seq = ++internal.previewSeq;
    if (!internal.audioContext || !internal.blobs.length) return;

    try {
      // Take a snapshot so new blobs pushed while we await don't corrupt the
      // current decode pass.
      const blobs = internal.blobs.slice();
      const bufferSize = blobs.reduce((len, blob) => len + blob.size, 0);
      if (!bufferSize) return;

      const arrayBuffer = new ArrayBuffer(bufferSize);
      const byteArray = new Int8Array(arrayBuffer);
      let offset = 0;

      for (const blob of blobs) {
        const ab = await blob.arrayBuffer();
        if (seq !== internal.previewSeq) return; // superseded by newer chunk
        byteArray.set(new Int8Array(ab), offset);
        offset += ab.byteLength;
      }

      const audioBuffer = await internal.audioContext.decodeAudioData(arrayBuffer);

      // Guard: discard if superseded or recording already stopped
      if (seq !== internal.previewSeq || internal.state !== "recording") return;

      dispatchEvent({ type: "bufferupdate", buffer: audioBuffer } as RecorderBufferUpdateEvent);
    } catch {
      // Decode can legitimately fail on partial/incomplete container data
      // (common on Safari with AAC/MP4).  Silently ignore and wait for the
      // next chunk.
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

    ...emitter,
  };

  return recorder;
};

export { createRecorder };
