import { createEffect, createSignal } from "solid-js";
import {
  AudioPlayerContext,
  createAudioPlayer,
} from "../../../context/audio-player";
import type { JSX } from "solid-js/jsx-runtime";

interface AudioPlayerProviderProps {
  audioBuffer?: AudioBuffer;
  children?: JSX.Element;
}

function AudioPlayerProvider(props: AudioPlayerProviderProps) {
  //const [audioBuffer, setAudioBuffer] = createSignal(props.audioBuffer);
  const audioPlayer = createAudioPlayer(() => props.audioBuffer);

  //createEffect(() => {
  //  setAudioBuffer(props.audioBuffer);
  //});

  return (
    <AudioPlayerContext.Provider value={audioPlayer}>
      {props.children}
    </AudioPlayerContext.Provider>
  );
}

export default AudioPlayerProvider;
