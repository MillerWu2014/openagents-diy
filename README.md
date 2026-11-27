# OpenAgents 本地版

这是跑在这台电脑上的桌面应用。打开就能用，没有登录。项目数据在本机，接口是 `http://127.0.0.1:18765`，不连接 OpenAgents 官网。

当前安装包版本是 **1.1.19**（Apple Silicon）。仓库标签 **v0.2.0**。

## 能做什么

- **项目。** 新建时填写名称、选择一个本地文件夹，并勾选这台电脑上已经装好的智能体。文件夹会成为这些智能体的工作目录。之后可以在侧边栏切换项目。
- **会话。** 在项目里开会话，用 `@` 点名智能体。消息里的 `\(...\)` 和 `\[...\]` 公式会渲染出来。
- **此电脑。** Computer 页管理本机智能体。Project 页里的 Local Agents 会看到已经连上的这台电脑。
- **成员。** 项目所有者在成员页生成一次性邀请。同一局域网里另一台也装着这个应用的电脑，用链接或邀请码填一个显示名即可加入。邀请不经过邮箱，也不经过官网。智能体留在主机上。
- **Cloud Agents。** 保留用 API Key 接入的云端智能体。Acenta 已去掉。

界面语言只有英文和简体中文，并跟随系统的浅色 / 深色。

## 安装

安装包（未签名）：

`packages/launcher/dist/OpenAgents-1.1.19-mac-arm64.dmg`

先完全退出正在运行的 OpenAgents，再安装。系统若拦截未签名应用，在访达里右键应用选「打开」。仍然打不开时，在终端执行：

```bash
xattr -cr /Applications/OpenAgents.app
```

本机需要一套能 `import fastapi, uvicorn, sqlalchemy` 的 Python。应用会依次查找 Miniconda、Anaconda、Homebrew 和系统里的 `python3`。

## 从源码打包

在 Apple Silicon 上，于仓库根目录执行：

```bash
cd packages/launcher
npm install
npm run build && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --publish never --config.mac.identity=null --config.mac.notarize=false
```

开发时在 `packages/launcher` 运行 `npm run dev`。应用会自己拉起本机接口。

## 数据放在哪

| 内容 | 位置 |
| --- | --- |
| 应用数据与本地数据库 | `~/Library/Application Support/OpenAgents` |
| 启动日志 | `~/.openagents/startup.log` |
| 智能体守护进程日志 | `~/.openagents/daemon.log` |

接口监听局域网，方便另一台电脑接受邀请。没有有效邀请或成员凭证时，局域网上看不到项目内容。项目凭证和智能体控制只接受本机访问。

## 这个版本拿掉的功能

登录、欢迎页、议题、工作流、答疑小助手、知识库、收件箱、面向用户的「频道」、从其他智能体导入历史会话，以及 Acenta。会话本身保留。

## 许可

仓库根目录的 [LICENSE](LICENSE) 是 Apache 2.0。桌面应用（`packages/launcher`）和 agent connector（`packages/agent-connector`）声明为 MIT。
