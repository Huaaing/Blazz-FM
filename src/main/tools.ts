/**
 * MCP tool definitions for the Blazz FM radio DJ agent.
 * Tools are registered as an in-process MCP server via the Claude Agent SDK.
 */
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { detectSong } from "./detect";
import { get } from "https";

// ─── Tool: detect_current_song ──────────────────────────────────────

const detectCurrentSong = tool(
  "detect_current_song",
  "检测当前主机上正在播放的歌曲。通过网易云音乐窗口标题或 Windows 系统媒体控件 (GSMTC) 来识别歌曲。返回歌曲的原始标题信息（格式通常为'歌手 - 歌名'）。",
  {},
  async () => {
    try {
      const result = await detectSong();
      if (result.ok && result.rawTitle) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                detected: true,
                rawTitle: result.rawTitle,
                source: result.source,
              }),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              detected: false,
              hint: result.hint || "未能检测到正在播放的歌曲。",
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              detected: false,
              error: String(err),
            }),
          },
        ],
      };
    }
  }
);

// ─── Tool: get_current_time ─────────────────────────────────────────

function getTimeOfDay(hour: number): string {
  if (hour >= 5 && hour < 9) return "清晨";
  if (hour >= 9 && hour < 12) return "上午";
  if (hour >= 12 && hour < 14) return "中午";
  if (hour >= 14 && hour < 18) return "下午";
  if (hour >= 18 && hour < 22) return "晚上";
  return "深夜";
}

const getCurrentTime = tool(
  "get_current_time",
  "获取当前本地时间信息，包括时间、星期、日期和时段（清晨/上午/中午/下午/晚上/深夜）。用于在电台口播中自然地提及当前时间。",
  {},
  async () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    const dayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const dayOfWeek = dayNames[now.getDay()];
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    const timeOfDay = getTimeOfDay(hour);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            time: timeStr,
            dayOfWeek,
            date: dateStr,
            timeOfDay,
            iso: now.toISOString(),
          }),
        },
      ],
    };
  }
);

// ─── Tool: get_local_weather ────────────────────────────────────────

/** Fetch a URL as text, with timeout */
function fetchText(url: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = "";
      res.setEncoding("utf-8");
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.on("error", reject);
  });
}

const getLocalWeather = tool(
  "get_local_weather",
  "查询当前主机所在位置的天气信息（通过 IP 自动定位）。返回天气状况和温度。如果查询失败，不要提及天气相关内容。",
  {},
  async () => {
    try {
      // wttr.in auto-detects location from IP, returns plain text
      // Format: weather condition + temperature + humidity + wind
      const text = await fetchText(
        "https://wttr.in/?format=%C|%t|%h|%w&lang=zh",
        5000
      );
      const parts = text.trim().split("|");
      // Parts: [condition, temp, humidity, wind]
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const condition = parts[0].trim();   // e.g. "晴"
        const temp = parts[1].trim();         // e.g. "+22°C"
        const humidity = parts[2]?.trim() || "";
        const wind = parts[3]?.trim() || "";

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                available: true,
                condition,
                temperature: temp,
                humidity: humidity || undefined,
                wind: wind || undefined,
              }),
            },
          ],
        };
      }
      throw new Error("Empty weather data");
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              available: false,
              reason: "天气服务暂时不可用",
            }),
          },
        ],
      };
    }
  }
);

// ─── Create and export the MCP server ───────────────────────────────

export const radioMcpServer = createSdkMcpServer({
  name: "radio",
  version: "1.0.0",
  tools: [detectCurrentSong, getCurrentTime, getLocalWeather],
  alwaysLoad: true, // Always load tools in context (no deferred tool search)
});
