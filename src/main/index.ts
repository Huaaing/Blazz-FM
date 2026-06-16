import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } from "electron";
import path from "path";
import { detectSong } from "./detect";
import { generateIntro } from "./intro";
import { synthesizeSpeech } from "./tts";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function isDev(): boolean {
  try { return !app.isPackaged; } catch { return false; }
}

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: screenW,
    height: screenH,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    type: "toolbar",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load renderer: try Vite dev server first, fall back to built files
  const distHtml = path.join(__dirname, "../renderer/index.html");
  if (isDev()) {
    mainWindow.loadURL("http://localhost:5173").catch(() => {
      mainWindow?.loadFile(distHtml);
    });
  } else {
    mainWindow.loadFile(distHtml);
  }

  // Forward mouse events through transparent areas so the host UI is clickable
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  // Create a simple 16x16 icon programmatically
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEoSURBVDiNpZMxTsNAEEX/rNeOgygSJQVN6Og4AiUdBSUdHQUlHVdA4gJISIgLIOUGdJQUIaCgQBTBNom9S8FiZ8deEznSfGlGM/97ZrQaay2/EoAvwACoAVeG9Q4YA5fAGJgAb0AB9IED8Ak0gA3wDjSB1/8C7oFPoALsgENeYZQ86l9qD9SBJXDIrW6B0zkwA46ABdB0MgXGwANYxZz6MyfjoAb8AsLO7uLjZJV3RiaY53Q27oCjLTD3CxOAGbAF2p6xAhaJ+ay5pMAD8AAsgB7QypAaTsl6o0Q0gS1QAz6A50TyKhFfEuFE2w4DwEkHOAJvgYtEPgDsgF0lXBsAO+AEuADe0ySTEXNhY8M4v0M7zgawB06BlyQyBBrAI/AO9LOoN/m0HXAN3CdDNP5v+Q9qJmjxXHdSkgAAAABJRU5ErkJggg=="
  );
  tray = new Tray(icon);
  tray.setToolTip("Blazz FM");

  const contextMenu = Menu.buildFromTemplate([
    { label: "显示/隐藏", click: () => mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show() },
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show();
  });
}

// ─── IPC Handlers ──────────────────────────────────────────────────

ipcMain.handle("radio:detect", async () => {
  return await detectSong();
});

ipcMain.handle("radio:intro", async (_event, payload) => {
  return await generateIntro(payload);
});

ipcMain.handle("radio:tts", async (_event, text: string) => {
  try {
    return await synthesizeSpeech(text);
  } catch (err) {
    console.error("TTS error:", err);
    throw err;
  }
});

ipcMain.on("window:minimize", () => {
  mainWindow?.hide();
});

ipcMain.on("window:quit", () => {
  app.quit();
});

/** Enable/disable mouse event passthrough — called from renderer on hover */
ipcMain.on("window:setIgnoreMouseEvents", (_event, ignore: boolean) => {
  mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
});

// ─── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  // Don't quit — keep running in tray
});

app.on("activate", () => {
  if (!mainWindow) createWindow();
});
app.on("before-quit", () => {
  isQuitting = true;
});
