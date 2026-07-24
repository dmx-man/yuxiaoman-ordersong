import { For, Show, createMemo } from "solid-js";
import { liveState, smoothCurrentTime } from "@/stores/liveState";
import { ENV } from "@/config/env";
import styles from "./StreamOverlay.module.css";

const platformBadge = (p?: string) =>
    p === "qq" ? "QQ" : p === "wy" ? "网易云" : p === "bili" ? "B站" : "";

function fmt(sec: number): string {
    if (!isFinite(sec) || sec <= 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * OBS 浏览器源"直播叠加层"
 *
 * 数据来源: 轮询主程序推送的 liveState (跨进程同步) , 自身不播放音频.
 * - 透明背景 → OBS 默认会把透明像素 alpha-blend 到下层场景 (无需色键)
 * - 三段式信息: 当前播放卡 + 当前歌词 + 下一首预告 + 队列前几首
 */
export function StreamOverlay() {
    const now = () => liveState().now;
    const dur = () => liveState().duration;
    const cur = () => smoothCurrentTime();

    const ratio = () => {
        const d = dur();
        if (!d) return 0;
        return Math.min(1, cur() / d) * 100;
    };

    const activeLine = createMemo(() => {
        const s = liveState();
        if (s.activeIdx < 0 || s.activeIdx >= s.lyrics.length) return null;
        return s.lyrics[s.activeIdx];
    });
    const nextLine = createMemo(() => {
        const s = liveState();
        if (s.activeIdx < 0 || s.activeIdx + 1 >= s.lyrics.length) return null;
        return s.lyrics[s.activeIdx + 1];
    });

    const upcoming = () => liveState().queue.slice(0, 3);

    const fallbackLogo = `${import.meta.env.BASE_URL}logo.png`;
    return (
        <div class={styles.wrap}>
            {/* 面向观众的提示（点歌成功 / 冷却 / 超限等；B站不允许第三方发弹幕，只能叠加层提示） */}
            <Show when={ENV.SHOW_NOTICE}>
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
            </Show>

            {/* 当前播放卡 */}
            <Show when={ENV.SHOW_CARD}>
            <div class={styles.card}>
                <div class={styles.cover}>
                    <Show when={now()?.coverUrl} fallback={<img class={styles.coverImg} src={fallbackLogo} alt="logo" />}>
                        {(url) => (
                            <img
                                class={styles.coverImg}
                                src={url()}
                                alt="cover"
                                referrerpolicy="no-referrer"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackLogo; }}
                            />
                        )}
                    </Show>
                </div>
                <div class={styles.info}>
                    <Show when={now()} fallback={<div class={styles.title}>暂无播放</div>}>
                        {(it) => (
                            <>
                                <div class={styles.titleRow}>
                                    <span class={styles.titleText}>{it().sname} - {it().sartist}</span>
                                    <Show when={platformBadge(it().platform)}>
                                        <span class={`${styles.badge} ${it().platform === "qq" ? styles.qq : it().platform === "bili" ? styles.bili : styles.wy}`}>
                                            {platformBadge(it().platform)}
                                        </span>
                                    </Show>
                                </div>
                                <div class={styles.meta}>
                                    <span>{it().uname}</span>
                                    <span>{fmt(cur())} / {fmt(dur())}</span>
                                </div>
                            </>
                        )}
                    </Show>
                    <div class={styles.progressTrack}>
                        <div class={styles.progressFill} style={{ width: `${ratio()}%` }} />
                    </div>
                </div>
            </div>
            </Show>

            {/* 滚动歌词 */}
            <Show when={ENV.SHOW_LYRICS}>
            <div>
                <div class={styles.lyricLine}>
                    <Show when={activeLine()} fallback={<span class={styles.placeholder}>{liveState().lyricsLoading ? "歌词加载中…" : "♪ 纯音乐 ♪"}</span>}>
                        {(l) => <span>{l().text}</span>}
                    </Show>
                </div>
                <Show when={nextLine()}>
                    {(l) => <div class={styles.lyricNext}>{l().text}</div>}
                </Show>
            </div>
            </Show>

            {/* 下一首预告 */}
            <Show when={ENV.SHOW_NEXT}>
                <div class={styles.queue}>
                    <div class={styles.queueTitle}>接下来 ({liveState().queue.length} 首在排)</div>
                    <Show when={upcoming().length > 0} fallback={<div class={styles.queueEmpty}>队列空空，发弹幕点歌吧～</div>}>
                        <For each={upcoming()}>
                            {(it) => (
                                <div class={styles.queueRow}>
                                    <span class={styles.queueSong}>
                                        <span class={styles.queueSongText}><b>{it.sname}</b> - {it.sartist}</span>
                                        <Show when={platformBadge(it.platform)}>
                                            <span class={`${styles.badge} ${it.platform === "qq" ? styles.qq : it.platform === "bili" ? styles.bili : styles.wy}`}>
                                                {platformBadge(it.platform)}
                                            </span>
                                        </Show>
                                    </span>
                                    <span class={styles.user}>{it.uname}</span>
                                </div>
                            )}
                        </For>
                    </Show>
                </div>
            </Show>
        </div>
    );
}
