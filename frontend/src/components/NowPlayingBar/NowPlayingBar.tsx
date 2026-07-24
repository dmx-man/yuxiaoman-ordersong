import { Show, createSignal } from "solid-js";
import { audioPlayer } from "@/infra/audio/AudioPlayer";
import { settings } from "@/stores/settings";
import { playNext, togglePlayback } from "@/services/PlayerService";
import { queue } from "@/stores/queue";
import styles from "./NowPlayingBar.module.css";

function fmt(sec: number): string {
    if (!isFinite(sec) || sec <= 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function NowPlayingBar() {
    const current = () => queue.orderList()[0] ?? null;
    const ratio = () => {
        const d = audioPlayer.duration();
        if (!d) return 0;
        return Math.min(1, audioPlayer.currentTime() / d) * 100;
    };

    let trackRef: HTMLDivElement | undefined;
    const seekByClientX = (clientX: number) => {
        if (!trackRef) return;
        const rect = trackRef.getBoundingClientRect();
        const r = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const d = audioPlayer.duration();
        if (d) audioPlayer.seek(r * d);
    };
    const onTrackDown = (e: PointerEvent) => {
        e.preventDefault();
        seekByClientX(e.clientX);
        const move = (ev: PointerEvent) => seekByClientX(ev.clientX);
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    const [vol, setVol] = createSignal(Math.round(settings.volume() * 100));
    const onVol = (v: number) => {
        setVol(v);
        audioPlayer.setVolume(v / 100);
        settings.setVolume(v / 100);
    };

    const fallbackLogo = `${import.meta.env.BASE_URL}logo.png`;
    return (
        <div class={styles.bar}>
            <div class={`${styles.disc} ${audioPlayer.playing() ? styles.spinning : ""}`}>
                <Show
                    when={current()?.song.coverUrl}
                    fallback={<img class={styles.coverImg} src={fallbackLogo} alt="logo" />}
                >
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
                <span class={styles.discHole} />
            </div>

            <div class={styles.info}>
                <Show when={current()} fallback={<div class={styles.title}>暂无播放 · 等待点歌</div>}>
                    {(it) => (
                        <>
                            <div class={styles.title}>
                                {it().song.sname}
                                <span class={styles.artist}> — {it().song.sartist}</span>
                            </div>
                            <div class={styles.meta}>
                                <span class={`${styles.badge} ${it().song.platform === "qq" ? styles.qq : it().song.platform === "bili" ? styles.bili : styles.wy}`}>
                                    {it().song.platform === "qq" ? "QQ" : it().song.platform === "bili" ? "B站" : "网易云"}
                                </span>
                                <span class={styles.user}>点歌人 · {it().uname}</span>
                            </div>
                        </>
                    )}
                </Show>
                <div class={styles.progressRow}>
                    <span class={styles.time}>{fmt(audioPlayer.currentTime())}</span>
                    <div class={styles.track} ref={trackRef} onPointerDown={onTrackDown}>
                        <div class={styles.fill} style={{ width: `${ratio()}%` }}>
                            <span class={styles.thumb} />
                        </div>
                    </div>
                    <span class={styles.time}>{fmt(audioPlayer.duration())}</span>
                </div>
            </div>

            <div class={styles.controls}>
                <div class={styles.volume}>
                    <svg viewBox="0 0 24 24" width="16" height="16" class={styles.volIcon}>
                        <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
                    </svg>
                    <input
                        class={styles.volRange}
                        type="range"
                        min="0"
                        max="100"
                        value={vol()}
                        onInput={(e) => onVol(+e.currentTarget.value)}
                        style={{ "--p": `${vol()}%` }}
                    />
                </div>
                <button
                    class={styles.playBtn}
                    onClick={() => togglePlayback()}
                    title={audioPlayer.playing() ? "暂停" : "播放"}
                >
                    <Show
                        when={audioPlayer.playing()}
                        fallback={<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8 5v14l11-7z" /></svg>}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
                    </Show>
                </button>
                <button class={styles.nextBtn} onClick={() => playNext()} title="下一首">
                    <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                </button>
            </div>
        </div>
    );
}
