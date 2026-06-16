"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesizeSpeech = synthesizeSpeech;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
// ─── Async exec helper ────────────────────────────────────────────
/** Run a shell command asynchronously — never blocks the event loop */
function execAsync(command, options = {}) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(command, {
            timeout: options.timeout,
            windowsHide: options.windowsHide ?? true,
            encoding: "utf-8",
        }, (error, stdout) => {
            if (error) {
                reject(error);
            }
            else {
                resolve((stdout || "").trim());
            }
        });
    });
}
// ─── Auto-detect edge-tts and Python paths ──────────────────────────
let _edgeTts = null;
let _python = null;
let _edgeTtsPromise = null;
let _pythonPromise = null;
/** Find an executable by wildcard name using where.exe + common install paths */
async function findExeAsync(pattern, searchDirs) {
    // 1. Try where.exe with wildcard (e.g. "python*.exe")
    try {
        const out = await execAsync(`where.exe ${pattern} 2>nul`, { timeout: 3000 });
        if (out) {
            const lines = out.split(/\r?\n/);
            for (const line of lines) {
                const p = line.trim();
                if (p && (0, fs_1.existsSync)(p))
                    return p;
            }
        }
    }
    catch { /* not in PATH */ }
    // 2. Search common directories with PowerShell wildcard
    for (const dir of searchDirs) {
        try {
            const psScript = `Get-ChildItem -Path "${dir}" -Filter "${pattern}" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName`;
            const out = await execAsync(`powershell -NoProfile -Command "${psScript}"`, { timeout: 5000 });
            if (out && (0, fs_1.existsSync)(out))
                return out;
        }
        catch { /* continue */ }
    }
    return null;
}
async function findEdgeTts() {
    if (process.env.EDGE_TTS_PATH && (0, fs_1.existsSync)(process.env.EDGE_TTS_PATH)) {
        return process.env.EDGE_TTS_PATH;
    }
    const baseDirs = [];
    try {
        const localAppData = process.env.LOCALAPPDATA || (0, path_1.join)((0, os_1.homedir)(), "AppData", "Local");
        const appData = process.env.APPDATA || (0, path_1.join)((0, os_1.homedir)(), "AppData", "Roaming");
        // Windows Store Python packages
        const pkgDir = (0, path_1.join)(localAppData, "Packages");
        if ((0, fs_1.existsSync)(pkgDir)) {
            try {
                for (const entry of (0, fs_1.readdirSync)(pkgDir)) {
                    if (entry.startsWith("PythonSoftwareFoundation.Python")) {
                        baseDirs.push((0, path_1.join)(pkgDir, entry, "LocalCache", "local-packages", "*", "Scripts"));
                    }
                }
            }
            catch { /* can't read */ }
        }
        // Traditional Python installs
        baseDirs.push((0, path_1.join)(appData, "Python", "*", "Scripts"));
        baseDirs.push("C:\\Python*\\Scripts");
        baseDirs.push("C:\\Program Files\\Python*\\Scripts");
    }
    catch { /* ignore */ }
    return (await findExeAsync("edge-tts.exe", baseDirs)) || "edge-tts";
}
async function findPython() {
    if (process.env.PYTHON_PATH && (0, fs_1.existsSync)(process.env.PYTHON_PATH)) {
        return process.env.PYTHON_PATH;
    }
    const localAppData = process.env.LOCALAPPDATA || (0, path_1.join)((0, os_1.homedir)(), "AppData", "Local");
    const searchDirs = [
        (0, path_1.join)(localAppData, "Microsoft", "WindowsApps"),
        "C:\\Python*",
        "C:\\Program Files\\Python*",
    ];
    // Use wildcard patterns — python3.13.exe, python3.exe, python.exe
    const found = (await findExeAsync("python3*.exe", searchDirs)) ||
        (await findExeAsync("python*.exe", searchDirs));
    if (found)
        return found;
    // Last resort: try plain "python" (may work if in PATH via a different mechanism)
    try {
        await execAsync(`python --version`, { timeout: 3000 });
        return "python";
    }
    catch { /* ok */ }
    try {
        await execAsync(`python3 --version`, { timeout: 3000 });
        return "python3";
    }
    catch { /* ok */ }
    return "python";
}
async function getEdgeTts() {
    if (!_edgeTts) {
        if (!_edgeTtsPromise)
            _edgeTtsPromise = findEdgeTts();
        _edgeTts = await _edgeTtsPromise;
    }
    return _edgeTts;
}
async function getPython() {
    if (!_python) {
        if (!_pythonPromise)
            _pythonPromise = findPython();
        _python = await _pythonPromise;
    }
    return _python;
}
// ─── Language detection ─────────────────────────────────────────────
function detectLanguage(text) {
    let cjk = 0, hira = 0, kata = 0, hangul = 0, latin = 0;
    for (const ch of text) {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp >= 0x4e00 && cp <= 0x9fff)
            cjk++;
        else if (cp >= 0x3040 && cp <= 0x309f)
            hira++;
        else if (cp >= 0x30a0 && cp <= 0x30ff)
            kata++;
        else if (cp >= 0xac00 && cp <= 0xd7af)
            hangul++;
        else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a))
            latin++;
    }
    const total = cjk + hira + kata + hangul + latin || 1;
    const kanaPct = (hira + kata) / total;
    const cjkPct = cjk / total;
    const hangulPct = hangul / total;
    if (kanaPct > 0.25 && kanaPct > cjkPct)
        return "ja";
    if (hangulPct > 0.25 && hangulPct > cjkPct)
        return "ko";
    if (cjkPct > 0.3)
        return "zh";
    return "en";
}
const VOICES = {
    zh: "zh-CN-XiaoxiaoNeural",
    ja: "ja-JP-NanamiNeural",
    ko: "ko-KR-SunHiNeural",
    en: "en-US-JennyNeural",
};
// ─── Japanese romanization (pykakasi only) ──────────────────────────
let _pykakasiAvailable = null;
let _pykakasiPromise = null;
/** Check if pykakasi is installed; if not, try to install it once */
async function ensurePykakasi() {
    if (_pykakasiAvailable !== null)
        return _pykakasiAvailable;
    if (_pykakasiPromise)
        return _pykakasiPromise;
    _pykakasiPromise = (async () => {
        const python = await getPython();
        try {
            await execAsync(`"${python}" -c "import pykakasi"`, { timeout: 5000 });
            _pykakasiAvailable = true;
            return true;
        }
        catch {
            try {
                await execAsync(`"${python}" -m pip install pykakasi --quiet`, { timeout: 30000 });
                _pykakasiAvailable = true;
                return true;
            }
            catch {
                console.warn("pykakasi not available — Japanese text will not be romanized. Run: pip install pykakasi");
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
async function romanizeJaTags(text) {
    if (!/\[ja\]/.test(text))
        return text;
    if (!(await ensurePykakasi())) {
        // pykakasi unavailable — strip tags, keep original Japanese text
        return text.replace(/\[ja\]|\[\/ja\]/g, "");
    }
    const inFile = (0, path_1.join)((0, os_1.tmpdir)(), `aura_ja_in_${(0, crypto_1.randomUUID)()}.txt`);
    const outFile = (0, path_1.join)((0, os_1.tmpdir)(), `aura_ja_out_${(0, crypto_1.randomUUID)()}.txt`);
    const scriptFile = (0, path_1.join)((0, os_1.tmpdir)(), `aura_ja_script_${(0, crypto_1.randomUUID)()}.py`);
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
    (0, fs_1.writeFileSync)(inFile, text, "utf-8");
    (0, fs_1.writeFileSync)(scriptFile, pyScript, "utf-8");
    try {
        await execAsync(`"${await getPython()}" "${scriptFile}" "${inFile}" "${outFile}"`, {
            timeout: 5000,
        });
        if ((0, fs_1.existsSync)(outFile)) {
            const result = (0, fs_1.readFileSync)(outFile, "utf-8").trim();
            if (result)
                return result;
        }
    }
    catch {
        console.warn("pykakasi romanization failed");
    }
    finally {
        try {
            (0, fs_1.unlinkSync)(inFile);
        }
        catch { /* ok */ }
        try {
            (0, fs_1.unlinkSync)(outFile);
        }
        catch { /* ok */ }
        try {
            (0, fs_1.unlinkSync)(scriptFile);
        }
        catch { /* ok */ }
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
async function romanizeUntaggedKana(text) {
    // Quick check: any kana left after explicit [ja] tag processing?
    if (!/[぀-ゟ゠-ヿ]/.test(text))
        return text;
    if (!(await ensurePykakasi()))
        return text; // can't romanize without pykakasi
    // Match kana-containing CJK+kana runs, then trim Chinese-only
    // particles from edges. Example: "宇多田ヒカル的" — "的" is Chinese
    // grammar, not Japanese; wrapping it would produce spurious "no".
    const CN_PARTICLE = /^[的了着过得地吗呢吧啊呀和与在是这那我你他她很都也还就才只嘛呐吩咯哥哈嘞咯咪呦哟哼唷哈嘞]$/u;
    text = text.replace(/[一-鿿぀-ゟ゠-ヿ]*[぀-ゟ゠-ヿ][一-鿿぀-ゟ゠-ヿ]*/g, (match) => {
        // Trim Chinese structural particles from edges
        let s = 0, e = match.length;
        while (s < e && CN_PARTICLE.test(match[s]))
            s++;
        while (e > s && CN_PARTICLE.test(match[e - 1]))
            e--;
        const core = match.slice(s, e);
        if (!core || !/[぀-ゟ゠-ヿ]/.test(core))
            return match; // no kana left, keep original as-is
        return match.slice(0, s) + `[ja]${core}[/ja]` + match.slice(e);
    });
    return romanizeJaTags(text);
}
async function synthesizeSpeech(text) {
    // Pass 1: process explicit [ja]...[/ja] tags from the AI
    text = await romanizeJaTags(text);
    // Pass 2: safety net — catch any untagged kana that the AI missed
    text = await romanizeUntaggedKana(text);
    const lang = detectLanguage(text);
    const voice = VOICES[lang] ?? VOICES.zh;
    const tmpFile = (0, path_1.join)((0, os_1.tmpdir)(), `aura_tts_${(0, crypto_1.randomUUID)()}.mp3`);
    const textFile = (0, path_1.join)((0, os_1.tmpdir)(), `aura_tts_${(0, crypto_1.randomUUID)()}.txt`);
    (0, fs_1.writeFileSync)(textFile, text, "utf-8");
    // Use async exec — no longer blocks the main process event loop
    await execAsync(`"${await getEdgeTts()}" --voice "${voice}" --rate=+10% -f "${textFile}" --write-media "${tmpFile}"`, { timeout: 15000 });
    try {
        (0, fs_1.unlinkSync)(textFile);
    }
    catch { /* ok */ }
    if (!(0, fs_1.existsSync)(tmpFile))
        throw new Error("TTS generation failed");
    const buffer = (0, fs_1.readFileSync)(tmpFile);
    try {
        (0, fs_1.unlinkSync)(tmpFile);
    }
    catch { /* ok */ }
    const base64 = buffer.toString("base64");
    return `data:audio/mpeg;base64,${base64}`;
}
