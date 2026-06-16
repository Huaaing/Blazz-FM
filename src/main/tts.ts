import { exec } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync, unlinkSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";

// ─── Async exec helper ────────────────────────────────────────────

/** Run a shell command asynchronously — never blocks the event loop */
function execAsync(
  command: string,
  options: { timeout?: number; windowsHide?: boolean } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        timeout: options.timeout,
        windowsHide: options.windowsHide ?? true,
        encoding: "utf-8",
      },
      (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          resolve((stdout || "").trim());
        }
      },
    );
  });
}

// ─── Auto-detect edge-tts and Python paths ──────────────────────────

let _edgeTts: string | null = null;
let _python: string | null = null;
let _edgeTtsPromise: Promise<string> | null = null;
let _pythonPromise: Promise<string> | null = null;

/** Find an executable by wildcard name using where.exe + common install paths */
async function findExeAsync(pattern: string, searchDirs: string[]): Promise<string | null> {
  // 1. Try where.exe with wildcard (e.g. "python*.exe")
  try {
    const out = await execAsync(`where.exe ${pattern} 2>nul`, { timeout: 3000 });
    if (out) {
      const lines = out.split(/\r?\n/);
      for (const line of lines) {
        const p = line.trim();
        if (p && existsSync(p)) return p;
      }
    }
  } catch { /* not in PATH */ }

  // 2. Search common directories with PowerShell wildcard
  for (const dir of searchDirs) {
    try {
      const psScript =
        `Get-ChildItem -Path "${dir}" -Filter "${pattern}" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName`;
      const out = await execAsync(
        `powershell -NoProfile -Command "${psScript}"`,
        { timeout: 5000 },
      );
      if (out && existsSync(out)) return out;
    } catch { /* continue */ }
  }

  return null;
}

async function findEdgeTts(): Promise<string> {
  if (process.env.EDGE_TTS_PATH && existsSync(process.env.EDGE_TTS_PATH)) {
    return process.env.EDGE_TTS_PATH;
  }

  const baseDirs: string[] = [];
  try {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");

    // Windows Store Python packages
    const pkgDir = join(localAppData, "Packages");
    if (existsSync(pkgDir)) {
      try {
        for (const entry of readdirSync(pkgDir)) {
          if (entry.startsWith("PythonSoftwareFoundation.Python")) {
            baseDirs.push(join(pkgDir, entry, "LocalCache", "local-packages", "*", "Scripts"));
          }
        }
      } catch { /* can't read */ }
    }

    // Traditional Python installs
    baseDirs.push(join(appData, "Python", "*", "Scripts"));
    baseDirs.push("C:\\Python*\\Scripts");
    baseDirs.push("C:\\Program Files\\Python*\\Scripts");
  } catch { /* ignore */ }

  return (await findExeAsync("edge-tts.exe", baseDirs)) || "edge-tts";
}

async function findPython(): Promise<string> {
  if (process.env.PYTHON_PATH && existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }

  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const searchDirs = [
    join(localAppData, "Microsoft", "WindowsApps"),
    "C:\\Python*",
    "C:\\Program Files\\Python*",
  ];

  // Use wildcard patterns — python3.13.exe, python3.exe, python.exe
  const found =
    (await findExeAsync("python3*.exe", searchDirs)) ||
    (await findExeAsync("python*.exe", searchDirs));
  if (found) return found;

  // Last resort: try plain "python" (may work if in PATH via a different mechanism)
  try {
    await execAsync(`python --version`, { timeout: 3000 });
    return "python";
  } catch { /* ok */ }
  try {
    await execAsync(`python3 --version`, { timeout: 3000 });
    return "python3";
  } catch { /* ok */ }

  return "python";
}

async function getEdgeTts(): Promise<string> {
  if (!_edgeTts) {
    if (!_edgeTtsPromise) _edgeTtsPromise = findEdgeTts();
    _edgeTts = await _edgeTtsPromise;
  }
  return _edgeTts;
}

async function getPython(): Promise<string> {
  if (!_python) {
    if (!_pythonPromise) _pythonPromise = findPython();
    _python = await _pythonPromise;
  }
  return _python;
}

// ─── Language detection ─────────────────────────────────────────────

function detectLanguage(text: string): string {
  let cjk = 0, hira = 0, kata = 0, hangul = 0, latin = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x4e00 && cp <= 0x9fff) cjk++;
    else if (cp >= 0x3040 && cp <= 0x309f) hira++;
    else if (cp >= 0x30a0 && cp <= 0x30ff) kata++;
    else if (cp >= 0xac00 && cp <= 0xd7af) hangul++;
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) latin++;
  }
  const total = cjk + hira + kata + hangul + latin || 1;
  const kanaPct = (hira + kata) / total;
  const cjkPct = cjk / total;
  const hangulPct = hangul / total;
  if (kanaPct > 0.25 && kanaPct > cjkPct) return "ja";
  if (hangulPct > 0.25 && hangulPct > cjkPct) return "ko";
  if (cjkPct > 0.3) return "zh";
  return "en";
}

const VOICES: Record<string, string> = {
  zh: "zh-CN-XiaoxiaoNeural",
  ja: "ja-JP-NanamiNeural",
  ko: "ko-KR-SunHiNeural",
  en: "en-US-JennyNeural",
};

// ─── Japanese romanization (pykakasi only) ──────────────────────────

let _pykakasiAvailable: boolean | null = null;
let _pykakasiPromise: Promise<boolean> | null = null;

/** Check if pykakasi is installed; if not, try to install it once */
async function ensurePykakasi(): Promise<boolean> {
  if (_pykakasiAvailable !== null) return _pykakasiAvailable;
  if (_pykakasiPromise) return _pykakasiPromise;

  _pykakasiPromise = (async () => {
    const python = await getPython();
    try {
      await execAsync(`"${python}" -c "import pykakasi"`, { timeout: 5000 });
      _pykakasiAvailable = true;
      return true;
    } catch {
      try {
        await execAsync(`"${python}" -m pip install pykakasi --quiet`, { timeout: 30000 });
        _pykakasiAvailable = true;
        return true;
      } catch {
        console.warn(
          "pykakasi not available — Japanese text will not be romanized. Run: pip install pykakasi",
        );
        _pykakasiAvailable = false;
        return false;
      }
    }
  })();

  return _pykakasiPromise;
}

/**
 * Convert [ja]...[/ja] tags to romaji using pykakasi.
 * Falls back to stripping tags and keeping original text if pykakasi is unavailable.
 */
async function romanizeJaTags(text: string): Promise<string> {
  if (!/\[ja\]/.test(text)) return text;

  if (!(await ensurePykakasi())) {
    // pykakasi unavailable — strip tags, keep original Japanese text
    return text.replace(/\[ja\]|\[\/ja\]/g, "");
  }

  const inFile = join(tmpdir(), `aura_ja_in_${randomUUID()}.txt`);
  const outFile = join(tmpdir(), `aura_ja_out_${randomUUID()}.txt`);
  const scriptFile = join(tmpdir(), `aura_ja_script_${randomUUID()}.py`);

  const pyScript = [
    "import re, sys, pykakasi",
    "kks = pykakasi.kakasi()",
    "with open(sys.argv[1], 'r', encoding='utf-8') as f:",
    "    text = f.read()",
    "def romanize_ja(m):",
    "    conv = kks.convert(m.group(1))",
    "    return ''.join(item['hepburn'] for item in conv)",
    "out = re.sub(r'\\[ja\\]([\\s\\S]*?)\\[/ja\\]', romanize_ja, text)",
    "with open(sys.argv[2], 'w', encoding='utf-8') as f:",
    "    f.write(out)",
  ].join("\n");

  writeFileSync(inFile, text, "utf-8");
  writeFileSync(scriptFile, pyScript, "utf-8");

  try {
    await execAsync(`"${await getPython()}" "${scriptFile}" "${inFile}" "${outFile}"`, {
      timeout: 5000,
    });
    if (existsSync(outFile)) {
      const result = readFileSync(outFile, "utf-8").trim();
      if (result) return result;
    }
  } catch {
    console.warn("pykakasi romanization failed");
  } finally {
    try { unlinkSync(inFile); } catch { /* ok */ }
    try { unlinkSync(outFile); } catch { /* ok */ }
    try { unlinkSync(scriptFile); } catch { /* ok */ }
  }

  // Last resort — strip tags, keep original
  return text.replace(/\[ja\]|\[\/ja\]/g, "");
}

// ─── Main TTS export ────────────────────────────────────────────────

/**
 * Catch any Japanese kana that wasn't wrapped in [ja]...[/ja] tags
 * and auto-romanize it. This is a safety net for when the AI forgets
 * to tag Japanese text (e.g., artist names with katakana like ヒカル).
 *
 * Without this, Chinese TTS voice skips katakana entirely.
 */
async function romanizeUntaggedKana(text: string): Promise<string> {
  // Quick check: any kana left after explicit [ja] tag processing?
  if (!/[぀-ゟ゠-ヿ]/.test(text)) return text;
  if (!(await ensurePykakasi())) return text; // can't romanize without pykakasi

  // Match kana-containing CJK+kana runs, then trim Chinese-only
  // particles from edges. Example: "宇多田ヒカル的" — "的" is Chinese
  // grammar, not Japanese; wrapping it would produce spurious "no".
  const CN_PARTICLE = /^[的了着过得地吗呢吧啊呀和与在是这那我你他她很都也还就才只嘛呐吩咯哥哈嘞咯咪呦哟哼唷哈嘞]$/u;
  text = text.replace(
    /[一-鿿぀-ゟ゠-ヿ]*[぀-ゟ゠-ヿ][一-鿿぀-ゟ゠-ヿ]*/g,
    (match) => {
      // Trim Chinese structural particles from edges
      let s = 0, e = match.length;
      while (s < e && CN_PARTICLE.test(match[s])) s++;
      while (e > s && CN_PARTICLE.test(match[e - 1])) e--;
      const core = match.slice(s, e);
      if (!core || !/[぀-ゟ゠-ヿ]/.test(core)) return match; // no kana left, keep original as-is
      return match.slice(0, s) + `[ja]${core}[/ja]` + match.slice(e);
    },
  );
  return romanizeJaTags(text);
}

export async function synthesizeSpeech(text: string): Promise<string> {
  // Pass 1: process explicit [ja]...[/ja] tags from the AI
  text = await romanizeJaTags(text);
  // Pass 2: safety net — catch any untagged kana that the AI missed
  text = await romanizeUntaggedKana(text);

  const lang = detectLanguage(text);
  const voice = VOICES[lang] ?? VOICES.zh;
  const tmpFile = join(tmpdir(), `aura_tts_${randomUUID()}.mp3`);
  const textFile = join(tmpdir(), `aura_tts_${randomUUID()}.txt`);

  writeFileSync(textFile, text, "utf-8");

  // Use async exec — no longer blocks the main process event loop
  await execAsync(
    `"${await getEdgeTts()}" --voice "${voice}" --rate=+10% -f "${textFile}" --write-media "${tmpFile}"`,
    { timeout: 15000 },
  );

  try { unlinkSync(textFile); } catch { /* ok */ }

  if (!existsSync(tmpFile)) throw new Error("TTS generation failed");

  const buffer = readFileSync(tmpFile);
  try { unlinkSync(tmpFile); } catch { /* ok */ }

  const base64 = buffer.toString("base64");
  return `data:audio/mpeg;base64,${base64}`;
}
