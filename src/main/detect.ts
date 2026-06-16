import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync, unlinkSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function ps(command: string, timeout = 5000): Promise<string> {
  return new Promise((resolve) => {
    const id = randomUUID();
    const tmpFile = join(tmpdir(), `aura_detect_${id}.txt`);
    const ps1File = join(tmpdir(), `aura_detect_${id}.ps1`);

    const fullCmd = `${command} | Out-File -FilePath '${tmpFile.replace(/'/g, "''")}' -Encoding UTF8 -NoNewline`;
    try { writeFileSync(ps1File, fullCmd, "utf-8"); } catch { return resolve(""); }

    const ps = spawn("powershell", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1File,
    ], { stdio: "ignore", windowsHide: true });

    const timer = setTimeout(() => {
      try { ps.kill(); } catch { /* ok */ }
      try { if (existsSync(ps1File)) unlinkSync(ps1File); } catch { /* ok */ }
      try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* ok */ }
      resolve("");
    }, timeout);

    const cleanup = () => {
      try { if (existsSync(ps1File)) unlinkSync(ps1File); } catch { /* ok */ }
      try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* ok */ }
    };

    ps.on("close", () => {
      clearTimeout(timer);
      try {
        const raw = existsSync(tmpFile) ? readFileSync(tmpFile, "utf-8").trim() : "";
        cleanup();
        resolve(raw);
      } catch {
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

async function detectViaWindowTitle(): Promise<string | null> {
  try {
    const raw = await ps(
      "Get-Process -Name cloudmusic*,cloudmusicdesktop* -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Length -gt 0 } | ForEach-Object { $_.MainWindowTitle } | Select-Object -First 1"
    );
    if (!raw) return null;
    if (/^网易云音乐$/.test(raw) || /^NetEase Cloud Music$/i.test(raw)) return null;
    return raw;
  } catch { return null; }
}

async function detectViaGSMTC(): Promise<string | null> {
  try {
    const psScript =
      "$manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]::new(); $sessions = $manager.GetSessions(); foreach ($session in $sessions) { $info = $session.TryGetMediaPropertiesAsync().GetAwaiter().GetResult(); $title = $info.Title; $artist = $info.Artist; if ($title -and $artist) { Write-Output \"$artist - $title\"; break } elseif ($title) { Write-Output $title; break } }";
    const raw = await ps(psScript);
    return raw || null;
  } catch { return null; }
}

export async function detectSong() {
  const title1 = await detectViaWindowTitle();
  if (title1) return { ok: true, rawTitle: title1, source: "window_title" as const };
  const title2 = await detectViaGSMTC();
  if (title2) return { ok: true, rawTitle: title2, source: "gsmtc" as const };
  return { ok: false, hint: "无法自动侦测。请确保音乐播放器正在运行。" };
}
