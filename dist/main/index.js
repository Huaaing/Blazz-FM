"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const detect_1 = require("./detect");
const intro_1 = require("./intro");
const tts_1 = require("./tts");
let mainWindow = null;
let tray = null;
let isQuitting = false;
function isDev() {
    try {
        return !electron_1.app.isPackaged;
    }
    catch {
        return false;
    }
}
function createWindow() {
    const { width: screenW, height: screenH } = electron_1.screen.getPrimaryDisplay().workAreaSize;
    mainWindow = new electron_1.BrowserWindow({
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
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    // Load renderer: try Vite dev server first, fall back to built files
    const distHtml = path_1.default.join(__dirname, "../renderer/index.html");
    if (isDev()) {
        mainWindow.loadURL("http://localhost:5173").catch(() => {
            mainWindow?.loadFile(distHtml);
        });
    }
    else {
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
    const icon = electron_1.nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEoSURBVDiNpZMxTsNAEEX/rNeOgygSJQVN6Og4AiUdBSUdHQUlHVdA4gJISIgLIOUGdJQUIaCgQBTBNom9S8FiZ8deEznSfGlGM/97ZrQaay2/EoAvwACoAVeG9Q4YA5fAGJgAb0AB9IED8Ak0gA3wDjSB1/8C7oFPoALsgENeYZQ86l9qD9SBJXDIrW6B0zkwA46ABdB0MgXGwANYxZz6MyfjoAb8AsLO7uLjZJV3RiaY53Q27oCjLTD3CxOAGbAF2p6xAhaJ+ay5pMAD8AAsgB7QypAaTsl6o0Q0gS1QAz6A50TyKhFfEuFE2w4DwEkHOAJvgYtEPgDsgF0lXBsAO+AEuADe0ySTEXNhY8M4v0M7zgawB06BlyQyBBrAI/AO9LOoN/m0HXAN3CdDNP5v+Q9qJmjxXHdSkgAAAABJRU5ErkJggg==");
    tray = new electron_1.Tray(icon);
    tray.setToolTip("Blazz FM");
    const contextMenu = electron_1.Menu.buildFromTemplate([
        { label: "显示/隐藏", click: () => mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show() },
        { type: "separator" },
        { label: "退出", click: () => { isQuitting = true; electron_1.app.quit(); } },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on("double-click", () => {
        mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show();
    });
}
// ─── IPC Handlers ──────────────────────────────────────────────────
electron_1.ipcMain.handle("radio:detect", async () => {
    return await (0, detect_1.detectSong)();
});
electron_1.ipcMain.handle("radio:intro", async (_event, payload) => {
    return await (0, intro_1.generateIntro)(payload);
});
electron_1.ipcMain.handle("radio:tts", async (_event, text) => {
    try {
        return await (0, tts_1.synthesizeSpeech)(text);
    }
    catch (err) {
        console.error("TTS error:", err);
        throw err;
    }
});
electron_1.ipcMain.on("window:minimize", () => {
    mainWindow?.hide();
});
electron_1.ipcMain.on("window:quit", () => {
    electron_1.app.quit();
});
/** Enable/disable mouse event passthrough — called from renderer on hover */
electron_1.ipcMain.on("window:setIgnoreMouseEvents", (_event, ignore) => {
    mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
});
// ─── App lifecycle ─────────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    createWindow();
    createTray();
});
electron_1.app.on("window-all-closed", () => {
    // Don't quit — keep running in tray
});
electron_1.app.on("activate", () => {
    if (!mainWindow)
        createWindow();
});
electron_1.app.on("before-quit", () => {
    isQuitting = true;
});
