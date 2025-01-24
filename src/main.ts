import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { createRecorder } from "./lib/audio/recorder";
import { playerKey, recorderKey, timelineKey } from "./lib/provider-keys";
import { createPlayer } from "./lib/audio/player";
import { createTimeline } from "./lib/timeline";

createApp(App)
  .provide(recorderKey, createRecorder())
  .provide(playerKey, createPlayer())
  .provide(timelineKey, createTimeline())
  .mount("#app");
