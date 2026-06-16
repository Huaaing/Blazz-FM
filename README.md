# Blazz FM 🎙️

AI 电台 DJ — Windows 桌面悬浮窗。自动侦测网易云音乐当前播放歌曲，用 AI 生成电台介绍，神经网络语音朗读。

## 功能

- 📻 **自动侦测**：读取网易云音乐窗口标题，识别当前歌曲
- 🧠 **AI 电台稿**：Claude 生成温暖专业的 DJ 口播
- 🔊 **神经语音**：Microsoft Edge TTS（Xiaoxiao 语音），自然如真人
- 🎈 **悬浮球 UI**：可拖拽、展开面板、音量调节、历史记录
- 🇯🇵 **日文罗马音**：遇到日文歌手/歌名自动转罗马音朗读

## 快速开始

```bash
# 1. 安装依赖（国内用户建议配置镜像）
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install

# 2. 启动
npm run dev

# 3. 生产构建
npm run build

# 4. 打包为 .exe
npm run package        # 便携版（单个 .exe）
npm run package:nsis   # 安装版（带安装程序）
```

## 注意

- **ELECTRON_RUN_AS_NODE=1**：如果你的系统设置了此环境变量（如 STM32 工具链），启动前必须清除：
  ```bash
  unset ELECTRON_RUN_AS_NODE
  ```
  或在 PowerShell 中：
  ```powershell
  Remove-Item Env:\ELECTRON_RUN_AS_NODE
  ```

- **Python**：TTS 需要 Python 3.13+ 和 pykakasi：
  ```bash
  pip install pykakasi edge-tts
  ```

## 项目结构

```
├── package.json
├── electron-builder.yml    # 打包配置
├── vite.config.ts
├── tsconfig.json           # 渲染进程 TS 配置
├── tsconfig.node.json      # 主进程 TS 配置
├── index.html
├── src/
│   ├── main/               # Electron 主进程
│   │   ├── index.ts        # 窗口管理 + IPC + 托盘
│   │   ├── detect.ts       # 歌曲侦测
│   │   ├── intro.ts        # AI 电台稿生成
│   │   ├── tts.ts          # TTS 语音合成
│   │   └── preload.ts      # 安全 IPC 桥接
│   └── renderer/           # React UI
│       ├── main.tsx
│       ├── App.tsx
│       ├── App.css         # 终端风格主题
│       ├── RadioContext.tsx # 状态管理
│       └── RadioFloat.tsx  # 悬浮球 UI
└── assets/                 # 图标
```
