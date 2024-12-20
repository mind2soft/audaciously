import { createEffect, createSignal, Show, untrack } from "solid-js";
import { Portal } from "solid-js/web";
import { useAudioRecorder } from "../../../context/audio-recorder";
import RecorderPanel from "./recorder/RecorderPanel";
import PlaybackPanel from "./recorder/PlaybackPanel";

export interface RecordModalProps {
  open: boolean;
  onClose: (this: HTMLDialogElement) => void;
}

function RecorderModal(props: RecordModalProps) {
  let dialogRef: HTMLDialogElement | undefined;
  let formRef: HTMLFormElement | undefined;

  const [recorderData, recorderControls] = useAudioRecorder();
  const [displayPlayback, setDisplayPlayback] = createSignal(false);

  const openModal = () => {
    setDisplayPlayback(true /*false*/); // TODO : remove true
    recorderControls.setActive(true);
    dialogRef?.showModal();
  };
  const closeModal = () => {
    dialogRef?.close();
    recorderControls.setActive(false);
  };

  createEffect(() => {
    const stream = recorderControls.stream;

    if (!stream && formRef) {
      formRef.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: false,
          cancelable: true,
        })
      );
    }
  });

  createEffect(() => {
    const blobs = recorderData();
    const hasBlobs = !!blobs?.length;
    const isOpen = !!dialogRef?.open;
    const displayPlayback = true || (isOpen && hasBlobs); // TODO : remove true

    setDisplayPlayback(displayPlayback);
  });

  createEffect(() => {
    if (props.open) {
      untrack(() => openModal());
    } else {
      untrack(() => closeModal());
    }
  });

  const handleTriggerClose = (e: SubmitEvent) => {
    e.preventDefault();

    if (dialogRef && props.onClose) {
      props.onClose.call(dialogRef);
    } else {
      closeModal();
    }
  };

  return (
    <Portal mount={document.documentElement}>
      <dialog ref={dialogRef} class="modal">
        <div class="modal-box">
          <div class="flex justify-between items-center modal-top">
            <h2 class="text-xl truncate">
              {displayPlayback() ? "Review recording" : "Record new track"}
            </h2>
            <form ref={formRef} method="dialog" onSubmit={handleTriggerClose}>
              <button
                class="btn btn-circle btn-ghost"
                disabled={recorderControls.isPaused()}
              >
                <span class="iconify mdi--close size-6"></span>
              </button>
            </form>
          </div>
          <Show when={displayPlayback()} fallback={<RecorderPanel />}>
            <PlaybackPanel />
          </Show>
        </div>
      </dialog>
    </Portal>
  );
}

export default RecorderModal;
