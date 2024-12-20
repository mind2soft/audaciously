import type { JSX } from "solid-js/jsx-runtime";
import { useAudioPlayer } from "../../../context/audio-player";
import { AudioState } from "@solid-primitives/audio";

export interface PlayButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

function PlayButton({ class: className, ...props }: PlayButtonProps) {
  const player = useAudioPlayer();

  const handlePlayback = () => {
    //if (audio.state === AudioState.PLAYING) {
    //controls.pause();
    //} else {
    //controls.play();
    //}
    console.log("WTF", player.currentTime);
    player.play();
  };

  return (
    <button
      class={`text-green-500 btn ${className}`}
      on:click={handlePlayback}
      {...props}
    >
      <span class="iconify mdi--play size-7"></span>
    </button>
  );
}

export default PlayButton;
