import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("radioAPI", {
  /** Detect current song from NetEase Cloud Music */
  detect: (): Promise<{ ok: boolean; rawTitle?: string; source?: string; hint?: string }> =>
    ipcRenderer.invoke("radio:detect"),

  /** Generate AI radio intro */
  intro: (payload: { rawTitle?: string; title?: string; artist?: string }): Promise<{ ok: boolean; intro?: string; error?: string }> =>
    ipcRenderer.invoke("radio:intro", payload),

  /** Generate TTS audio and return a data URL */
  tts: (text: string): Promise<string> =>
    ipcRenderer.invoke("radio:tts", text),

  /** Minimize to tray */
  minimize: () => ipcRenderer.send("window:minimize"),

  /** Close app */
  quit: () => ipcRenderer.send("window:quit"),

  /** Toggle mouse passthrough — true = click-through, false = interactive */
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send("window:setIgnoreMouseEvents", ignore),
});
