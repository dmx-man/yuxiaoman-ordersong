import { Show, For, createSignal, createEffect, onCleanup } from "solid-js";
import { settings, DEFAULT_ACCENT_COLOR } from "@/stores/settings";
import { normalizeHex } from "@/utils/accent";
import styles from "./ThemeColorPicker.module.css";

/** 预设常用主题色, 方便一键切换 */
const PRESETS = [
    "#ff5fa2", "#b06bff", "#5fd0ff", "#4fd6a8",
    "#f7c948", "#ff5e7a", "#12b886", "#4dabf7",
];

/**
 * 主题色设置入口: 一个带色块的按钮, 点击展开弹层.
 * 弹层内可用系统颜色盘任意取色, 或手动输入 hex, 也可选预设 / 恢复默认.
 * 选中的颜色写入 settings.accentColor (持久化到本地并镜像到后端共享配置).
 */
export function ThemeColorPicker() {
    const [open, setOpen] = createSignal(false);
    const [hexInput, setHexInput] = createSignal(settings.accentColor());
    let rootRef: HTMLDivElement | undefined;

    // 弹层每次打开时把输入框同步为当前颜色
    createEffect(() => {
        if (open()) setHexInput(settings.accentColor());
    });

    const onDocClick = (e: MouseEvent) => {
        if (rootRef && !rootRef.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    onCleanup(() => document.removeEventListener("click", onDocClick));

    // 应用一个合法颜色
    const pick = (v: string) => {
        const norm = normalizeHex(v);
        if (norm) {
            settings.setAccentColor(norm);
            setHexInput(norm);
        }
    };

    // 手动输入: 保留原始文本, 合法才应用
    const onHexInput = (v: string) => {
        setHexInput(v);
        const norm = normalizeHex(v);
        if (norm) settings.setAccentColor(norm);
    };

    return (
        <div class={styles.wrap} ref={rootRef}>
            <button
                class={styles.trigger}
                onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
                title="自定义主题颜色"
            >
                <span class={styles.swatch} style={{ background: settings.accentColor() }} />
                主题色
            </button>
            <Show when={open()}>
                <div class={styles.panel} onClick={(e) => e.stopPropagation()}>
                    <div class={styles.title}>主题颜色</div>
                    <div class={styles.row}>
                        <input
                            class={styles.wheel}
                            type="color"
                            value={normalizeHex(settings.accentColor()) ?? DEFAULT_ACCENT_COLOR}
                            onInput={(e) => pick(e.currentTarget.value)}
                            title="打开颜色盘取色"
                        />
                        <input
                            class={styles.hex}
                            type="text"
                            value={hexInput()}
                            placeholder="#ff5fa2"
                            spellcheck={false}
                            maxLength={7}
                            onInput={(e) => onHexInput(e.currentTarget.value)}
                        />
                    </div>
                    <div class={styles.presets}>
                        <For each={PRESETS}>
                            {(c) => (
                                <button
                                    class={styles.presetDot}
                                    classList={{ [styles.presetActive]: normalizeHex(settings.accentColor()) === c }}
                                    style={{ background: c }}
                                    title={c}
                                    onClick={() => pick(c)}
                                />
                            )}
                        </For>
                    </div>
                    <button class={styles.reset} onClick={() => pick(DEFAULT_ACCENT_COLOR)}>
                        恢复默认
                    </button>
                </div>
            </Show>
        </div>
    );
}
