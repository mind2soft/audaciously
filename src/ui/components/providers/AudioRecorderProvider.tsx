import {
  createAudioRecorder,
  AudioRecorderContext,
} from "../../../context/audio-recorder";
import type { JSX } from "solid-js/jsx-runtime";

interface AudioRecorderProviderProps {
  children?: JSX.Element;
}

function AudioRecorderProvider(props: AudioRecorderProviderProps) {
  const contextValue = createAudioRecorder();

  return (
    <AudioRecorderContext.Provider value={contextValue}>
      {props.children}
    </AudioRecorderContext.Provider>
  );
}

export default AudioRecorderProvider;
