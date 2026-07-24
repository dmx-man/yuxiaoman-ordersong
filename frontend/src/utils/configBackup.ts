/**
 * 配置备份 / 导入.
 *
 * 备份范围: 所有以 `v3.` 开头的 localStorage 键 (设置 / 登录 Cookie / 历史 / 黑名单),
 * 与后端 `shared-config.json` 的键空间一致. 备份文件为带元信息的 JSON:
 *   { "__app": "yuxiaoman-ordersong", "__version": 1, "exportedAt": "...", "data": { ... } }
 * 导入时兼容「包装格式」与「原始 {v3.x: ...} 格式」.
 *
 * 在 Tauri 环境下使用原生对话框 (plugin-dialog) 让用户选择保存/打开位置;
 * 非 Tauri (纯 Web) 环境回退为浏览器下载 / <input type=file>.
 */

import { appConfigApi } from "@/api/appConfig";
import { pushToast } from "@/utils/toast";
import { invoke, isTauri } from "@/infra/tauri/invoke";

const PREFIX = "v3.";
const META_APP = "yuxiaoman-ordersong";

/** 收集当前所有配置 (v3.* 命名空间的 localStorage 键). */
export function collectConfig(): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
            const v = localStorage.getItem(k);
            if (v !== null) out[k] = v;
        }
    }
    return out;
}

function stampedName(): string {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return `yuxiaoman-config-${stamp}.json`;
}

/** 导出配置: Tauri 下弹系统“保存”对话框写入选定路径; 否则浏览器下载. */
export async function backupConfig(): Promise<void> {
    const data = collectConfig();
    const count = Object.keys(data).length;
    const payload = {
        __app: META_APP,
        __version: 1,
        exportedAt: new Date().toISOString(),
        data,
    };
    const json = JSON.stringify(payload, null, 2);

    if (isTauri()) {
        try {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const path = await save({
                defaultPath: stampedName(),
                filters: [{ name: "JSON 配置", extensions: ["json"] }],
            });
            if (!path) {
                pushToast("已取消保存", "info");
                return;
            }
            await invoke("write_text_file", { path, contents: json });
            pushToast(`配置已保存到：${path}`, "success", 5000);
            return;
        } catch (e) {
            console.error("[backup] 原生保存失败，回退到浏览器下载:", e);
            // 落入下方 Web 回退
        }
    }

    // Web 回退：浏览器下载
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = stampedName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    pushToast(`配置已导出（${count} 项）为 JSON 文件`, "success", 5000);
}

/**
 * Tauri 下弹系统“打开”对话框读取备份文件内容; 非 Tauri 或取消/失败时返回 null
 * (此时由调用方回退到 <input type=file>).
 */
export async function pickConfigFileTauri(): Promise<string | null> {
    if (!isTauri()) return null;
    try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
            multiple: false,
            filters: [{ name: "JSON 配置", extensions: ["json"] }],
        });
        if (!selected || Array.isArray(selected)) return null;
        return await invoke<string>("read_text_file", { path: selected });
    } catch (e) {
        console.error("[import] 原生打开失败:", e);
        return null;
    }
}

/** 解析备份文件文本, 仅保留合法 v3.* 字符串键, 返回可写入的映射. */
export function parseConfig(text: string): Record<string, string> {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== "object") throw new Error("格式错误");
    const src: Record<string, unknown> =
        raw.data && typeof raw.data === "object" ? raw.data : raw;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(src)) {
        if (typeof k === "string" && k.startsWith(PREFIX) && typeof v === "string") {
            out[k] = v;
        }
    }
    return out;
}

/** 写入导入的配置到 localStorage, 并同步到后端共享配置. */
export async function applyImportedConfig(map: Record<string, string>): Promise<number> {
    const keys = Object.keys(map);
    for (const k of keys) localStorage.setItem(k, map[k]);
    try {
        await appConfigApi.patch(map);
    } catch {
        /* 失败不影响本地, 下次变更会再上送 */
    }
    return keys.length;
}
