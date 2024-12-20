import { createEffect, createSignal, splitProps } from "solid-js";
import RecorderModal from "../modals/RecorderModal";

import {
  RecorderState,
  useAudioRecorder,
} from "../../../context/audio-recorder";
import type { JSX } from "solid-js/jsx-runtime";

export interface RecordButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

function RecordButton(props: RecordButtonProps) {
  const [customProps, buttonProps] = splitProps(props, ["class", "disabled"]);

  const [, recorderControls] = useAudioRecorder();
  const [showDialog, setShowDialog] = createSignal(false);
  const [disableRecording, setDisableRecording] = createSignal(true);

  createEffect(() => {
    const userDisabled = customProps.disabled;
    const recorderReady = recorderControls.state === RecorderState.READY;
    const isRecording = recorderControls.isActive();

    setDisableRecording(userDisabled || !recorderReady || isRecording);
  });

  const handleRecorderModalOpen = () => {
    setShowDialog(true);
  };
  const handleRecorderModalClose = () => {
    setShowDialog(false);
  };

  return (
    <>
      <button
        class={["text-red-500 btn", customProps.class].join(" ")}
        onClick={handleRecorderModalOpen}
        disabled={disableRecording()}
        {...buttonProps}
      >
        <span class="iconify mdi--record size-7"></span>
      </button>
      <RecorderModal open={showDialog()} onClose={handleRecorderModalClose} />
    </>
  );
}

export default RecordButton;
