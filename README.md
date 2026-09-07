# DevShell

> A Windows SSH client focused on log viewing and troubleshooting.
>
> 一款专注于日志查看和问题排查的 Windows SSH 客户端。

---

## Features / 功能

- **SSH Terminal / SSH 终端** — Multi-tab SSH sessions with xterm.js rendering / 多标签页 SSH 会话，xterm.js 渲染
- **Log Highlighting / 日志高亮** — Auto-detect and colorize log levels (FATAL/ERROR/WARN/INFO/DEBUG/TRACE) / 自动识别并高亮日志等级
- **Log Search / 日志搜索** — In-terminal search (Ctrl+F) + remote Grep search panel / 终端内搜索 + 远程 Grep 搜索面板
- **Real-time Scroll / 实时滚动** — Auto-scroll with pause/resume for tail -f / 自动滚动，向上翻看时暂停，一键恢复
- **Quick Commands / 快捷指令** — Built-in + custom commands with placeholder parameters / 内置 + 自定义指令，支持占位符参数
- **SFTP File Browser / SFTP 文件管理** — Remote file browsing, upload/download with progress / 远程文件浏览，上传/下载含进度条
- **Bastion Host / 堡垒机** — Auto-login through bastion menu system / 通过堡垒机菜单系统自动登录
- **Internationalization / 国际化** — English, 简体中文, 繁體中文
- **Auto Update / 自动更新** — GitHub Releases auto-update / 基于 GitHub Releases 的自动更新

## Installation / 安装

Download the latest `.exe` installer from [Releases](https://github.com/SongJiaHong-Luo/devshell-releases/releases).

从 [Releases](https://github.com/SongJiaHong-Luo/devshell-releases/releases) 下载最新的 `.exe` 安装包。

## Quick Start / 快速开始

### 1. Create a Project / 创建项目

Click the **+** button in the sidebar and select **New Project**.

点击侧边栏 **+** 按钮，选择 **New Project**。

### 2. Add a Server / 添加服务器

Hover over the project node, click the **...** menu, select **Add Server**. Fill in the host, port, username, and authentication method.

将鼠标悬停在项目节点上，点击 **...** 菜单，选择 **Add Server**。填写主机地址、端口、用户名和认证方式。

### 3. Connect / 连接

Double-click the server node to open an SSH terminal.

双击服务器节点打开 SSH 终端。

### 4. View Logs / 查看日志

Run `tail -f /path/to/logfile` in the terminal. Log levels are automatically highlighted. Scroll up to pause auto-scroll, click "Resume" to continue.

在终端执行 `tail -f /path/to/logfile`。日志等级自动高亮。向上滚动暂停自动滚动，点击 "Resume" 恢复。

## Bastion Host Setup / 堡垒机配置

If your environment requires connecting through a bastion host:

如果你的环境需要通过堡垒机连接：

1. Add the bastion host as a normal server / 将堡垒机作为普通服务器添加
2. When adding target servers, select the bastion as **Jump Host** / 添加目标服务器时，选择堡垒机为 **Jump Host**
3. Fill in the **Bastion Menu Command** (e.g., `146`) / 填写 **堡垒机菜单指令**（如 `146`）
4. Double-click the target server to auto-connect through the bastion / 双击目标服务器自动通过堡垒机连接

## Development / 开发

```bash
# Install dependencies / 安装依赖
npm install

# Start dev mode / 启动开发模式
npm run dev

# Build / 构建
npm run build

# Build Windows installer / 构建 Windows 安装包
npm run build:win
```

## Tech Stack / 技术栈

| Layer / 层级 | Technology / 技术 |
|---|---|
| Desktop / 桌面框架 | Electron |
| Build / 构建工具 | electron-vite |
| Frontend / 前端 | React 18 + TypeScript |
| Terminal / 终端 | xterm.js |
| SSH | ssh2 |
| State / 状态管理 | Zustand |
| i18n / 国际化 | i18next |
| UI | Tailwind CSS + shadcn/ui |

## Project Structure / 项目结构

```
src/
├── main/              Electron main process / 主进程
│   ├── ssh/           SSH session & SFTP management / SSH 会话与 SFTP 管理
│   ├── store/         Persistent config storage / 持久化配置存储
│   └── ipc/           IPC handler registration / IPC 处理器注册
├── preload/           Context bridge / 上下文桥接
├── renderer/          React frontend / React 前端
│   ├── components/    UI components / UI 组件
│   ├── stores/        Zustand stores / 状态管理
│   ├── locales/       i18n translations / 翻译文件
│   └── lib/           Utilities / 工具函数
└── shared/            Shared types / 共享类型定义
```

## License / 许可证

MIT
