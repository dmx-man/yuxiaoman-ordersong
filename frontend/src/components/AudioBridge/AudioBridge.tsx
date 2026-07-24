import { createEffect, onCleanup, onMount, Show } from "solid-js";
import { liveState, smoothCurrentTime } from "@/stores/liveState";

export function AudioBridge() {
    let audio!: HTMLAudioElement;
    let lastSrc = "";
    let lastPlaying = false;
    let userInteracted = false;

    // 淡入淡出状态
    let rafId = 0;
    let pausing = false; // 淡出暂停进行中 (音量渐降但尚未 pause)

    const SEEK_TOLERANCE_SEC = 0.8;

    function cancelRamp(): void {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    /** 音量线性淡入到 1 (durationMs<=0 时直接置 1) */
    function fadeInVolume(durationMs: number): void {
        cancelRamp();
        if (durationMs <= 0) {
            audio.volume = 1;
            return;
        }
        audio.volume = 0;
        const start = performance.now();
        const step = (n: number) => {
            const t = Math.max(0, Math.min(1, (n - start) / durationMs));
            audio.volume = t;
            if (t < 1) rafId = requestAnimationFrame(step);
            else rafId = 0;
        };
        rafId = requestAnimationFrame(step);
    }

    /** 带淡出的暂停: 音量线性降到 0 后再 pause (durationMs<=0 时直接 pause) */
    function fadeOutPause(durationMs: number): void {
        if (audio.paused) return;
        cancelRamp();
        if (durationMs <= 0) {
            audio.pause();
            audio.volume = 1;
            return;
        }
        pausing = true;
        const from = Math.max(0, Math.min(1, audio.volume || 1));
        const start = performance.now();
        const step = (n: number) => {
            const t = Math.max(0, Math.min(1, (n - start) / durationMs));
            audio.volume = from * (1 - t);
            if (t < 1) {
                rafId = requestAnimationFrame(step);
            } else {
                rafId = 0;
                audio.volume = 0; // 保持 0 再暂停, 避免收尾瞬间被重置回 1 产生满音量爆音
                audio.pause();
                pausing = false;
            }
        };
        rafId = requestAnimationFrame(step);
    }

    /** 播放 (带淡入). play() 可能因自动播放限制被拒, 解锁后由稳态纠偏补触发 */
    function startPlay(fadeMs: number): void {
        cancelRamp();
        pausing = false;
        void audio
            .play()
            .then(() => fadeInVolume(fadeMs))
            .catch(() => { /* 需要用户交互, unlock 后重试 */ });
    }

    onMount(() => {
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        audio.volume = 1;

        // OBS 浏览器源默认允许自动播放, 但用户在普通浏览器打开预览时需要
        // 一次点击才能解锁. 记录一下并在下次 sync 里补触发 play().
        const unlock = () => {
            userInteracted = true;
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
        window.addEventListener("pointerdown", unlock);
        window.addEventListener("keydown", unlock);
        onCleanup(() => {
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
            cancelRamp();
        });
    });

    // 主 sync 循环: 跟随 liveState 换源 / 播停 / 追进度 (播停带淡入淡出)
    createEffect(() => {
        const s = liveState();
        const target = s.nowUrl || "";
        const fadeMs = s.fadeEnabled ? Math.max(0, s.fadeDuration ?? 0) : 0;

        // 1. 换源
        if (target !== lastSrc) {
            lastSrc = target;
            cancelRamp();
            pausing = false;
            if (target) {
                audio.src = target;
                audio.currentTime = Math.max(0, smoothCurrentTime());
                lastPlaying = s.playing;
                if (s.playing) startPlay(fadeMs);
            } else {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
                lastPlaying = false;
            }
            return;
        }

        if (!target) return;

        // 2. 播放/暂停跳变 -> 走淡入淡出
        if (s.playing !== lastPlaying) {
            lastPlaying = s.playing;
            if (s.playing) startPlay(fadeMs);
            else fadeOutPause(fadeMs);
        } else if (s.playing && audio.paused && !pausing && userInteracted) {
            // 3. 稳态纠偏: 自动播放被拦/意外暂停时补救
            startPlay(fadeMs);
        }

        // 4. 追帧 (仅在正常播放、且未在淡出暂停过程中; 否则会把正在淡出的尾音往回 seek 导致重复)
        if (s.playing && !pausing) {
            const expect = smoothCurrentTime();
            if (isFinite(expect) && Math.abs(audio.currentTime - expect) > SEEK_TOLERANCE_SEC) {
                audio.currentTime = expect;
            }
        }
    });

    return (
        <div style={{
            position: "fixed",
            inset: "0",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "flex-direction": "column",
            gap: "12px",
            color: "rgba(255, 255, 255, 0.55)",
            "font-family": "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
            "font-size": "13px",
            "pointer-events": "none",
            "user-select": "none",
        }}>
            <audio ref={audio} />
            <div style={{ "font-size": "14px", "font-weight": "600" }}>OBS 音频桥</div>
            <Show
                when={liveState().nowUrl}
                fallback={<div>等待主程序开始播放…</div>}
            >
                <div>{liveState().now?.sname ?? ""} · {liveState().now?.sartist ?? ""}</div>
                <div style={{ opacity: "0.7" }}>{liveState().playing ? "正在播放" : "已暂停"}</div>
            </Show>
        </div>
    );
}
