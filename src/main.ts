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
import { createeSequenceMoveTool } from "./lib/audio/tool/sequence-move";
import { createSequenceSplitTool } from "./lib/audio/tool/sequence-split";
import { createSequenceCutTool } from "./lib/audio/tool/sequence-cut";

const timeline = createTimeline();
createApp(App)
  .provide(recorderKey, createRecorder())
  .provide(playerKey, createPlayer())
  .provide(timelineKey, timeline) // provide timeline instance
  .provide(
    toolsKey,
    createTools({
      tools: [
        createSelectTool(timeline),
        createeSequenceMoveTool(timeline),
        createSequenceSplitTool(timeline),
        createSequenceCutTool(),
      ],
    })
  )
  .mount("#app");
