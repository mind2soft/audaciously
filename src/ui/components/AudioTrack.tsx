import type { AudioTrack } from "../../context/audio-tracks";

export interface AudioTrackProps {
  track: AudioTrack;
}

function AudioTrack(props: AudioTrackProps) {
  return (
    <>
      <div class="col-start-1">Track 1</div>
      <div class="col-start-2">Content</div>
    </>
  );
}

export default AudioTrack;
