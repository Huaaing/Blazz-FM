"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("radioAPI", {
    /** Detect current song from NetEase Cloud Music */
    detect: () => electron_1.ipcRenderer.invoke("radio:detect"),
    /** Generate AI radio intro */
    intro: (payload) => electron_1.ipcRenderer.invoke("radio:intro", payload),
    /** Generate TTS audio and return a data URL */
    tts: (text) => electron_1.ipcRenderer.invoke("radio:tts", text),
    /** Minimize to tray */
    minimize: () => electron_1.ipcRenderer.send("window:minimize"),
    /** Close app */
    quit: () => electron_1.ipcRenderer.send("window:quit"),
    /** Toggle mouse passthrough — true = click-through, false = interactive */
    setIgnoreMouseEvents: (ignore) => electron_1.ipcRenderer.send("window:setIgnoreMouseEvents", ignore),
});
