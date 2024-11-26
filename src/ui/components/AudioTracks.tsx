import Timeline from "./Timeline";

function AudioTracks() {
  return (
    <div class="grid grid-cols-[96px_auto] grid-rows-[32px-auto]">
      <div class="col-start-2">
        <Timeline />
      </div>
      <div class="col-start-1">Track 1</div>
      <div class="col-start-2">Content</div>
      <div class="col-start-1">Track 2</div>
      <div class="col-start-2">Content</div>
    </div>
  );
}

export default AudioTracks;
