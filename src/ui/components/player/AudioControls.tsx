// import { AudioState } from "@solid-primitives/audio";
import {
  AudioPlayerState,
  useAudioPlayer,
} from "../../../context/audio-player";

function AudioControls() {
  const player = useAudioPlayer();

  const handleTogglePlayback = () => {
    if (player.state === AudioPlayerState.PLAYING) {
      player.pause();
    } else if (player.state === AudioPlayerState.PAUSED) {
      player.resume();
    } else {
      player.play();
    }
  };

  const handleStopPlayback = () => {
    player.stop();
  };

  return (
    <div class="flex gap-2 items-center">
      <button
        class="btn-success btn btn-lg btn-circle"
        title="Play"
        on:click={handleTogglePlayback}
      >
        <span class="iconify mdi--play size-8"></span>
      </button>
      <button
        class="btn btn-circle btn-error"
        title="Stop"
        on:click={handleStopPlayback}
      >
        <span class="iconify mdi--stop size-7"></span>
      </button>
    </div>
  );
}

export default AudioControls;
