import { useAudioRecorder } from "../../../../context/audio-recorder";
import { formatTime } from "../../../../utils/formatTime";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { createAudioAnalyser } from "../../../../signals/audio-analyser";
/* @ts-ignore */
import { linearPath } from "waveform-path";

function getPath(audioBuffer: AudioBuffer, svg: SVGSVGElement) {
  return linearPath(audioBuffer, {
    samples: audioBuffer.length,
    type: "mirror",
    top: 0,
    height: svg.clientHeight,
    width: svg.clientWidth,
    paths: [{ d: "V", sy: 0, x: 50, ey: 100 }],
    animation: true,
    normalize: false,
  });
}

function RecorderPanel() {
  let svgRef: SVGSVGElement | undefined;
  let analyzerPathRef: SVGPathElement | undefined;

  const [, recorderControls] = useAudioRecorder();
  const [analyserData, analyserControls] = createAudioAnalyser();
  const [recordTime, setRecordTime] = createSignal(0);

  createEffect(() => {
    const stream = recorderControls.stream;

    if (stream) {
      analyserControls.start(stream);

      setRecordTime(0);

      const timer = setInterval(() => {
        setRecordTime(recorderControls.recordingTime);
      }, 200);

      onCleanup(() => clearInterval(timer));
    } else {
      analyserControls.stop();
    }
  });

  createEffect(() => {
    const audioBuffer = analyserData();

    if (svgRef && analyzerPathRef && audioBuffer) {
      const path = getPath(audioBuffer, svgRef);
      analyzerPathRef.setAttribute("d", path);
    } else if (analyzerPathRef) {
      analyzerPathRef.removeAttribute("d");
    }
  });

  const handleToggleRecording = () => {
    if (recorderControls.isRecording()) {
      recorderControls.stop();
    } else {
      recorderControls.start();
    }
  };

  const handleToggleSuspend = () => {
    if (!recorderControls.isRecording()) return;

    if (recorderControls.isPaused()) {
      recorderControls.resume();
    } else {
      recorderControls.pause();
    }
  };

  return (
    <div class="flex flex-col">
      <div class="flex gap-4 items-center">
        <div class="flex gap-2 items-center">
          <button
            class={[
              "btn btn-lg btn-circle",
              recorderControls.isRecording()
                ? "bg-red-500 hover:bg-red-500/50 text-white/80"
                : "",
            ].join(" ")}
            title={recorderControls.isRecording() ? "Stop" : "Record"}
            onClick={handleToggleRecording}
          >
            {recorderControls.isRecording() ? (
              <span class="iconify mdi--stop size-8"></span>
            ) : (
              <span class="iconify mdi--record size-8"></span>
            )}
          </button>
          <button
            class={[
              "btn btn-circle",
              recorderControls.isPaused()
                ? "bg-amber-800 hover:bg-amber-700/60 animate-pulse"
                : "bg-ghost",
            ].join(" ")}
            title={recorderControls.isPaused() ? "Resume" : "Pause"}
            onClick={handleToggleSuspend}
            disabled={!recorderControls.isRecording()}
          >
            <span class="iconify mdi--pause size-7"></span>
          </button>
        </div>
        <div
          class={[
            "flex text-xl font-bold",
            recorderControls.isRecording() ? "opacity-100" : "opacity-40",
            recorderControls.isPaused() ? "animate-pulse" : "",
          ].join(" ")}
        >
          {formatTime(recordTime())}
        </div>
        <svg ref={svgRef} class="flex-1 h-24">
          <path
            ref={analyzerPathRef}
            class={[
              "stroke-1 fill-none",
              recorderControls.isPaused()
                ? "stroke-amber-600 animate-pulse"
                : recorderControls.isRecording()
                  ? "stroke-red-600"
                  : "stroke-base-content",
            ].join(" ")}
          />
        </svg>
      </div>
    </div>
  );
}

export default RecorderPanel;
