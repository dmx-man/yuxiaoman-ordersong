import { createEffect } from "solid-js";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { togglePlayback } from "@/services/PlayerService";
import { settings } from "@/stores/settings";
import { pushToast } from "@/utils/toast";
import { formatComboDisplay } from "@/utils/hotkey";

/** 当前已注册的组合键（用于变更时先注销旧的） */
let registeredCombo: string | null = null;
let syncing = false;

async function apply(): Promise<void> {
    if (syncing) return;
    syncing = true;
    try {
        // 捕获快捷键期间：先注销，避免录入时自触发播放/暂停
        if (settings.capturingShortcut()) {
            if (registeredCombo) {
                try {
                    await unregister(registeredCombo);
                } catch {
                    /* 忽略：可能本来就没注册成功 */
                }
                registeredCombo = null;
            }
            return;
        }

        const combo = settings.shortcutPausePlay();
        if (registeredCombo && registeredCombo !== combo) {
            try {
                await unregister(registeredCombo);
            } catch {
                /* 忽略 */
            }
            registeredCombo = null;
        }
        if (!combo) return;

        // 先尝试注销，避免页面热重载后“已注册”冲突（幂等）
        try {
            await unregister(combo);
        } catch {
            /* 忽略：可能本来就没注册成功 */
        }
        registeredCombo = null;

        try {
            await register(combo, (event) => {
                // Tauri 在 key-down(Pressed) 与 key-up(Released) 都会回调，
                // 只处理 Pressed，否则会触发两次（播放后又自动暂停）
                if (event.state === "Pressed") {
                    togglePlayback();
                }
            });
            registeredCombo = combo;
            console.info("[global-shortcut] 注册成功:", combo);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[global-shortcut] 注册失败:", combo, e);
            pushToast(`全局快捷键注册失败：${formatComboDisplay(combo)} — ${msg}`, "error", 8000);
        }
    } finally {
        syncing = false;
    }
}

/**
 * 初始化系统级全局快捷键。
 * - 立即按当前设置注册一次；
 * - 之后随「快捷键组合」或「是否正在捕获」变化自动重新注册。
 * 需在组件上下文（如 App 的 onMount）中调用，以建立 Solid effect。
 */
export function initGlobalShortcut(): void {
    void apply();
    createEffect(() => {
        // 依赖这两个信号，变化时重新同步
        settings.shortcutPausePlay();
        settings.capturingShortcut();
        void apply();
    });
}
