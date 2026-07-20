import { saveWyCookie, saveQqCookie, session } from "@/stores/session";
import { statsStore } from "@/stores/stats";
import { qqService } from "@/services/MusicService";
import { pushToast } from "@/utils/toast";
import { invoke, isTauri } from "@/infra/tauri/invoke";
import { backupConfig, parseConfig, applyImportedConfig, pickConfigFileTauri } from "@/utils/configBackup";
import { APP_VERSION } from "@/version";
import styles from "./SettingsPanel.module.css";

/**
 * 一键清空 -- 仅清登录 Cookie, 保留本地设置和统计
 */
async function clearLoginOnly() {
    if (!confirm("确定要退出网易云 / QQ 音乐两个平台的登录吗？\n本地设置和统计数据不会被清空。")) return;
    await saveWyCookie("");
    await saveQqCookie("");
    void qqService.setCookie("");
    session.setLogin({ netease: { logged: false }, qq: { logged: false } });
    if (isTauri()) {
        try { await invoke("close_netease_login"); } catch { /* ignore */ }
        try { await invoke("close_qq_login"); } catch { /* ignore */ }
    }
    pushToast("已退出所有平台登录", "success");
}

/**
 * 恢复出厂设置 -- 清空本地所有数据并刷新页面
 * - localStorage (设置, cookie, 黑名单, 历史)
 * - IndexedDB (统计 / idb-keyval 默认库)
 * - 内存 QQ cookie (通过后端 setCookie 写空)
 * - 关闭可能打开的登录窗口
 */
async function factoryReset() {
    if (!confirm(
        "！！这会清空全部本地数据：\n" +
        "  · 网易云 / QQ 登录 Cookie\n" +
        "  · 所有设置（音质 / 平台 / 弹幕 / 触发词 / 黑名单 / 历史）\n" +
        "  · 统计数据 (IndexedDB)\n" +
        "  · 队列里正在排队的歌\n\n" +
        "清空后页面会自动刷新，相当于第一次启动。\n" +
        "确定继续？"
    )) return;

    // 1) 清 localStorage (所有 v3.* + 其它)
    try { localStorage.clear(); } catch (err) { console.warn(err); }

    // 2) 清 IndexedDB -- 删掉 idb-keyval 默认库
    try {
        const dbs = (await (indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> })
            .databases?.()) ?? [];
        for (const db of dbs) {
            if (db.name) indexedDB.deleteDatabase(db.name);
        }
        // 兜底: 明确删常见的 idb-keyval 数据库名
        indexedDB.deleteDatabase("keyval-store");
    } catch (err) { console.warn("[reset] indexedDB 清理失败:", err); }

    // 3) 清后端 QQ 内存 cookie
    try { await qqService.setCookie(""); } catch { /* ignore */ }

    // 4) 关掉可能打开的登录 webview
    if (isTauri()) {
        try { await invoke("close_netease_login"); } catch { /* ignore */ }
        try { await invoke("close_qq_login"); } catch { /* ignore */ }
        try { await invoke("close_bili_live_settings"); } catch { /* ignore */ }
    }

    statsStore.clear();

    pushToast("数据已清空，即将刷新页面...", "success");
    setTimeout(() => location.reload(), 600);
}

/** 解析并应用配置文本: 校验 -> 写本地 + 同步后端 -> 刷新. */
async function doImport(text: string): Promise<void> {
    if (!confirm("导入配置将覆盖当前本地设置（含登录 Cookie）。确定继续？")) return;
    try {
        const map = parseConfig(text);
        const keys = Object.keys(map);
        if (keys.length === 0) {
            pushToast("文件中没有可导入的 v3.* 配置项", "error", 6000);
            return;
        }
        const n = await applyImportedConfig(map);
        pushToast(`已导入 ${n} 项配置，即将刷新…`, "success", 5000);
        setTimeout(() => location.reload(), 600);
    } catch (err) {
        console.error("[import-config] 失败:", err);
        pushToast("导入失败：文件格式不正确或不是有效的备份文件", "error", 6000);
    }
}

/** Web 回退: 从隐藏 <input type=file> 读取文件内容后导入. */
async function onFilePicked(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // 允许重复选择同一文件
    if (!file) return;
    const text = await file.text();
    await doImport(text);
}

/** 点击“导入配置”: Tauri 下用原生“打开”对话框; 纯 Web 环境下用 <input type=file>. */
async function onImportClick(): Promise<void> {
    if (isTauri()) {
        // 仅在 Tauri 环境用原生对话框; 取消/失败不回退 web 选择器(避免二次弹窗)
        const text = await pickConfigFileTauri();
        if (text === null) return;
        await doImport(text);
        return;
    }
    fileInput?.click();
}

let fileInput: HTMLInputElement | undefined;

export function AboutSection() {
    return (
        <div class={`${styles.section} ${styles.about}`}>
            <h3>关于</h3>
            <p>
                <strong>鱼小曼点歌助手</strong>
                <span style={{
                    "margin-left": "8px",
                    padding: "1px 6px",
                    "background": "var(--warn)",
                    color: "#1a1f2c",
                    "border-radius": "3px",
                    "font-size": "11px",
                    "font-weight": 600
                }}>BETA</span>
            </p>
            <p>版本：<code>v{APP_VERSION}</code>（测试版，欢迎反馈问题）</p>
            <p>支持平台：网易云音乐 / QQ 音乐</p>
            <p>联系方式：<a href="mailto:dm075@qq.com">dm075@qq.com</a></p>

            <p style={{ "margin-top": "10px" }}><b>观众弹幕指令：</b></p>
            <ul style={{ margin: "4px 0", "padding-left": "20px", "line-height": "1.8", "font-size": "13px" }}>
                <li><code>点歌 歌名</code> / <code>来一首 歌名</code> / <code>我要听 歌名</code></li>
                <li><code>点歌 wy 歌名</code>（指定网易云）/ <code>点歌 qq 歌名</code>（指定 QQ）</li>
                <li><code>切歌</code>（仅本人 / 空闲歌单 / 主播可切）</li>
                <li><code>暂停</code> / <code>播放</code>（仅主播）</li>
            </ul>

            <div style={{ "margin-top": "16px", padding: "12px 14px", background: "var(--bg-2)", "border-radius": "var(--radius-sm)" }}>
                <div style={{ "font-weight": 600, "margin-bottom": "8px" }}>数据维护</div>
                <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={backupConfig} style={{ flex: 1 }}>备份配置</button>
                        <button onClick={onImportClick} style={{ flex: 1 }}>导入配置</button>
                    </div>
                    <input
                        ref={(el) => (fileInput = el)}
                        type="file"
                        accept=".json,application/json"
                        style={{ display: "none" }}
                        onChange={onFilePicked}
                    />
                    <button onClick={clearLoginOnly}>仅退出所有平台登录</button>
                    <button onClick={factoryReset} style={{ background: "var(--error)", color: "#fff", "border-color": "transparent" }}>
                        一键清空所有数据（恢复出厂）
                    </button>
                </div>
            </div>

            <div class={styles.aboutPolicy}>
                <strong>测试版说明</strong>
                <ul>
                    <li>当前为公开测试 Beta 版本，部分功能（抖音/斗鱼弹幕、QQ 扫码登录）尚未实现。</li>
                </ul>

                <strong>隐私协议（摘要）</strong>
                <ul>
                    <li>本插件运行在主播本地，不收集任何观众侧个人信息。</li>
                    <li>主播登录的网易云 / QQ Cookie 仅本地 AES-GCM 加密保存。</li>
                    <li>历史点歌 / 统计数据存储在本地 IndexedDB，可在「统计」面板一键清空。</li>
                    <li>本插件不会将密钥、Cookie 通过任何后端服务上传到第三方。</li>
                </ul>

                <strong>使用条款（摘要）</strong>
                <ul>
                    <li>请遵守 B 站直播社区规范、网易云 / QQ 音乐版权要求。</li>
                    <li>请勿在商业化的对外服务中代播 VIP 歌曲。</li>
                    <li>本插件以"按现状"提供，作者不对使用过程中产生的版权、合规问题承担责任。</li>
                </ul>
            </div>
        </div>
    );
}
