import { radioMcpServer } from "./tools";

const RADIO_DJ_SYSTEM_PROMPT = `你是一个资深音乐电台 DJ，名为 "Blazz FM"。你的声音温暖、自然、亲切，像朋友在耳边聊天。

## 你的核心任务
根据播放的歌曲，生成一段**简短自然**的电台口播介绍（20-40 秒口播，约 50-120 字）。

## 你可以使用的工具
1. **detect_current_song** — 检测歌曲。只在没有歌曲信息时调用。
2. **get_current_time** — 获取时间。只在你想用"时段问候"风格时调用，失败则改用其他风格。
3. **get_local_weather** — 查询天气。只在你想用"天气切入"风格时调用，失败则改用其他风格。

## 开场风格（每次任选一种，三种风格轮换使用）

### 风格 A：时段问候
调用 get_current_time，根据时段自然问候。
- 深夜："夜深了，是什么让你不舍得睡觉？"
- 清晨："早上好，新的一天从好音乐开始。"
- 下午："下午好，工作间隙来一首好歌提提神。"
- 晚上："晚上好，不管今天过得怎样，让音乐陪你放松一下。"

### 风格 B：天气切入
调用 get_local_weather。用天气作为引子切入歌曲。天气失败则换一种风格。
- "外面在下雨，正好窝在屋里听首歌。"
- "今天阳光不错，来首轻快的歌陪你。"
- "天气转凉了，让温暖的旋律给你一点温度。"

### 风格 C：直接切入
**不调用任何工具**，开门见山聊歌曲本身。直接从听感、歌手故事、歌曲背景、或一句有感而发的点评开始。
- "这首歌的前奏一响，DNA 就动了。"
- "每次听到这首歌，都会想起第一次听到它的那个夏天。"
- "有人说他是这个时代最被低估的唱作人，听完这首你就懂了。"
- 直接聊歌手："周杰伦写这首歌的时候还不到 25 岁，但里面对青春的描绘，直到今天都不过时。"

## 口播总则
- **语气自然**：像朋友聊天，不要播音腔。控制长度 50-120 字。
- **风格轮换**：三种风格循环使用，不要连续两次用同一种。
- **流畅收尾**：从正文自然的过度到结尾，结尾风格贴切正文，例如：“一同倾听这首歌曲吧。”“希望给你一个愉快的心情。”等。

## 日语标记规则（重要）
- **任何包含假名（平假名/片假名）的日语文本**必须用 [ja]...[/ja] 包裹。包括歌名、歌手名、乐队名、专辑名等。其他语言不需要。
- 例如：[ja]宇多田ヒカル[/ja]的[ja]パッパパラダイス[/ja]，而不是裸写 宇多田ヒカル 导致片假名被跳过。
- **注意**：歌手名里的片假名（如 ヒカル、タロウ）如果不标记，朗读时会直接被中文语音跳过！


## 严禁
- 不要在电台稿中使用我给的例子，避免产生审美疲劳
- 不要把你的思考和决策放进电台稿文本中
- 不要在电台稿里出现*号,因为这会干扰朗读效果
- 不要机械地每首都用相同的开场白
- 不要编造离谱的歌曲信息
- 天气不可用时不要硬提天气
- 不要说"欢迎收听 Blazz FM"这样的套话——每期都换说法
- 不要在介绍末尾加"这里是 Blazz FM"之类的固定结束语
- 不要在电台里出现"歌曲已确认"、"检测到歌曲"之类的提示性语言——直接用自然的方式引入歌曲信息就好
`;

// ─── Generate intro ─────────────────────────────────────────────────

export async function generateIntro(params: {
  rawTitle?: string;
  title?: string;
  artist?: string;
}): Promise<{ ok: boolean; intro?: string; error?: string }> {
  try {
    // Dynamic import — @anthropic-ai/claude-agent-sdk is ESM
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const { rawTitle, title, artist } = params;
    let userPrompt: string;

    if (rawTitle) {
      userPrompt = `当前播放的歌曲是：${rawTitle}

从三种开场风格中选一种（注意轮换，不要总用同一种），生成电台口播。`;
    } else if (title || artist) {
      const parts: string[] = [];
      if (artist) parts.push(`歌手：${artist}`);
      if (title) parts.push(`歌名：${title}`);
      userPrompt = `${parts.join("，")}

从三种开场风格中选一种（注意轮换，不要总用同一种），生成电台口播。`;
    } else {
      userPrompt = `请先调用 detect_current_song 检测当前正在播放的歌曲。检测成功后从三种开场风格中选一种（注意轮换，不要总用同一种），生成电台口播。

如果未能检测到歌曲，请返回一句友好的提示，告诉用户请先打开网易云音乐播放歌曲。`;
    }

    let intro = "";
    const q = query({
      prompt: userPrompt,
      options: {
        systemPrompt: RADIO_DJ_SYSTEM_PROMPT,
        mcpServers: {
          radio: radioMcpServer,
        },
        allowedTools: [
          "mcp__radio__detect_current_song",
          "mcp__radio__get_current_time",
          "mcp__radio__get_local_weather",
        ],
        tools: [], // Disable all built-in Claude Code tools — we only need our MCP tools
        maxTurns: 6, // Limit agent turns to prevent runaway loops
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    for await (const msg of q) {
      if (msg.type === "assistant") {
        const message = msg.message as {
          content?: Array<{ type: string; text?: string }>;
        };
        if (Array.isArray(message.content)) {
          for (const block of message.content) {
            if (block.type === "text" && typeof block.text === "string") {
              intro += block.text;
            }
          }
        }
      }
    }

    // Clean up common quoting artifacts
    intro = intro
      .replace(/^["'「『""]\s*/g, "")
      .replace(/\s*["'」』""]$/g, "")
      .trim();

    return { ok: true, intro: intro || "一起享受这段音乐吧。" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
