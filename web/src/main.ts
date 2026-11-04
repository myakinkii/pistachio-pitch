// main.ts: the page. All rules come from the engine (src/engine); the Vue
// components draw the board and panels from the store in lib/game.ts.
import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

createApp(App).mount("#app");
