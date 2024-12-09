import {
  AudioPlayerContext,
  createAudioPlayer,
} from "../../../context/audio-player";
import type { JSX } from "solid-js/jsx-runtime";

interface AudioPlayerProviderProps {
  children?: JSX.Element;
}

function AudioPlayerProvider(props: AudioPlayerProviderProps) {
  const audioPlayer = createAudioPlayer();

  return (
    <AudioPlayerContext.Provider value={audioPlayer}>
      {props.children}
    </AudioPlayerContext.Provider>
  );
}

export default AudioPlayerProvider;
