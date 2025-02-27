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
import {
  createeStartTimeTool, // Modified
  startTimeToolKey,
} from "./lib/audio/tool/start-time";

const timeline = createTimeline();
createApp(App)
  .provide(recorderKey, createRecorder())
  .provide(playerKey, createPlayer())
  .provide(timelineKey, timeline) // provide timeline instance
  .provide(
    toolsKey,
    createTools({
      tools: [createeStartTimeTool(timeline)], // inject timeline
      selectedTool: startTimeToolKey,
    })
  )
  .mount("#app");
