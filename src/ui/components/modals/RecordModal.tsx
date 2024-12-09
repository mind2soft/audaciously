import { createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { useAudioRecorder } from "../../../context/audio-recorder";
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

  const [recorderStore, recorderControls] = useAudioRecorder();
  const [analyserData, analyserControls] = createAudioAnalyser();
  const [seconds, setSeconds] = createSignal(0);
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
      recorderControls.start();

      setSeconds(0);

      const timer = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);

      onCleanup(() => clearInterval(timer));
    } else {
      dialogRef?.close();

      // TODO: below, manual stop
      recorderControls.stop();
    }
  });

  const handleModalClose = (e: SubmitEvent) => {
    e.preventDefault();
    closeModal();
  };

  return (
    <Portal mount={document.documentElement}>
      <dialog ref={dialogRef} class="modal">
        <div class="modal-box">
          <div class="flex relative justify-center items-end">
            <svg ref={svgRef} class="round" height="400px" width="400px">
              <path
                ref={analyzerPathRef}
                class="stroke-1 stroke-red-600 fill-none"
              />
            </svg>
            <div class="flex absolute top-0 left-0 justify-center items-center w-full h-full text-3xl font-bold">
              {formatTime(seconds())}
            </div>
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
