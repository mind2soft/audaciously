import {
  createContext,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";
import { AudioSource, createAudio } from "@solid-primitives/audio";
import { useAudioTracksContext } from "./audio-tracks";
import AudioWorker from "../workers/buffer-processor?worker";

const audioWorker = new AudioWorker();
audioWorker.addEventListener("message", (e) => {
  console.log("Message from worker", e);
});

export const createAudioPlayer = () => {
  const tracksContext = useAudioTracksContext();
  const [audioSource, setAudioSource] = createSignal<AudioSource>();
  const [state, controls] = createAudio(audioSource);

  createEffect(() => {
    const audioTracks = tracksContext.getTracks();

    if (audioTracks.length) {
      //const audio = new Audio();
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();

      for (const track of audioTracks) {
        const bufferSource = context.createBufferSource();
        bufferSource.buffer = track.audioBuffer;
        bufferSource.start(0);
        bufferSource.connect(destination);
        //state.player.srcObject = destination.stream satisfies MediaStream;
        setAudioSource(destination.stream as any as MediaSource);
      }

      //setAudioSource(audio);

      //console.log("new player");
      //audioWorker.postMessage({ hello: "world" });
    }
  });

  return [state, controls] as const;
};

export const AudioPlayerContext =
  createContext<ReturnType<typeof createAudioPlayer>>();

export const useAudioPlayer = () => {
  const ctx = useContext(AudioPlayerContext);

  if (!ctx) {
    throw new Error("useAudioPlayer: missing AudioPlayerProvider");
  }

  return ctx;
};
