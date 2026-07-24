import { Show, createSignal } from "solid-js";
import { restartDanmu } from "@/services/DanmuService";
import { danmuStatus, type DanmuStatus } from "@/infra/danmu/status";
import { settings } from "@/stores/settings";
import { saveBiliCookie, session } from "@/stores/session";
import { ENV } from "@/config/env";
import { pushToast } from "@/utils/toast";
import { invoke, isTauri } from "@/infra/tauri/invoke";
import { biliPassportService } from "@/services/AuthService";
import { BiliQrLogin } from "@/components/BiliQrLogin/BiliQrLogin";
import styles from "./SettingsPanel.module.css";
import type { DanmuPlatform } from "@/types";

const OBS_BASE = "http://127.0.0.1:17777";

function buildUrl(view: "stream" | "lyrics" | "list" | "audio" | "full"): string {
    const params: string[] = [];
    if (ENV.ANCHOR_CODE) params.push(`code=${encodeURIComponent(ENV.ANCHOR_CODE)}`);
    if (view !== "full") params.push(`view=${view}`);
    // 直播叠加层: URL 参数跟随"直播叠加层"开关, 让复制出的地址与配置一致
    if (view === "stream") {
        params.push(`showCard=${settings.obsShowSongCard() ? 1 : 0}`);
        params.push(`showLyrics=${settings.obsShowScrollLyrics() ? 1 : 0}`);
        params.push(`showNext=${settings.obsShowNextPreview() ? 1 : 0}`);
        params.push(`showNotice=${settings.obsShowNotice() ? 1 : 0}`);
    }
    const q = params.length ? `?${params.join("&")}` : "";
    return `${OBS_BASE}/order/${q}`;
}

async function copyUrl(url: string, label: string) {
    try {
        await navigator.clipboard.writeText(url);
        pushToast(`已复制：${label}`, "success");
    } catch {
        pushToast("复制失败，请手动选中复制", "warn");
    }
}

export function DanmuSection() {
    const urls = [
        {
            id: "stream",
            label: "直播叠加层（推荐）",
            desc: "透明背景，含当前歌曲卡 + 滚动歌词 + 下一首预告 + 点歌状态提示，适合 OBS 抠图叠在画面右下角",
            url: () => buildUrl("stream")
        },
        {
            id: "lyrics",
            label: "纯歌词",
            desc: "只有大字号滚动歌词，适合卡拉 OK 风格直播",
            url: () => buildUrl("lyrics")
        },
        {
            id: "list",
            label: "完整点歌列表",
            desc: "全屏深色背景，含当前播放 + 进度条 + 完整排队列表，适合单独一块屏或直播间侧栏",
            url: () => buildUrl("list")
        },
        {
            id: "audio",
            label: "音频源（OBS 专用）",
            desc: "添加后请把主程序的音量拉到 0，避免双份声音。",
            url: () => buildUrl("audio")
        }
    ];

    const [showCode, setShowCode] = createSignal(false);
    const STATUS_LABEL: Record<DanmuStatus, string> = {
        idle: "未连接",
        connecting: "连接中…",
        connected: "已连接",
        reconnecting: "重连中…",
        failed: "连接失败"
    };
    const statusColor = () => {
        const s = danmuStatus();
        if (s === "connected") return "var(--success)";
        if (s === "failed") return "var(--error)";
        if (s === "idle") return "var(--text-2)";
        return "var(--warn)";
    };

    const saveAndReconnect = async () => {
        if (!settings.anchorCode().trim()) {
            pushToast("请先填写主播身份码", "warn");
            return;
        }
        pushToast("身份码已保存，正在重连弹幕服务...", "info");
        await restartDanmu();
    };

    const clearCode = () => {
        if (!confirm("确定清除已保存的身份码？\n清除后下次启动会重新弹出引导界面。")) return;
        settings.setAnchorCode("");
        pushToast("身份码已清除，重启应用查看引导界面", "info");
    };

    const openBili = async () => {
        if (!isTauri()) {
            window.open("https://link.bilibili.com/p/center/index#/my-room/start-live", "_blank");
            return;
        }
        try {
            await invoke("open_bili_live_settings");
            pushToast("已打开 B 站直播中心，请扫码登录后复制身份码", "info");
        } catch (e) {
            pushToast(`打开失败：${(e as Error).message}`, "error");
        }
    };

    const pasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                pushToast("剪贴板为空", "warn");
                return;
            }
            settings.setAnchorCode(text.trim());
            pushToast(`已粘贴（${text.trim().length} 字符），请点保存并连接`, "success");
        } catch (e) {
            pushToast(`读取剪贴板失败：${(e as Error).message}`, "error");
        }
    };

    // -- B 站扫码登录 --
    const [showQrLogin, setShowQrLogin] = createSignal(false);

    const [fetchingRoom, setFetchingRoom] = createSignal(false);
    const autoFetchRoom = async (silent = false): Promise<boolean> => {
        if (fetchingRoom()) return false;
        setFetchingRoom(true);
        try {
            const r = await biliPassportService.fetchMyRoomId();
            if (r.code === 0 && r.room_id) {
                settings.setRoomId(String(r.room_id));
                pushToast(`已自动获取房间号：${r.room_id}，正在连接弹幕…`, "success");
                await restartDanmu();
                return true;
            }
            if (!silent) pushToast(r.message || "未获取到房间号", "warn", 8000);
            return false;
        } finally {
            setFetchingRoom(false);
        }
    };

    const saveRoomAndReconnect = async () => {
        if (!settings.roomId().trim()) {
            pushToast("请先填写直播间房间号", "warn");
            return;
        }
        if (!session.biliUser()?.uname) {
            pushToast("建议先扫码登录 B 站，否则用户 uid 会被打码（冷却/黑名单/切歌会失效）", "warn", 8000);
        }
        pushToast("房间号已保存，正在连接弹幕…", "info");
        await restartDanmu();
    };

    const logoutBili = async () => {
        if (!confirm("确定退出 B 站登录？\n退出后无法自动获取身份码，需要重新扫码。")) return;
        await saveBiliCookie("");
        await biliPassportService.logout();
        session.setBiliUser(null);
        pushToast("已退出 B 站登录", "info");
    };

    return (
        <>
            <Show when={showQrLogin()}>
                <BiliQrLogin
                    onClose={() => setShowQrLogin(false)}
                    onSuccess={() => {
                        // 房间号模式且还没填房间号 → 登录后自动获取一次
                        if (settings.danmuMode() === "room" && !settings.roomId().trim()) {
                            void autoFetchRoom(true);
                        }
                    }}
                />
            </Show>

            <div class={styles.section}>
                <h3>弹幕连接</h3>

                {/* 连接方式切换：房间号(网页协议) / 身份码(开放平台) */}
                <div class={styles.row}>
                    <label>连接方式</label>
                    <select
                        value={settings.danmuMode()}
                        onChange={(e) => {
                            settings.setDanmuMode(e.currentTarget.value as "open" | "room");
                            void restartDanmu();
                        }}
                    >
                        <option value="room">房间号（推荐，永久有效）</option>
                        <option value="open">身份码（官方开放平台）</option>
                    </select>
                    <span />
                </div>
                <div style={{
                    "font-size": "12px", color: "var(--text-2)", "line-height": "1.7",
                    padding: "8px 10px", background: "var(--bg-2)", "border-radius": "4px", "margin-bottom": "10px"
                }}>
                    <Show
                        when={settings.danmuMode() === "room"}
                        fallback={<><b>身份码模式：</b>B 站官方开放平台，稳定但身份码每场开播都会变，需要每次更新。</>}
                    >
                        <b>房间号模式：</b>填一次直播间房间号永久有效，无需身份码。需先扫码登录 B 站以获取完整用户信息（冷却 / 黑名单 / 切歌权限依赖 uid）。
                    </Show>
                </div>

                {/* B 站扫码登录状态 + 自动获取按钮 */}
                <div style={{
                    "margin-bottom": "10px",
                    padding: "10px 12px",
                    background: "var(--bg-2)",
                    "border-radius": "6px",
                    display: "flex",
                    "align-items": "center",
                    gap: "10px",
                    "flex-wrap": "wrap"
                }}>
                    <Show
                        when={session.biliUser()?.uname}
                        fallback={
                            <>
                                <div style={{ flex: 1, "font-size": "12px", color: "var(--text-2)" }}>
                                    {settings.danmuMode() === "room"
                                        ? "扫码登录 B 站后，房间号模式才能拿到完整用户 uid（冷却 / 黑名单 / 切歌权限需要）。"
                                        : "身份码模式需在「开播设置」页手动复制身份码填入下方。"}
                                </div>
                                <button class="primary" onClick={() => setShowQrLogin(true)}>扫码登录 B 站</button>
                            </>
                        }
                    >
                        <div style={{ flex: 1, "font-size": "13px", color: "var(--text-1)", display: "flex", "align-items": "center", gap: "6px" }}>
                            <Show when={session.biliUser()?.avatar}>
                                {(src) => <img src={src()} alt="" style={{ width: "22px", height: "22px", "border-radius": "50%" }} referrerpolicy="no-referrer" />}
                            </Show>
                            <span>已登录 B 站：<b>{session.biliUser()?.uname}</b></span>
                        </div>
                        <Show when={settings.danmuMode() === "room"}>
                            <button
                                class="primary"
                                onClick={() => autoFetchRoom(false)}
                                disabled={fetchingRoom()}
                            >
                                {fetchingRoom() ? "获取中…" : "自动获取房间号"}
                            </button>
                        </Show>
                        <button onClick={logoutBili} style={{ "font-size": "12px" }}>退出</button>
                    </Show>
                </div>

                {/* ───── 房间号模式：房间号输入 ───── */}
                <Show when={settings.danmuMode() === "room"}>
                    <div style={{ "margin-bottom": "10px" }}>
                        <label style={{ display: "block", "font-size": "13px", color: "var(--text-1)", "margin-bottom": "6px" }}>
                            直播间房间号
                        </label>
                        <div style={{ display: "flex", gap: "6px", "align-items": "center" }}>
                            <input
                                type="text"
                                value={settings.roomId()}
                                onInput={(e) => settings.setRoomId(e.currentTarget.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveRoomAndReconnect(); }}
                                placeholder="填你直播间 URL 里的房间号，回车保存"
                                style={{ flex: 1, "min-width": 0, "font-family": "monospace" }}
                                autocomplete="off"
                            />
                            <button class="primary" onClick={saveRoomAndReconnect} style={{ "flex-shrink": 0, "white-space": "nowrap" }}>
                                保存并连接
                            </button>
                        </div>
                        <div style={{ "font-size": "11px", color: "var(--text-2)", "margin-top": "6px", "line-height": "1.6" }}>
                            房间号在你直播间地址里，例如 <code>live.bilibili.com/<b>123456</b></code> 里的 123456（短号长号都行）。
                        </div>
                    </div>
                </Show>

                {/* ───── 身份码模式：手动 / 粘贴 / 输入 ───── */}
                <Show when={settings.danmuMode() === "open"}>
                    <div style={{
                        "font-size": "12px",
                        color: "var(--text-2)",
                        "line-height": "1.7",
                        padding: "8px 10px",
                        background: "var(--bg-2)",
                        "border-radius": "4px",
                        "margin-bottom": "10px"
                    }}>
                        <b>手动方式：</b>点下面「打开 B 站直播中心」（扫码登录 B 站后看「开播设置 → 身份码」），复制后回这里点「从剪贴板粘贴」。每次开播身份码会重新生成，需要更新。
                    </div>
                    <div style={{ display: "flex", gap: "6px", "margin-bottom": "10px" }}>
                        <button onClick={openBili} style={{ flex: 1 }}>① 打开 B 站直播中心</button>
                        <button onClick={pasteFromClipboard} style={{ flex: 1 }}>② 从剪贴板粘贴</button>
                    </div>
                    <div style={{ "margin-bottom": "10px" }}>
                        <label style={{ display: "block", "font-size": "13px", color: "var(--text-1)", "margin-bottom": "6px" }}>
                            主播身份码
                        </label>
                        <div style={{ display: "flex", gap: "6px", "align-items": "center" }}>
                            <input
                                type={showCode() ? "text" : "password"}
                                value={settings.anchorCode()}
                                onInput={(e) => settings.setAnchorCode(e.currentTarget.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveAndReconnect(); }}
                                placeholder="粘贴身份码，回车保存"
                                style={{ flex: 1, "min-width": 0, "font-family": "monospace" }}
                                autocomplete="off"
                            />
                            <button
                                onClick={() => setShowCode((v) => !v)}
                                style={{ "flex-shrink": 0, "white-space": "nowrap", "font-size": "12px" }}
                            >
                                {showCode() ? "隐藏" : "显示"}
                            </button>
                            <button
                                class="primary"
                                onClick={saveAndReconnect}
                                style={{ "flex-shrink": 0, "white-space": "nowrap" }}
                            >
                                保存并连接
                            </button>
                        </div>
                    </div>
                    <Show when={settings.anchorCode()}>
                        <div class={styles.row}>
                            <label />
                            <div style={{ "font-size": "11px", color: "var(--text-2)" }}>
                                当前已保存身份码
                            </div>
                            <button onClick={clearCode} style={{ "font-size": "11px" }}>清除</button>
                        </div>
                    </Show>

                    <Show when={ENV.ANCHOR_CODE}>
                        <div class={styles.row}>
                            <label>URL 参数</label>
                            <div style={{ "font-size": "11px", color: "var(--accent-2)", "font-family": "monospace", "word-break": "break-all" }}>
                                ?code={ENV.ANCHOR_CODE}（URL 参数优先于本地保存的身份码）
                            </div>
                            <span />
                        </div>
                    </Show>
                </Show>

                <div class={styles.row}>
                    <label>连接状态</label>
                    <div style={{ "font-size": "13px", "font-weight": "600", color: statusColor() }}>
                        {STATUS_LABEL[danmuStatus()]}
                        <Show when={danmuStatus() === "connected" && session.adminUid()}>
                            <span style={{ "font-size": "11px", "font-weight": "400", color: "var(--text-2)", "margin-left": "6px" }}>
                                uid: {session.adminUid()}
                            </span>
                        </Show>
                    </div>
                    <button onClick={() => restartDanmu()} style={{ "font-size": "11px" }}>重连</button>
                </div>
            </div>

            <div class={styles.section}>
                <h3>弹幕来源</h3>
                <div class={styles.row}>
                    <label>直播平台</label>
                    <select
                        value={settings.danmuPlatform()}
                        onChange={(e) => settings.setDanmuPlatform(e.currentTarget.value as DanmuPlatform)}
                    >
                        <option value="bilibili">哔哩哔哩</option>
                        <option value="douyin" disabled>抖音（暂不支持）</option>
                        <option value="douyu" disabled>斗鱼（暂不支持）</option>
                    </select>
                    <button onClick={() => restartDanmu()}>手动重连</button>
                </div>
            </div>

            <div class={styles.section}>
                <h3>OBS 浏览器源接入</h3>
                <div style={{
                    "font-size": "12px",
                    color: "var(--text-2)",
                    "line-height": "1.7",
                    padding: "8px 10px",
                    background: "var(--bg-2)",
                    "border-radius": "4px",
                    "margin-bottom": "10px"
                }}>
                    <b>用法：</b>在 OBS 中"添加 → 浏览器源 → URL"，粘贴下面的链接。
                    建议"宽 480 高 360"、勾选"关闭源不可见时不再渲染"。叠加层模式背景透明，可直接覆盖到直播画面上。
                    <br />
                    <b style={{ color: "var(--accent-2)" }}>音频采集：</b>
                    推荐用"音频源"这一条 URL 作浏览器源、并勾选"通过 OBS 控制音频"用了音频源以后把主程序音量拉到0。
                </div>
                {urls.map((u) => (
                    <div style={{ "margin-bottom": "10px" }}>
                        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "4px" }}>
                            <b style={{ "font-size": "13px" }}>{u.label}</b>
                            <button onClick={() => copyUrl(u.url(), u.label)}>复制</button>
                        </div>
                        <div style={{
                            "font-size": "11px",
                            "font-family": "monospace",
                            color: "var(--text-1)",
                            "word-break": "break-all",
                            background: "var(--bg-2)",
                            padding: "4px 8px",
                            "border-radius": "4px"
                        }}>{u.url()}</div>
                        <div style={{ "font-size": "11px", color: "var(--text-2)", "margin-top": "3px" }}>{u.desc}</div>
                    </div>
                ))}
            </div>
        </>
    );
}
