//import { createEffect, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
//import { useAudioPlayer } from "../../../context/audio-player";
import { formatTime } from "../../../utils/formatTime";

function AudioTimerLabel() {
  //const player = useAudioPlayer();
  const [time, setTime] = createStore({
    currentTime: 0,
    totalTime: 0,
  });

  // createEffect(() => {
  //   const player = playerState.player;
  //   const handleTimeUpdate = () => {
  //     setTime("currentTime", player.currentTime);
  //   };

  //   player.addEventListener("timeupdate", handleTimeUpdate);

  //   setTime("totalTime", player.duration);

  //   onCleanup(() => {
  //     setTime({ currentTime: 0, totalTime: 0 });
  //     player.removeEventListener("timeupdate", handleTimeUpdate);
  //   });
  // });

  return (
    <div class="flex items-center">
      <div>{formatTime(time.currentTime)}</div>
      <div class="before:content-['/'] before:px-2">
        {formatTime(time.totalTime)}
      </div>
    </div>
  );
}

export default AudioTimerLabel;
