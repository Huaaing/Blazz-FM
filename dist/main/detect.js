"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectSong = detectSong;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
function ps(command, timeout = 5000) {
    return new Promise((resolve) => {
        const id = (0, crypto_1.randomUUID)();
        const tmpFile = (0, path_1.join)((0, os_1.tmpdir)(), `aura_detect_${id}.txt`);
        const ps1File = (0, path_1.join)((0, os_1.tmpdir)(), `aura_detect_${id}.ps1`);
        const fullCmd = `${command} | Out-File -FilePath '${tmpFile.replace(/'/g, "''")}' -Encoding UTF8 -NoNewline`;
        try {
            (0, fs_1.writeFileSync)(ps1File, fullCmd, "utf-8");
        }
        catch {
            return resolve("");
        }
        const ps = (0, child_process_1.spawn)("powershell", [
            "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1File,
        ], { stdio: "ignore", windowsHide: true });
        const timer = setTimeout(() => {
            try {
                ps.kill();
            }
            catch { /* ok */ }
            try {
                if ((0, fs_1.existsSync)(ps1File))
                    (0, fs_1.unlinkSync)(ps1File);
            }
            catch { /* ok */ }
            try {
                if ((0, fs_1.existsSync)(tmpFile))
                    (0, fs_1.unlinkSync)(tmpFile);
            }
            catch { /* ok */ }
            resolve("");
        }, timeout);
        const cleanup = () => {
            try {
                if ((0, fs_1.existsSync)(ps1File))
                    (0, fs_1.unlinkSync)(ps1File);
            }
            catch { /* ok */ }
            try {
                if ((0, fs_1.existsSync)(tmpFile))
                    (0, fs_1.unlinkSync)(tmpFile);
            }
            catch { /* ok */ }
        };
        ps.on("close", () => {
            clearTimeout(timer);
            try {
                const raw = (0, fs_1.existsSync)(tmpFile) ? (0, fs_1.readFileSync)(tmpFile, "utf-8").trim() : "";
                cleanup();
                resolve(raw);
            }
            catch {
                cleanup();
                resolve("");
            }
        });
        ps.on("error", () => {
            clearTimeout(timer);
            cleanup();
            resolve("");
        });
    });
}
async function detectViaWindowTitle() {
    try {
        const raw = await ps("Get-Process -Name cloudmusic*,cloudmusicdesktop* -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Length -gt 0 } | ForEach-Object { $_.MainWindowTitle } | Select-Object -First 1");
        if (!raw)
            return null;
        if (/^网易云音乐$/.test(raw) || /^NetEase Cloud Music$/i.test(raw))
            return null;
        return raw;
    }
    catch {
        return null;
    }
}
async function detectViaGSMTC() {
    try {
        const psScript = "$manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]::new(); $sessions = $manager.GetSessions(); foreach ($session in $sessions) { $info = $session.TryGetMediaPropertiesAsync().GetAwaiter().GetResult(); $title = $info.Title; $artist = $info.Artist; if ($title -and $artist) { Write-Output \"$artist - $title\"; break } elseif ($title) { Write-Output $title; break } }";
        const raw = await ps(psScript);
        return raw || null;
    }
    catch {
        return null;
    }
}
async function detectSong() {
    const title1 = await detectViaWindowTitle();
    if (title1)
        return { ok: true, rawTitle: title1, source: "window_title" };
    const title2 = await detectViaGSMTC();
    if (title2)
        return { ok: true, rawTitle: title2, source: "gsmtc" };
    return { ok: false, hint: "无法自动侦测。请确保音乐播放器正在运行。" };
}
