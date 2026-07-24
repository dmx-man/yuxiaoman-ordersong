/**
 * 跨进程播放快照类型
 *
 * 主程序持续向后端推送当前播放状态 (now playing / 歌词 / 进度 / 队列) ,
 * OBS 浏览器源 (独立进程) 轮询后渲染
 */

import type { LyricLine } from "@/domain/lyrics/parser";

/** 正在播放的歌曲在 overlay / list 视图里的最小展示信息 */
export interface LiveNowPlaying {
    sname: string;
    sartist: string;
    platform: string;
    coverUrl?: string;
    uname: string;
    quality?: string;
}

/** 一次完整的播放状态快照 */
export interface LiveStateSnapshot {
    now: LiveNowPlaying | null;
    lyrics: LyricLine[];
    /** 歌词是否仍在加载 (overlay 据此显示 "歌词加载中..." 而非误显 "纯音乐") */
    lyricsLoading: boolean;
    activeIdx: number;
    currentTime: number;
    duration: number;
    playing: boolean;
    queue: { sname: string; sartist: string; uname: string; platform?: string; quality?: string }[];
    notice: { text: string; level?: "success" | "warn" | "info" } | null;
    nowUrl?: string | null;
    /** 淡入淡出开关 (主程序设置), 供 OBS 音频源 (?view=audio) 复刻同样的过渡 */
    fadeEnabled?: boolean;
    /** 淡入淡出时长 (ms) */
    fadeDuration?: number;
    /** 主程序写快照时的 wall-clock (ms) , 用于 overlay 端插值平滑进度 */
    t: number;
    /** 自定义主题强调色 (hex, 如 "#ff5fa2") , 主程序推送让 OBS 浏览器源同步 */
    accentColor?: string;
    /** 主题: dark / light, 主程序推送让 OBS 浏览器源同步 */
    theme?: "dark" | "light";
}
