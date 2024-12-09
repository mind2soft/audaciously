import { For } from "solid-js";
import Timeline from "./Timeline";
import { useAudioTracksContext } from "../../context/audio-tracks";
import AudioTrackView from "./AudioTrack";

function AudioTracks() {
  const trackContext = useAudioTracksContext();

  return (
    <div class="grid grid-cols-[96px_auto] grid-rows-[32px-auto]">
      <div class="sticky top-0 h-6 bg-base-100"></div>
      <div class="sticky top-0 h-6 bg-base-200">
        <Timeline />
      </div>
      <For each={trackContext.getTracks()}>
        {(track) => <AudioTrackView track={track} />}
      </For>
    </div>
  );
}

export default AudioTracks;
