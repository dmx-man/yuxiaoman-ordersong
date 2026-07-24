import { DEFAULT_ACCENT_COLOR } from "@/stores/settings";

/**
 * 规范化 hex 颜色字符串.
 * 支持 "#rgb" / "rgb" / "#rrggbb" / "rrggbb", 统一返回小写的 "#rrggbb".
 * 非法输入返回 null.
 */
export function normalizeHex(input: string): string | null {
    let s = input.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(s)) {
        s = s.split("").map((c) => c + c).join("");
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) return "#" + s.toLowerCase();
    return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace(/^#/, "");
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

/**
 * 把强调色写入根节点 CSS 变量, 并联动更新 --accent 派生的相关变量,
 * 从而让全局所有引用 var(--accent) 的地方实时生效.
 */
export function applyAccentColor(hex: string): void {
    const norm = normalizeHex(hex) ?? DEFAULT_ACCENT_COLOR;
    const { r, g, b } = hexToRgb(norm);
    const root = document.documentElement.style;
    root.setProperty("--accent", norm);
    root.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.14)`);
    root.setProperty("--glow", `0 0 0 3px rgba(${r}, ${g}, ${b}, 0.18)`);
    root.setProperty("--accent-shadow", `0 4px 14px rgba(${r}, ${g}, ${b}, 0.28)`);
    root.setProperty("--accent-shadow-lg", `0 6px 18px rgba(${r}, ${g}, ${b}, 0.4)`);
    root.setProperty("--accent-grad", `linear-gradient(135deg, ${norm} 0%, #b06bff 50%, #5fd0ff 100%)`);
}
