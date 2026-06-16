import { useRadio, type RadioState } from "./RadioContext";
import { useCallback, useEffect, useRef, useState } from "react";

/* ─── State helpers ─── */

const STATE_LABEL: Record<RadioState, string> = {
  idle: "", detecting: "侦测中...", generating: "生成中...", speaking: "ON AIR", done: "已播报",
};

const STATE_COLOR: Record<RadioState, string> = {
  idle: "#6feee1", detecting: "#bcc7de", generating: "#6feee1", speaking: "#ff6b6b", done: "#5adace",
};

/* ─── SVG Icons (replaces emoji — consistent across platforms) ─── */

const Icon = {
  Radio: ({ size = 20, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="11" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 7c3-3 9-3 12 0" />
      
    </svg>
  ),
  Record: ({ size = 24, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" opacity="0.5" />
    </svg>
  ),
  RecordFilled: ({ size = 32, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill={color} opacity="0.12" />
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.2" opacity="0.5" />
      <circle cx="12" cy="12" r="6" fill="color-mix(in srgb, currentColor 12%, #1e1f20)" stroke={color} strokeWidth="1.4" />
      <circle cx="12" cy="12" r="2" fill={color} />
    </svg>
  ),
  Search: ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5L21 21" />
    </svg>
  ),
  Sparkle: ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2 5 5 1-3 4 1 6-5-2-5 2 1-6-3-4 5-1z" />
    </svg>
  ),
  Speaker: ({ size = 16, level = 1, color = "currentColor" }: { size?: number; level?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9h3l4-4v14l-4-4H3z" />
      {level >= 1 && <path d="M15 8c1.5 1 2.5 2.5 2.5 4s-1 3-2.5 4" />}
      {level >= 2 && <path d="M18 5c3 1.8 5 4.5 5 7s-2 5.2-5 7" />}
      {level === 0 && <path d="M20 8L15 15M15 8l5 7" opacity="0.7" />}
    </svg>
  ),
  Clock: ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  Refresh: ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12C2 6.5 6.5 2 12 2c2.5 0 4.8.9 6.5 2.4L21 7" />
      <path d="M22 12c0 5.5-4.5 10-10 10-2.5 0-4.8-.9-6.5-2.4L3 17" />
      <polyline points="21,3 21,7 17,7" />
      <polyline points="3,21 3,17 7,17" />
    </svg>
  ),
  Edit: ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l5 5-12 12H4v-5z" />
      <path d="M14 5l5 5" />
    </svg>
  ),
  Volume: ({ size = 16, level = 1, color = "currentColor" }: { size?: number; level?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9h3l4-4v14l-4-4H3z" />
      {level >= 0 && <path d="M13 8c1.5 1 2.5 2.5 2.5 4s-1 3-2.5 4" />}
      {level >= 0.3 && <path d="M15 5c3 1.8 5 4.5 5 7s-2 5.2-5 7" strokeWidth="1.2"/>}
      {level >= 0.7 && <path d="M17 2.5c4.5 2.4 7.5 7 6.5 10s-1 8.4-7.5 9" strokeWidth="1.2" opacity="0.9" />}
      {level == 0 && <path d="M20 8L15 15M15 8l5 7" />}
    </svg>
  ),
};

/* ─── Pulsing ring ─── */

function PulsingRing({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <>
      <span className="pulse-ring" style={{ animationDuration: "1.4s" }} />
      <span className="pulse-ring-outer" style={{ animationDuration: "2s", animationDelay: "0.3s" }} />
    </>
  );
}

/** Strip [ja]...[/ja] tags for display */
function stripJaTags(text: string): string {
  return text.replace(/\[ja\]|\[\/ja\]/g, "");
}

/* ─── Equalizer bars ─── */

function EqualizerBars({ active }: { active: boolean }) {
  return (
    <div className="eq-bars">
      {[0.7, 1, 0.5, 0.85, 0.6, 1, 0.75].map((h, i) => (
        <span key={i} className="eq-bar" style={{
          animation: active ? `eq 0.6s ease-in-out ${i * 0.08}s infinite alternate` : "none",
          opacity: active ? 1 : 0.4,
        }} />
      ))}
    </div>
  );
}

/* ─── Manual input ─── */

function ManualInput({ onSubmit, onCancel }: { onSubmit: (t: string, a: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (title || artist) onSubmit(title.trim(), artist.trim()); }}
      className="flex flex-col gap-2 p-3">
      <div className="text-[10px] opacity-50 uppercase tracking-widest font-semibold">手动输入歌曲</div>
      <input ref={ref} value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="歌曲名（必填）"
        className="input" />
      <input value={artist} onChange={(e) => setArtist(e.target.value)}
        placeholder="歌手名（选填）"
        className="input" />
      <div className="flex gap-2 mt-1">
        <button type="submit" disabled={!title && !artist}
          className="btn-primary flex-1" style={{ opacity: (title || artist) ? 1 : 0.4 }}>
          生成电台介绍
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-3">取消</button>
      </div>
    </form>
  );
}

/* ─── History item ─── */

function HistoryItem({ intro, onReplay }: { intro: { text: string; songLabel: string; timestamp: number }; onReplay: () => void }) {
  return (
    <div className="history-item" onClick={onReplay}>
      <span className="shrink-0 mt-0.5 opacity-40">
        <Icon.Refresh size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold truncate">{stripJaTags(intro.songLabel)}</div>
        <div className="text-[11px] opacity-55 line-clamp-2 mt-0.5">{stripJaTags(intro.text)}</div>
        <div className="text-[10px] opacity-25 mt-1.5 font-mono">
          {new Date(intro.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */

export function RadioFloat() {
  const { state, currentTrack, lastIntro, history, expanded, volume, autoDetect, setVolume,
    triggerRadio, toggleExpanded, replayIntro, cancel, setExpanded, startAutoDetect } = useRadio();

  const [showManual, setShowManual] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const BALL_SIZE = 56;
  const [pos, setPos] = useState({
    x: window.innerWidth - BALL_SIZE - 16,
    y: window.innerHeight - BALL_SIZE - 80,
  });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const dragDist = useRef(0);

  const isActive = state !== "idle" && state !== "done";

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (expanded) return;
    setDragging(true); dragDist.current = 0;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [expanded, pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x, dy = e.clientY - dragStart.current.y;
    dragDist.current += Math.abs(dx) + Math.abs(dy);
    setPos({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  }, [dragging]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const clampedX = Math.max(0, Math.min(window.innerWidth - BALL_SIZE, pos.x));
    const clampedY = Math.max(0, Math.min(window.innerHeight - BALL_SIZE, pos.y));
    setPos({ x: clampedX, y: clampedY });
  }, [dragging, pos]);

  const handleClick = useCallback(() => {
    if (dragDist.current > 6) return;
    toggleExpanded();
  }, [toggleExpanded]);

  const handleManual = useCallback((title: string, artist: string) => {
    setShowManual(false);
    triggerRadio({ title, artist, rawTitle: [artist, title].filter(Boolean).join(" - ") || undefined });
  }, [triggerRadio]);

  const statusColor = STATE_COLOR[state];
  const statusLabel = STATE_LABEL[state];

  const ballPos: React.CSSProperties = { left: pos.x, top: pos.y };
  const isOnRightSide = pos.x > window.innerWidth / 2;

  return (
    <div
      className="radio-float"
      style={ballPos}
      onMouseEnter={() => window.radioAPI.setIgnoreMouseEvents(false)}
      onMouseLeave={() => window.radioAPI.setIgnoreMouseEvents(true)}
    >
      {/* Expanded panel */}
      {expanded && (
        <div className={`panel ${isOnRightSide ? "panel-r" : "panel-l"}`}>
          {/* Header */}
          <div className="panel-header">
            <div className="flex items-center gap-2.5">
              <span style={{ color: statusColor }}>
                <Icon.Radio size={18} color={statusColor} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] opacity-90">Blazz FM</span>
              {statusLabel && (
                <span className="status-badge" style={{ color: statusColor, borderColor: statusColor }}>
                  {statusLabel}
                </span>
              )}
              {autoDetect && (state === "done" || state === "idle") && (
                <span className="status-badge animate-pulse-subtle"
                  style={{ color: "var(--primary)", borderColor: "var(--primary)" }}>
                  持续侦测中
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {/* Volume */}
              <div className="relative">
                <button onClick={() => setShowVolume((v) => !v)} className="icon-btn" title="音量">
                  <Icon.Volume size={16} level={volume} />
                </button>
                {showVolume && (
                  <div className="volume-popup">
                    <input type="range" min="0" max="1" step="0.05" value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="volume-slider" />
                    <span className="text-[10px] w-8 text-right opacity-50 font-mono">{Math.round(volume * 100)}%</span>
                  </div>
                )}
              </div>
              <button onClick={() => setShowHistory((v) => !v)} className="icon-btn" title="历史">
                <Icon.Clock size={15} />
              </button>
            </div>
          </div>

          {/* Body */}
          {showHistory ? (
            <div className="max-h-64 overflow-y-auto">
              {history.length === 0 ? (
                <div className="text-center py-10 text-xs opacity-40">暂无历史记录</div>
              ) : (
                history.map((h, i) => <HistoryItem key={`${h.timestamp}-${i}`} intro={h}
                  onReplay={() => { setShowHistory(false); replayIntro(); }} />)
              )}
            </div>
          ) : showManual ? (
            <ManualInput onSubmit={handleManual} onCancel={() => setShowManual(false)} />
          ) : (
            <div className="p-4 space-y-3.5">
              {currentTrack ? (
                <div className="flex items-center gap-3.5">
                  <div className="album-art">
                    <Icon.RecordFilled size={36} color={statusColor} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate leading-tight">
                      {currentTrack.rawTitle || `${currentTrack.artist || "?"} — ${currentTrack.title || "?"}`}
                    </div>
                    <div className="text-[10px] opacity-40 mt-0.5 uppercase tracking-wider">Now Playing</div>
                  </div>
                  {isActive && <EqualizerBars active={state === "speaking"} />}
                </div>
              ) : state === "detecting" ? (
                <div className="flex items-center gap-3.5">
                  <div className="album-art animate-pulse-subtle">
                    <Icon.Search size={20} color="var(--secondary)" />
                  </div>
                  <div className="text-[13px] opacity-50">正在侦测播放器...</div>
                </div>
              ) : (
                <div className="text-center py-3">
                  <div className="mb-4 opacity-40">
                    <Icon.Radio size={32} color="var(--primary)" />
                  </div>
                  <div className="text-[12px] opacity-45 mb-4">点击下方开始持续侦测播放的歌曲</div>
                  <div className="flex gap-2.5 justify-center">
                    <button onClick={startAutoDetect} className="btn-primary">
                      <Icon.Search size={13} />
                      <span className="ml-1.5">自动侦测</span>
                    </button>
                    <button onClick={() => setShowManual(true)} className="btn-ghost">
                      <Icon.Edit size={13} />
                      <span className="ml-1.5">手动输入</span>
                    </button>
                  </div>
                </div>
              )}

              {state === "generating" && (
                <div className="flex items-center gap-2 text-xs animate-pulse" style={{ color: "var(--primary)" }}>
                  <Icon.Sparkle size={13} color="var(--primary)" />
                  AI 正在撰写电台介绍...
                </div>
              )}

              {lastIntro && state !== "generating" && (
                <div className="intro-card">
                  <div className="text-[13px] leading-relaxed">{stripJaTags(lastIntro.text)}</div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={replayIntro} className="btn-ghost text-[10px] flex items-center gap-1">
                      <Icon.Refresh size={11} /> 重播
                    </button>
                    <button onClick={() => setShowManual(true)} className="btn-ghost text-[10px] flex items-center gap-1">
                      <Icon.Edit size={11} /> 换歌
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer actions */}
          {!showHistory && !showManual && currentTrack && (
            <div className="panel-footer">
              {autoDetect ? (
                <button onClick={cancel} className="btn-ghost flex-1 flex items-center justify-center gap-1 text-[#ff6b6b]">
                  停止侦测
                </button>
              ) : (
                <button onClick={() => triggerRadio()} disabled={state === "generating" || state === "speaking"}
                  className="btn-primary flex-1 flex items-center justify-center gap-1" style={{ opacity: isActive ? 0.4 : 1 }}>
                  <Icon.Search size={12} /> 重新侦测
                </button>
              )}
              <button onClick={() => setShowManual(true)} className="btn-ghost flex-1 flex items-center justify-center gap-1">
                <Icon.Edit size={12} /> 手动输入
              </button>
            </div>
          )}

          {(state === "speaking" || state === "generating") && (
            <div className="px-4 pb-3">
              <button onClick={cancel} className="btn-danger w-full">取消</button>
            </div>
          )}
        </div>
      )}

      {/* The ball */}
      <button onClick={handleClick}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        className="ball"
        style={{
          borderColor: statusColor,
          boxShadow: isActive
            ? `0 0 20px ${statusColor}50, 0 0 40px ${statusColor}25`
            : "0 2px 16px rgba(0,0,0,0.5)",
        }}>
        <PulsingRing active={state === "speaking"} />
        <span style={{ color: statusColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {state === "speaking" ? (
            <Icon.Speaker size={22} level={2} color={statusColor} />
          ) : state === "generating" ? (
            <Icon.Sparkle size={22} color={statusColor} />
          ) : state === "detecting" ? (
            <Icon.Search size={20} color={statusColor} />
          ) : autoDetect && (state === "done" || state === "idle") ? (
            <Icon.Search size={20} color="var(--primary)" />
          ) : (
            <Icon.Radio size={22} color={statusColor} />
          )}
        </span>
        {isActive && <span className="ball-dot" style={{ backgroundColor: statusColor }} />}
        {autoDetect && (state === "done" || state === "idle") && <span className="ball-dot" style={{ backgroundColor: "var(--primary)" }} />}
      </button>
    </div>
  );
}
