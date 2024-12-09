// import { createMicrophones } from "@solid-primitives/devices";
// import { createPermission } from "@solid-primitives/permission";
import { createEffect, createSignal, splitProps } from "solid-js";
import RecordModal from "../modals/RecordModal";

import {
  RecorderState,
  useAudioRecorder,
} from "../../../context/audio-recorder";
import type { JSX } from "solid-js/jsx-runtime";

export interface RecordButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

function RecordButton(props: RecordButtonProps) {
  const [customProps, buttonProps] = splitProps(props, ["class", "disabled"]);

  const [recorderStore] = useAudioRecorder();
  const [showDialog, setShowDialog] = createSignal(false);
  const [disableRecording, setDisableRecording] = createSignal(true);

  createEffect(() => {
    const userDisabled = customProps.disabled;
    const recorderState = recorderStore.state;
    const recorderReady = recorderState === RecorderState.READY;

    setDisableRecording(userDisabled || !recorderReady);
  });

  const handleRecordModalOpen = () => {
    setShowDialog(true);
  };
  const handleRecordModalClose = () => {
    setShowDialog(false);
  };

  return (
    <>
      <button
        class={`text-red-500 btn ${customProps.class}`}
        onClick={handleRecordModalOpen}
        disabled={disableRecording()}
        {...buttonProps}
      >
        <span class="iconify mdi--record size-7"></span>
      </button>
      <RecordModal open={showDialog()} onClose={handleRecordModalClose} />
    </>
  );
}

export default RecordButton;
