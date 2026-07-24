import { createSignal } from "solid-js";
import { isTauri } from "@/infra/tauri/invoke";
import { emit } from "@tauri-apps/api/event";
import { settings } from "@/stores/settings";
import { pushToast } from "@/utils/toast";
import styles from "./ExitChoiceModal.module.css";

interface Props {
    onClose: () => void;
}

type Choice = "minimize" | "quit";

/**
 * 点击关闭按钮后由 Rust 触发，弹窗让用户选择"最小化到托盘"或"直接退出"。
 * 选择结果通过事件发回 Rust 处理（避免自定义命令的权限问题）。
 *
 * "记住我的选择"：勾选后把当前选择写入关闭方式配置，下次点关闭不再询问。
 * 默认勾选状态跟随已保存的关闭方式（已设置为非"询问"时默认勾选）。
 */
export function ExitChoiceModal(props: Props) {
    const [selected, setSelected] = createSignal<Choice>("minimize");
    const [remember, setRemember] = createSignal(settings.closeMethod() !== "ask");

    const confirm = async () => {
        const method = selected();
        if (remember()) {
            settings.setCloseMethod(method);
        }
        props.onClose();
        if (!isTauri()) {
            if (method === "quit") {
                try {
                    window.close();
                } catch {
                    /* ignore */
                }
            }
            return;
        }
        try {
            await emit(method === "minimize" ? "exit-choice-minimize" : "exit-choice-quit");
        } catch (e) {
            pushToast(`操作失败：${String(e)}`, "error");
        }
    };

    const options: { value: Choice; title: string; desc: string }[] = [
        { value: "minimize", title: "最小化到托盘", desc: "应用继续在后台运行，可随时从托盘恢复" },
        { value: "quit", title: "直接退出", desc: "完全关闭应用" },
    ];

    return (
        <div class={styles.backdrop} onClick={props.onClose}>
            <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button class={styles.closeX} onClick={props.onClose} title="关闭" aria-label="关闭">×</button>
                <h2 class={styles.h1}>请选择退出方式</h2>
                <p class={styles.subtitle}>你点击了关闭按钮，请选择希望的操作：</p>

                <div class={styles.options}>
                    {options.map((opt) => (
                        <label class={`${styles.option} ${selected() === opt.value ? styles.optionActive : ""}`}>
                            <input
                                type="radio"
                                name="exit-choice"
                                value={opt.value}
                                checked={selected() === opt.value}
                                onChange={() => setSelected(opt.value)}
                            />
                            <span class={styles.radio} />
                            <span class={styles.optionText}>
                                <span class={styles.btnTitle}>{opt.title}</span>
                                <span class={styles.btnDesc}>{opt.desc}</span>
                            </span>
                        </label>
                    ))}
                </div>

                <div class={styles.footer}>
                    <label class={styles.remember}>
                        <input
                            type="checkbox"
                            checked={remember()}
                            onChange={(e) => setRemember(e.currentTarget.checked)}
                        />
                        <span>记住我的选择</span>
                    </label>
                    <button class={styles.confirmBtn} onClick={() => void confirm()}>确定</button>
                </div>
            </div>
        </div>
    );
}
