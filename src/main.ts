import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { createRecorder } from "./lib/audio/recorder";
import {
  playerKey,
  recorderKey,
  timelineKey,
  toolsKey,
} from "./lib/provider-keys";
import { createPlayer } from "./lib/audio/player";
import { createTimeline } from "./lib/timeline";
import { createTools } from "./lib/audio/tools";
import { createSelectTool } from "./lib/audio/tool/select";
import { createSequenceMoveTool } from "./lib/audio/tool/sequence-move";
import { createSequenceSplitTool } from "./lib/audio/tool/sequence-split";
import { createSequenceCutTool } from "./lib/audio/tool/sequence-cut";
import {
  loadSettings,
  settingsToMediaStreamConstraints,
} from "./lib/settings";

// Restore persisted settings before the app mounts so every component sees
// the correct initial state without any timing gymnastics.
const settings = loadSettings();

const recorder = createRecorder({
  mediaStreamConstraints: settingsToMediaStreamConstraints(settings),
});

const player = createPlayer();
player.volume = settings.volume;
// setOutputDeviceId is async, but at startup there is no AudioContext yet so
// it resolves immediately after storing the value — no need to await here.
void player.setOutputDeviceId(settings.outputDeviceId);

const timeline = createTimeline();

const interruptPlayback = () => {
  if (player.state === "playing") {
    player.pause();
  }
};

createApp(App)
  .provide(recorderKey, recorder)
  .provide(playerKey, player)
  .provide(timelineKey, timeline) // provide timeline instance
  .provide(
    toolsKey,
    createTools({
      tools: [
        createSelectTool(timeline, { onInteract: interruptPlayback }),
        createSequenceMoveTool(timeline, { onInteract: interruptPlayback }),
        createSequenceSplitTool(timeline, { onInteract: interruptPlayback }),
        createSequenceCutTool({ onInteract: interruptPlayback }),
      ],
    })
  )
  .mount("#app");
