import {
  Accessor,
  createEffect,
  createSignal,
  onCleanup,
  Setter,
} from "solid-js";
import audioAnalyserWorklet from "../workers/mic-processor?url";

const getAudioProcessor = async (
  context: AudioContext
): Promise<AudioWorkletNode> => {
  try {
    return new AudioWorkletNode(context, "mic-processor");
  } catch (err) {
    await context.audioWorklet.addModule(audioAnalyserWorklet);

    return new AudioWorkletNode(context, "mic-processor");
  }
};

const startAudioAnalyser = (
  stream: MediaStream | void,
  setter: Setter<AudioBuffer | undefined>
) => {
  let active = true;
  let asyncCleanup: (() => void) | undefined;

  async function init(stream: MediaStream) {
    const context = new AudioContext();
    const sourceNode = context.createMediaStreamSource(stream);
    const analyserNode = context.createAnalyser();
    const processorNode = await getAudioProcessor(context);

    // Create and connect the AudioWorkletNode
    sourceNode.connect(processorNode);
    processorNode.connect(analyserNode);

    //nodes.worklet.connect(context.destination);
    //source.connect(context.destination);

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    function update() {
      requestAnimationFrame(update);

      analyserNode.getFloatTimeDomainData(dataArray);

      const audioBuffer = context.createBuffer(
        1,
        bufferLength,
        context.sampleRate
      );
      audioBuffer.copyToChannel(dataArray, 0, 0);

      setter(audioBuffer);
    }
    requestAnimationFrame(update);

    return () => {
      setter();
      processorNode.disconnect();
      analyserNode.disconnect();
      sourceNode.disconnect();
      context.close();
    };
  }

  if (stream) {
    init(stream).then((cleanup) => {
      if (!active) {
        cleanup();
      } else {
        asyncCleanup = cleanup;
      }
    });
  }

  return () => {
    active = false;
    asyncCleanup?.();
  };
};

export function createAudioAnalyser(): [
  Accessor<AudioBuffer | undefined>,
  {
    start(stream: MediaStream): void;
    stop(): void;
  },
] {
  const [analyserData, setAnalyserData] = createSignal<AudioBuffer>();
  const [stream, setStream] = createSignal<MediaStream>();

  createEffect(() => {
    const streamValue = stream();
    if (streamValue) {
      onCleanup(startAudioAnalyser(streamValue, setAnalyserData));
    }
  });

  return [
    analyserData,
    {
      start(stream: MediaStream) {
        setStream(stream);
      },
      stop() {
        setStream();
      },
    },
  ];
}
