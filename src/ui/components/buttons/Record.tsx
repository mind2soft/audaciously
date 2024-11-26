import { createMicrophones } from "@solid-primitives/devices";
import { createStream } from "@solid-primitives/stream";
import { createPermission } from "@solid-primitives/permission";
import { createEffect, createSignal, splitProps } from "solid-js";
import { createStore } from "solid-js/store";
import type { JSX } from "solid-js/jsx-runtime";

export interface RecordButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}


function RecordButton(props: RecordButtonProps) {
  const [customProps, buttonProps] = splitProps(props, ['class', 'disabled']);

  const microphones = createMicrophones();
  const microphonePermission = createPermission("microphone");
  const [recording, setRecording] = createSignal(false);
  const [disableRecording, setDisableRecording] = createSignal(true);
  
  const [constraints, setContraints] = createStore<MediaStreamConstraints>({});

  createEffect(() => {
    if (microphones().length > 0) {
      setContraints("audio", { deviceId: microphones()[0].deviceId }); // TODO: get deviceId from preferences
    }
  });
  createEffect(() => {
    const micPermission = microphonePermission();

    setDisableRecording(customProps.disabled || !constraints.audio || micPermission === "denied" || micPermission === "prompt");
  })
  const [localStream, { mutate, stop }] = createStream(() =>
    constraints.audio ? constraints : undefined,
  );

  const handleRecordingToggle = () => {
    mutate(s => {
      s?.getAudioTracks().forEach(track => (track.enabled = !track.enabled));
      return s;
    });
  }

  return (
    <button 
      class={`text-red-500 btn ${customProps.class}`} 
      onClick={handleRecordingToggle} 
      disabled={disableRecording()} 
      {...buttonProps}>
      <span class="iconify mdi--record size-7"></span>
    </button>
  );
}

export default RecordButton;
