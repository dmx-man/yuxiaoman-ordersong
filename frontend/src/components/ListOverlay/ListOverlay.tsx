import { For, Show, createEffect, createSignal } from "solid-js";
import { liveState, smoothCurrentTime } from "@/stores/liveState";
import { pushToast } from "@/utils/toast";
import styles from "./ListOverlay.module.css";

function showQuality(name: string, quality?: string) {
    pushToast(`【${name}】播放品质：${quality || "未知"}`, "info");
}

function fmt(sec: number): string {
    if (!isFinite(sec) || sec <= 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 全屏"点歌列表"展示页 (?view=list)
 *
 */
export function ListOverlay() {
    const now = () => liveState().now;
    const dur = () => liveState().duration;
    const cur = () => smoothCurrentTime();
    const ratio = () => {
        const d = dur();
        return d ? Math.min(1, cur() / d) * 100 : 0;
    };
    const list = () => liveState().queue;

    const platformBadge = (p?: string) =>
        p === "qq" ? "QQ" : p === "wy" ? "网易云" : p === "bili" ? "B站" : "";

    const activeLine = (): string => {
        const s = liveState();
        if (s.activeIdx < 0 || s.activeIdx >= s.lyrics.length) return "";
        return s.lyrics[s.activeIdx]?.text ?? "";
    };
    const lyricText = (): string => {
        if (activeLine()) return activeLine();
        if (liveState().lyricsLoading) return "歌词加载中…";
        return now() ? "纯音乐" : "";
    };

    let boxRef: HTMLDivElement | undefined;
    let innerRef: HTMLSpanElement | undefined;
    const [scrollPx, setScrollPx] = createSignal(0);
    createEffect(() => {
        lyricText(); 
        requestAnimationFrame(() => {
            if (boxRef && innerRef) {
                const overflow = innerRef.scrollWidth - boxRef.clientWidth;
                setScrollPx(overflow > 4 ? overflow : 0);
            }
        });
    });

    return (
        <div class={styles.wrap}>
            <Show when={liveState().notice}>
                {(n) => (
                    <div class={`${styles.notice} ${
                        n().level === "success" ? styles.noticeOk
                            : n().level === "info" ? styles.noticeInfo
                                : styles.noticeWarn
                    }`}>
                        {n().text}
                    </div>
                )}
            </Show>

            <div class={styles.header}>
                <span class={styles.title}>点歌列表</span>
                <span class={styles.count}>{list().length} 首在排</span>
            </div>

            <Show when={now()} fallback={<div class={styles.nowEmpty}>暂无播放</div>}>
                {(it) => (
                    <div
                        class={styles.nowCard}
                        title="双击查看当前播放品质"
                        ondblclick={() => showQuality(it().sname, it().quality)}
                    >
                        <div class={styles.nowRow}>
                            <span class={styles.eq}><i /><i /><i /></span>
                            <div class={styles.nowMain}>
                                <div class={styles.nowName}>{it().sname}</div>
                                <div class={styles.nowSub}>
                                    {it().sartist} · 点歌人 {it().uname}
                                </div>
                            </div>
                            <span class={styles.time}>{fmt(cur())} / {fmt(dur())}</span>
                        </div>
                        <div class={styles.track}>
                            <div class={styles.fill} style={{ width: `${ratio()}%` }} />
                        </div>
                        <Show when={lyricText()}>
                            <div class={styles.lyricBar} ref={boxRef}>
                                <span
                                    ref={innerRef}
                                    class={`${styles.lyricInner} ${scrollPx() > 0 ? styles.marquee : ""}`}
                                    style={{
                                        "--scroll": `-${scrollPx()}px`,
                                        "animation-duration": `${Math.max(4, scrollPx() / 40)}s`
                                    }}
                                >
                                    {lyricText()}
                                </span>
                            </div>
                        </Show>
                    </div>
                )}
            </Show>

            <div class={styles.list}>
                <For each={list()} fallback={<div class={styles.listEmpty}>队列空空，发弹幕点歌吧～</div>}>
                    {(item, i) => (
                        <div
                            class={styles.row}
                            title="双击查看播放品质"
                            ondblclick={() => showQuality(item.sname, item.quality)}
                        >
                            <span class={styles.idx}>{i() + 1}</span>
                            <div class={styles.rowMain}>
                                <div class={styles.snameLine}>
                                    <Show when={platformBadge(item.platform)}>
                                        <span class={`${styles.badge} ${item.platform === "qq" ? styles.qq : item.platform === "bili" ? styles.bili : styles.wy}`}>
                                            {platformBadge(item.platform)}
                                        </span>
                                    </Show>
                                    <span class={styles.sname}>{item.sname}</span>
                                </div>
                                <div class={styles.sub}>{item.sartist} · {item.uname}</div>
                            </div>
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
}
