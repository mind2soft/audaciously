import AddTrackButton from "./buttons/AddTrack";
import PlayButton from "./buttons/Play";
import RecordButton from "./buttons/Record";

function Navbar() {
  return (
    <div class="drawer">
      <input id="my-drawer" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content">
        <nav class="gap-3 shadow-lg navbar bg-base-100">
          {/* Page content here */}
          <label
            for="my-drawer"
            class="text-xl btn btn-ghost drawer-button text-accent"
            title="Open menu"
          >
            <span class="iconify file-icons--audacity size-7"></span>
          </label>
          <div class="join">
            <PlayButton class="join-item" title="Start playback" />
            <RecordButton class="join-item" title="Resume recording" />
          </div>
          <div class="flex-1 justify-end">
            <AddTrackButton title="Add new track" />
          </div>
        </nav>
      </div>
      <div class="drawer-side">
        <label
          for="my-drawer"
          aria-label="close sidebar"
          class="drawer-overlay"
        ></label>
        <ul class="gap-3 p-4 w-80 min-h-full text-xl menu bg-base-200 text-base-content">
          {/* Sidebar content here */}
          <li>
            <a>
              <span class="iconify mdi--refresh size-6"></span>New Project
            </a>
          </li>

          <li>
            <a>
              <span class="iconify mdi--export size-6"></span>Export
            </a>
          </li>

          <li>
            <a>
              <span class="iconify mdi--settings size-6"></span>Settings
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default Navbar;
