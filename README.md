# Blazz FM 🎙️

<p align="center">
  <b>AI 电台 DJ</b> — Windows 桌面悬浮窗<br/>
  自动侦测网易云音乐当前播放歌曲 → AI 生成电台介绍 → 神经网络语音朗读
</p>

---

## ✨ 功能

- 📻 **自动侦测歌曲** — 读取网易云音乐窗口标题 & Windows 系统媒体控件，识别当前播放歌曲
- 🧠 **AI 电台稿** — Claude 生成温暖、自然、专业的 DJ 口播（支持 DeepSeek 等兼容 API）
- 🔊 **神经语音** — Microsoft Edge TTS（Xiaoxiao 朗读），自然如真人发声
- 🇯🇵 **日文罗马音** — 自动将日文歌名/歌手名转罗马音，中文朗读不再跳过假名
- 🎈 **悬浮球 UI** — 桌面悬浮窗，可拖拽、透明穿透、展开面板、音量调节、历史记录
- 🔄 **持续侦测模式** — 切歌自动生成新口播，全程无需操作

## 🖼️ 截图

<p align="center">
  <em>悬浮球可任意拖拽定位，不遮挡桌面操作区域</em>
</p>

## 🚀 快速开始

### 前置依赖

- **Node.js** ≥ 18
- **Python** ≥ 3.10（用于 TTS 语音合成）

### 安装

```bash
# 1. 克隆项目
git clone https://github.com/your-username/blazz-fm.git
cd blazz-fm

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 3. 安装 npm 依赖（国内用户建议配置 Electron 镜像）
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install

# 4. 安装 Python 依赖
pip install pykakasi edge-tts
```

### 开发

```bash
# 启动 Vite 开发服务器 + Electron
npm run dev
```

### 构建 & 打包

```bash
npm run build           # 编译 TypeScript + Vite 打包
npm run package         # 打包为便携版 .exe（单个文件）
npm run package:nsis    # 打包为安装版 .exe（带安装向导）
```

## ⚙️ 配置

复制 `.env.example` 为 `.env`，填入 API Key：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_BASE_URL` | AI API 地址 | `https://api.deepseek.com` |
| `ANTHROPIC_API_KEY` | AI API 密钥 | 无（**必填**） |
| `EDGE_TTS_PATH` | edge-tts 路径 | 自动检测 |
| `PYTHON_PATH` | Python 路径 | 自动检测 |

> 支持所有 Anthropic 兼容 API：DeepSeek、Claude、OpenAI 代理等。

## 📁 项目结构

```
├── package.json
├── electron-builder.yml       # Electron 打包配置
├── vite.config.ts             # Vite 构建配置
├── tsconfig.json              # 渲染进程 TS 配置
├── tsconfig.node.json         # 主进程 TS 配置
├── index.html                 # 渲染入口 HTML
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 窗口管理 / IPC / 系统托盘
│   │   ├── detect.ts          # 歌曲侦测（窗口标题 + GSMTC）
│   │   ├── intro.ts           # AI 电台稿生成（Claude Agent SDK）
│   │   ├── tools.ts           # MCP 工具定义（歌曲/时间/天气）
│   │   ├── tts.ts             # TTS 语音合成（Edge TTS + pykakasi）
│   │   └── preload.ts         # 安全 IPC 桥接（contextBridge）
│   └── renderer/              # React UI（悬浮窗）
│       ├── main.tsx           # React 入口
│       ├── App.tsx            # 根组件
│       ├── App.css            # 全局样式
│       ├── RadioContext.tsx   # 状态管理（Context + Hook）
│       └── RadioFloat.tsx     # 悬浮球 UI 组件
└── assets/                    # 应用图标
```

## ⚠️ 注意事项

- **ELECTRON_RUN_AS_NODE** — 如果你的系统中设置了此环境变量（如 STM32 工具链），启动前需清除：

  ```powershell
  # PowerShell
  Remove-Item Env:\ELECTRON_RUN_AS_NODE
  ```
  ```bash
  # Git Bash / WSL
  unset ELECTRON_RUN_AS_NODE
  ```

- **首次 TTS 较慢** — Edge TTS 首次调用需下载语音模型，之后会很快
- **网易云桌面版** — 歌曲侦测依赖网易云音乐 PC 客户端窗口标题

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron 36 |
| UI 框架 | React 19 + Vite 6 |
| 语言 | TypeScript 5 |
| AI SDK | `@anthropic-ai/claude-agent-sdk` |
| 语音合成 | Microsoft Edge TTS + pykakasi |
| MCP 协议 | 内置 MCP Server（歌曲/时间/天气） |

## 📄 License

MIT
