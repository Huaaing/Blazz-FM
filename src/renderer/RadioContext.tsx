import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface RadioTrack {
  title?: string;
  artist?: string;
  album?: string;
  rawTitle?: string;
  source?: string;
}

interface RadioIntro {
  text: string;
  songLabel: string;
  timestamp: number;
}

export type RadioState = "idle" | "detecting" | "generating" | "speaking" | "done";

interface RadioCtx {
  state: RadioState;
  currentTrack: RadioTrack | null;
  lastIntro: RadioIntro | null;
  history: RadioIntro[];
  expanded: boolean;
  volume: number;
  autoDetect: boolean;
  setVolume: (v: number) => void;
  triggerRadio: (manualTrack?: RadioTrack) => Promise<void>;
  toggleExpanded: () => void;
  replayIntro: () => void;
  cancel: () => void;
  setExpanded: (v: boolean) => void;
  startAutoDetect: () => void;
}

const RadioContext = createContext<RadioCtx | null>(null);
const MAX_HISTORY = 20;

// Type for the preload bridge
declare global {
  interface Window {
    radioAPI: {
      detect: () => Promise<{ ok: boolean; rawTitle?: string; source?: string; hint?: string }>;
      intro: (p: { rawTitle?: string; title?: string; artist?: string }) => Promise<{ ok: boolean; intro?: string; error?: string }>;
      tts: (text: string) => Promise<string>;
      minimize: () => void;
      quit: () => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
    };
  }
}

export function RadioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RadioState>("idle");
  const [currentTrack, setCurrentTrack] = useState<RadioTrack | null>(null);
  const [lastIntro, setLastIntro] = useState<RadioIntro | null>(null);
  const [history, setHistory] = useState<RadioIntro[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [autoDetect, setAutoDetect] = useState(false);
  const volumeRef = useRef(0.8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSongRef = useRef("");
  const busyRef = useRef(false); // prevent concurrent pollForSongChange executions
  const stateRef = useRef<RadioState>(state);
  stateRef.current = state; // keep ref in sync so pollForSongChange can read latest state

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    volumeRef.current = clamped;
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    busyRef.current = false;
    audioRef.current?.pause();
    setAutoDetect(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setState("idle");
  }, []);

  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      const finish = () => {
        if (!abortRef.current) setState("done");
        resolve();
      };

      window.radioAPI.tts(text).then((dataUrl) => {
        if (abortRef.current) { finish(); return; }
        const audio = new Audio(dataUrl);
        audio.volume = volumeRef.current;
        audioRef.current = audio;
        audio.onended = () => { audioRef.current = null; finish(); };
        audio.onerror = (e) => { console.warn("Audio error:", e); audioRef.current = null; finish(); };
        setState("speaking");
        audio.play().catch((e) => { console.warn("Play blocked:", e); finish(); });
      }).catch((err) => {
        console.warn("TTS failed:", err);
        // Fallback to Web Speech API
        const synth = window.speechSynthesis;
        if (!synth) { finish(); return; }
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "zh-CN"; u.rate = 1.0;
        u.onend = () => finish();
        u.onerror = () => finish();
        setState("speaking");
        synth.speak(u);
      });
    });
  }, []);

  const triggerRadio = useCallback(async (manualTrack?: RadioTrack) => {
    abortRef.current = false;
    let track = manualTrack ?? null;

    if (!track) {
      setState("detecting");
      try {
        const data = await window.radioAPI.detect();
        if (data.ok && data.rawTitle) {
          track = { rawTitle: data.rawTitle, source: data.source };
          lastSongRef.current = data.rawTitle;
          setCurrentTrack(track);
        } else { setState("idle"); return; }
      } catch (err) { console.error(err); setState("idle"); return; }
    } else {
      setCurrentTrack(track);
      lastSongRef.current = track.rawTitle || [track.artist, track.title].filter(Boolean).join(" - ") || "";
    }

    if (abortRef.current) return;

    const songLabel = track.rawTitle
      || [track.artist, track.title].filter(Boolean).join(" — ")
      || "未知歌曲";

    setState("generating");
    try {
      const body: Record<string, string> = {};
      if (track.rawTitle) body.rawTitle = track.rawTitle;
      else { if (track.title) body.title = track.title; if (track.artist) body.artist = track.artist; }

      const data = await window.radioAPI.intro(body);
      if (!data.ok || !data.intro) { setState("idle"); return; }
      if (abortRef.current) return;

      const intro: RadioIntro = { text: data.intro, songLabel, timestamp: Date.now() };
      setLastIntro(intro);
      setHistory((prev) => [intro, ...prev].slice(0, MAX_HISTORY));
      await speakText(data.intro);
    } catch (err) { console.error(err); setState("idle"); }
  }, [speakText]);

  const toggleExpanded = useCallback(() => setExpanded((p) => !p), []);
  const replayIntro = useCallback(() => { if (lastIntro) speakText(lastIntro.text); }, [lastIntro, speakText]);

  // ─── Auto-detect: poll for song changes ─────────────────────────────

  const pollForSongChange = useCallback(async () => {
    if (abortRef.current) return;
    // Skip if already processing a song change or if the app is speaking/generating
    if (busyRef.current) return;
    if (stateRef.current === "generating" || stateRef.current === "speaking") return;

    try {
      const data = await window.radioAPI.detect();
      if (!data.ok || !data.rawTitle) return;
      if (data.rawTitle === lastSongRef.current) return; // same song, skip

      // New song detected — trigger the full intro flow
      busyRef.current = true;
      const track: RadioTrack = { rawTitle: data.rawTitle, source: data.source };
      lastSongRef.current = data.rawTitle;
      setCurrentTrack(track);

      if (abortRef.current) { busyRef.current = false; return; }
      const songLabel = data.rawTitle;
      setState("generating");
      const body: Record<string, string> = { rawTitle: data.rawTitle };
      const introData = await window.radioAPI.intro(body);
      if (!introData.ok || !introData.intro) { setState("idle"); busyRef.current = false; return; }
      if (abortRef.current) { busyRef.current = false; return; }

      const intro: RadioIntro = { text: introData.intro, songLabel, timestamp: Date.now() };
      setLastIntro(intro);
      setHistory((prev) => [intro, ...prev].slice(0, MAX_HISTORY));
      await speakText(introData.intro);
      busyRef.current = false;
    } catch {
      // Ensure state is recovered so polling can continue
      setState("idle");
      busyRef.current = false;
    }
  }, [speakText]);

  // Start / stop polling based on autoDetect flag alone.
  // pollForSongChange internally guards against running during
  // "generating" / "speaking" states and against concurrent execution.
  useEffect(() => {
    if (autoDetect) {
      if (!pollRef.current) {
        pollRef.current = setInterval(pollForSongChange, 4000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [autoDetect, pollForSongChange]);

  const startAutoDetect = useCallback(() => {
    abortRef.current = false;
    setAutoDetect(true);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    // Kick off with immediate detection
    triggerRadio();
  }, [triggerRadio]);

  // ─── Context value ──────────────────────────────────────────────────

  return (
    <RadioContext.Provider value={{
      state, currentTrack, lastIntro, history, expanded, volume, autoDetect, setVolume,
      triggerRadio, toggleExpanded, replayIntro, cancel, setExpanded, startAutoDetect,
    }}>
      {children}
    </RadioContext.Provider>
  );
}

export function useRadio() {
  const v = useContext(RadioContext);
  if (!v) throw new Error("useRadio must be used within RadioProvider");
  return v;
}
