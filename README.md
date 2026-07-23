本项目相较原项目，新增了如下内容：

* 个性化：音频淡入淡出、直播叠加层个性化显示、快捷键暂停/播放
* 系统：主题设置、关闭方式设置

本项目自动构建exe，可前往[Release](https://github.com/leopold7/yuxiaoman-ordersong/releases)页面中下载即可。

开发分支的exe可前往[Actions](https://github.com/leopold7/yuxiaoman-ordersong/actions)中自行下载，也可前往[Release](https://github.com/leopold7/yuxiaoman-ordersong/releases)页面中下载最新的开发分支exe

*本项目已支持通过[Now Playing Service](https://github.com/leopold7/now-playing-service)适配，可使用[Now Playing Service](https://github.com/leopold7/now-playing-service)的播放器样式等等*

---

# 鱼小曼点歌助手

> B 站直播弹幕点歌工具 · 桌面端（Tauri 2 + Rust + SolidJS） · （Beta）

观众在直播间发一句「点歌 起风了」，应用就自动搜索、取流、排队、播放，并把当前歌曲与滚动歌词通过 OBS 浏览器源叠加到直播画面。后端用 Rust 内嵌 axum 服务直连网易云 / QQ 音乐，无需自部署任何第三方音乐 API。

## 功能特性

- **两种弹幕接入**：房间号模式（网页协议，永久有效）/ 身份码模式（B 站开放平台「互动玩法」）
- **多音乐源**：网易云音乐、QQ 音乐，扫码登录解锁 VIP 音质，自动按音质链路降级
- **点歌规则**：每人点歌数 / 全局队列上限 / 时长上限 / 冷却时间 / 自定义触发词 / SC 与粉丝牌优先级
- **主播主控台**：手动加歌、置顶、上下移动、删除、切歌
- **OBS 叠加层**：透明直播叠加层 / 纯歌词 / 完整点歌列表三种浏览器源视图
- **历史统计**：本地 IndexedDB 存储，歌曲与点歌人 TOP10
- **隐私**：登录 cookie 仅本地 AES-GCM 加密保存，不上传第三方

## 技术栈


| 端   | 技术                                                    |
| --- | ----------------------------------------------------- |
| 后端  | Rust（Cargo Workspace 多 crate）+ axum + reqwest + tokio |
| 桌面壳 | Tauri 2                                               |
| 前端  | TypeScript + SolidJS + Vite                           |
| 通信  | 本机 HTTP + JSON（内嵌服务 `127.0.0.1:17777`）                |


目录结构与分层详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，HTTP 接口详见 [docs/HTTP-API.md](docs/HTTP-API.md)。

## 环境要求

- Node.js 20+、pnpm 9+
- Rust 1.75+（仅桌面打包需要）、Windows 上需 Visual Studio Build Tools（C++ 桌面开发）与 WebView2 Runtime
- B 站「互动玩法」凭据（仅身份码模式需要）：`access_key_id` / `access_key_secret` / `app_id`

## 快速开始

```bash
git clone <repo-url>
cd order_song_yxm
pnpm install
```

配置（可选，仅身份码模式需要）：编辑 `config/config.yaml`，或用环境变量 `ACCESS_KEY_ID` / `ACCESS_KEY_SECRET` / `BILI_APP_ID` 覆盖。

### 开发运行

```bash
# 一条命令：Tauri 会通过 beforeDevCommand 自动拉起 Vite (127.0.0.1:5173)，
# 编译并启动 Rust 桌面壳（内嵌 axum，监听 127.0.0.1:17777），
# WebView 加载 Vite 提供的前端（HMR 可用），API 请求走 vite.config.ts 的 proxy 到 axum。
pnpm dev:desktop
```

> 只调前端（浏览器里看）？可以单独跑 `pnpm dev:frontend`，前提是另外有一个 axum 在
> `127.0.0.1:17777` 上运行（否则 `/order/*-api` 代理会 502）。

### 生产构建（桌面安装包）

```bash
# 构建前端 → 打包资源 → 编译 Rust → 生成 NSIS 安装包
pnpm build:frontend && pnpm installer
```

产物：安装包位于 `desktop-tauri/src-tauri/target/release/bundle/`。

> 桌面打包用 Tauri CLI 自动发现 `desktop-tauri/src-tauri/crates/app/tauri.conf.json`。若 CLI 提示找不到配置，设置环境变量 `TAURI_APP_PATH=desktop-tauri/src-tauri/crates/app` 再执行。

## 观众弹幕指令


| 指令                            | 说明                   | 示例          |
| ----------------------------- | -------------------- | ----------- |
| `点歌 歌名` / `来一首 歌名` / `我要听 歌名` | 触发词可在设置里配置           | `点歌 起风了`    |
| `点歌 wy/qq 歌名`                 | 指定平台                 | `点歌 qq 起风了` |
| `切歌`                          | 仅本人点的歌 / 空闲歌单 / 主播可切 | `切歌`        |
| `暂停` / `播放`                   | 仅主播                  | `暂停`        |


## OBS 接入

在 OBS 添加「浏览器源」，URL 填：

- 直播叠加层（推荐，透明背景）：`http://127.0.0.1:17777/order/?view=stream`
- 纯歌词：`http://127.0.0.1:17777/order/?view=lyrics`
- 完整点歌列表：`http://127.0.0.1:17777/order/?view=list`
- 音频源（OBS 采音专用）：`http://127.0.0.1:17777/order/?view=audio`

> 音频源解决 Tauri/WebView2 应用在 OBS `Application Audio Capture` 里抓不到音频的问题：
> 在 OBS 添加此浏览器源并勾选「通过 OBS 控制音频」，会得到一条独立音轨。使用后把主程序音量拉到 0，避免双份声音。

## 参与贡献

欢迎提交 Issue 与 PR，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 致谢

- [NeteaseCloudMusicApi](https://www.npmjs.com/package/NeteaseCloudMusicApi) 
- [B 站直播创作者服务中心](https://open-live.bilibili.com/) 

## 合规与免责声明

- 本工具运行在主播本地，不收集观众个人信息；登录 cookie 仅本地加密存储。
- 通过网易云 / QQ / B 站的 Web 接口实现，仅供学习与个人直播互动使用。
- 请遵守各平台社区规范与版权要求，请勿用于商业化对外代播 VIP 歌曲。
- 本项目以「按现状」提供，作者不对使用中产生的版权、合规问题承担责任。

## 许可证

[MIT](LICENSE)