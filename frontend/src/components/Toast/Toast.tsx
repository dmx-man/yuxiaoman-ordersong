import { For, createSignal } from "solid-js";
import { useToasts, type ToastItem } from "@/utils/toast";
import styles from "./Toast.module.css";

async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // 回退到传统方案
    }
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

export function Toast() {
    const toasts = useToasts();
    const [copiedId, setCopiedId] = createSignal<number | null>(null);

    const onCopy = async (t: ToastItem) => {
        const ok = await copyText(t.text);
        if (ok) {
            setCopiedId(t.id);
            setTimeout(() => setCopiedId((id) => (id === t.id ? null : id)), 1200);
        }
    };

    return (
        <div class={styles.toastBox}>
            <For each={toasts()}>{(t) => (
                <div
                    class={`${styles.item} ${styles[t.level]} ${styles.clickable}`}
                    title="点击复制"
                    onClick={() => onCopy(t)}
                >{copiedId() === t.id ? "已复制 ✓" : t.text}</div>
            )}</For>
        </div>
    );
}
