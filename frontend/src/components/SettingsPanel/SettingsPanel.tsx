import { Show, createSignal } from "solid-js";
import { LoginSection } from "./LoginSection";
import { OrderSection } from "./OrderSection";
import { DanmuSection } from "./DanmuSection";
import { StatsSection } from "./StatsSection";
import { AboutSection } from "./AboutSection";
import { PrefsSection } from "./PrefsSection";
import styles from "./SettingsPanel.module.css";

export type Tab = "login" | "order" | "danmu" | "stats" | "prefs" | "about";

/** 全局 signal: 当前激活的设置 tab, 让 header 等外部组件可以编程跳转 */
const [activeTab, setActiveTab] = createSignal<Tab>("login");

export function goToSettingsTab(t: Tab) {
    setActiveTab(t);
}

export function SettingsPanel() {
    return (
        <div class={styles.panel}>
            <div class={styles.tabs}>
                <button class={`${styles.tabBtn} ${activeTab() === "login" ? styles.active : ""}`} onClick={() => setActiveTab("login")}>登录</button>
                <button class={`${styles.tabBtn} ${activeTab() === "order" ? styles.active : ""}`} onClick={() => setActiveTab("order")}>点歌</button>
                <button class={`${styles.tabBtn} ${activeTab() === "danmu" ? styles.active : ""}`} onClick={() => setActiveTab("danmu")}>弹幕</button>
                <button class={`${styles.tabBtn} ${activeTab() === "stats" ? styles.active : ""}`} onClick={() => setActiveTab("stats")}>统计</button>
                <button class={`${styles.tabBtn} ${activeTab() === "prefs" ? styles.active : ""}`} onClick={() => setActiveTab("prefs")}>设置</button>
                <button class={`${styles.tabBtn} ${activeTab() === "about" ? styles.active : ""}`} onClick={() => setActiveTab("about")}>关于</button>
            </div>
            <div class={`${styles.body} scroll-y`}>
                <Show when={activeTab() === "login"}><LoginSection /></Show>
                <Show when={activeTab() === "order"}><OrderSection /></Show>
                <Show when={activeTab() === "danmu"}><DanmuSection /></Show>
                <Show when={activeTab() === "stats"}><StatsSection /></Show>
                <Show when={activeTab() === "prefs"}><PrefsSection /></Show>
                <Show when={activeTab() === "about"}><AboutSection /></Show>
            </div>
        </div>
    );
}
