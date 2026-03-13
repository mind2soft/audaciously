import { createApp } from "vue";
import { createPinia } from "pinia";
import "./style.css";
import App from "./App.vue";

// Recorder and StorageService are now module-level singletons:
//   src/lib/audio/recorder-singleton.ts
//   src/lib/storage/storage-singleton.ts
//
// AudioPlayer and Timeline are wrapped by Pinia stores:
//   src/stores/player.ts  (createPlayer, initialized with persisted settings)
//   src/stores/timeline.ts (createTimeline)
//
// All old provide() / inject() patterns have been removed.

createApp(App).use(createPinia()).mount("#app");
