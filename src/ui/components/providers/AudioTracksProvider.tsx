import { createEffect, createSignal } from "solid-js";
import {
  AudioTrack,
  AudioTracksContext,
  AudioTracksSetter,
} from "../../../context/audio-tracks";
import type { JSX } from "solid-js/jsx-runtime";

interface AudioTracksProviderProps {
  children?: JSX.Element;
}

/** move this in model */
function createTrack(
  audioBuffer: AudioBuffer,
  startTime: number = 0
): AudioTrack {
  return {
    startTime,
    audioBuffer,
  };
}

function AudioTracksProvider(props: AudioTracksProviderProps) {
  const [getTracks, setTracks] = createSignal<AudioTrack[]>([], {
    equals: false,
  });

  // createEffect(() => {
  //   setTimeout(() => {
  //     fetch("/assets/sample-15s.mp3")
  //       .then((response) => response.arrayBuffer())
  //       .then((arrayBuffer) => {
  //         const context = new AudioContext();

  //         return context.decodeAudioData(arrayBuffer);
  //       })
  //       .then((audioBuffer) => {
  //         setTracks([createTrack(audioBuffer)]);
  //       });
  //   }, 2000);
  // });

  const audioTracksSetter: AudioTracksSetter = {
    addTrack: (audioBuffer, insertIndex) => {
      setTracks((tracks) => {
        const newTrack = createTrack(audioBuffer);

        if (insertIndex !== undefined) {
          tracks.splice(insertIndex, 0, newTrack);
        } else {
          tracks.push(newTrack);
        }

        return tracks;
      });
    },
    moveTrack: (fromIndex, toIndex) => {
      setTracks((tracks) => {
        if (fromIndex < 0 || fromIndex >= tracks.length) {
          throw new Error(`Invalid from index: ${fromIndex}`);
        }
        if (toIndex < 0 || toIndex >= tracks.length) {
          throw new Error(`Invalid to index: ${toIndex}`);
        }

        const temp = tracks[fromIndex];
        tracks[fromIndex] = tracks[toIndex];
        tracks[toIndex] = temp;

        return tracks;
      });
    },
    removeTrack: (removeIndex) => {
      setTracks((tracks) => {
        tracks.splice(removeIndex, 1);

        return tracks;
      });
    },
    getTracks,
  };

  return (
    <AudioTracksContext.Provider value={audioTracksSetter}>
      {props.children}
    </AudioTracksContext.Provider>
  );
}

export default AudioTracksProvider;
