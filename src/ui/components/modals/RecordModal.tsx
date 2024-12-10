import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import {
  RecorderState,
  useAudioRecorder,
} from "../../../context/audio-recorder";
import { createAudioAnalyser } from "../../../signals/audio-analyser";
/* @ts-ignore */
import { linearPath, polarPath } from "waveform-path";
import { formatTime } from "../../../utils/formatTime";

export interface RecordModalProps {
  open: boolean;
  onClose: (this: HTMLDialogElement) => void;
}

function getPath(audioBuffer: AudioBuffer, svg: SVGSVGElement) {
  return polarPath(audioBuffer, {
    samples: audioBuffer.length,
    type: "steps",
    left: 200,
    top: 200,
    width: svg.clientWidth,
    height: svg.clientHeight,
    distance: 100,
    length: 100,
    animation: true,
    normalize: false,
  });
}

function RecordModal(props: RecordModalProps) {
  let dialogRef: HTMLDialogElement | undefined;
  let svgRef: SVGSVGElement | undefined;
  let analyzerPathRef: SVGPathElement | undefined;

  const [recorderStore, recorderData, recorderControls] = useAudioRecorder();
  const [analyserData, analyserControls] = createAudioAnalyser();
  const [seconds, setSeconds] = createSignal(0);
  const isRecording = createMemo(() => {
    const recorderState = recorderStore.state;
    return (
      recorderState === RecorderState.RECORDING ||
      recorderState === RecorderState.PAUSED
    );
  });
  const isPaused = createMemo(() => {
    return recorderStore.state === RecorderState.PAUSED;
  });
  const closeModal = () => {
    if (!dialogRef) return;

    if (props.onClose) {
      props.onClose.call(dialogRef);
    } else {
      dialogRef.close();
    }
  };

  createEffect(() => {
    const audioBuffer = analyserData();

    if (svgRef && analyzerPathRef && audioBuffer) {
      const path = getPath(audioBuffer, svgRef);
      analyzerPathRef.setAttribute("d", path);
    } else if (analyzerPathRef) {
      analyzerPathRef.removeAttribute("d");
    }
  });

  createEffect(() => {
    const recorder = recorderStore.recorder;

    if (recorder) {
      analyserControls.start(recorder.stream);
    } else {
      analyserControls.stop();
      closeModal();
    }
  });

  createEffect(() => {
    if (props.open) {
      dialogRef?.showModal();

      // TODO: below, manual start, separate counter
      //recorderControls.start();
      recorderControls.setActive(true);

      const timer = setInterval(() => {
        setSeconds(recorderControls.recordingTime);
      }, 200);

      onCleanup(() => clearInterval(timer));
    } else {
      dialogRef?.close();
      setSeconds(0);

      // TODO: below, manual stop
      //recorderControls.stop();
      recorderControls.setActive(false);
    }
  });

  const handleModalClose = (e: SubmitEvent) => {
    e.preventDefault();
    closeModal();
  };

  const handleToggleRecording = () => {
    if (isRecording()) {
      recorderControls.stop();
    } else {
      recorderControls.start();
    }
  };

  const handleToggleSuspend = () => {
    if (!isRecording()) return;

    if (isPaused()) {
      console.log("Resume");
      recorderControls.resume();
    } else {
      console.log("pause");
      recorderControls.pause();
    }
  };

  return (
    <Portal mount={document.documentElement}>
      <dialog ref={dialogRef} class="modal">
        <div class="modal-box">
          <div class="flex relative justify-center items-end">
            <svg ref={svgRef} class="round" height="400px" width="400px">
              <path
                ref={analyzerPathRef}
                class={
                  "stroke-1 fill-none " +
                  (recorderStore.state === RecorderState.RECORDING
                    ? "stroke-red-600"
                    : "stroke-red-900")
                }
              />
            </svg>
            <div class="flex absolute top-0 left-0 justify-center items-center w-full h-full text-3xl font-bold">
              {formatTime(seconds())}
            </div>
          </div>
          <div>
            <button class="btn" onClick={handleToggleRecording}>
              {isRecording() ? "Stop" : "Record"}
            </button>
            <button
              class="btn"
              onClick={handleToggleSuspend}
              disabled={!isRecording()}
            >
              {isPaused() ? "Resume" : "Pause"}
            </button>
          </div>

          <div class="modal-action">
            <form method="dialog" onSubmit={handleModalClose}>
              {/* if there is a button in form, it will close the modal */}
              <button class="btn">Close</button>
            </form>
          </div>
        </div>
      </dialog>
    </Portal>
  );
}

export default RecordModal;
