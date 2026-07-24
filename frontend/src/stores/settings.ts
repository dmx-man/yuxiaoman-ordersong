import { createEffect, createSignal } from "solid-js";
import { loadJSON, saveJSON } from "@/infra/storage/kv";
import type { DanmuPlatform } from "@/types/danmu";
import type { Platform } from "@/types/song";

/**
 * 全局设置 store.
 *
 * 每个设置项都是一个持久化到 localStorage 的 Solid signal; 白名单项会经 kv 层镜像到
 * 后端共享配置, 让桌面窗口与浏览器打开的同 URL 共用一份设置.
 *
 */

const K = {
    musicPlatform: "v3.musicPlatform",
    danmuPlatform: "v3.danmuPlatform",
    /** 弹幕接入方式: open=开放平台身份码 / room=直播间房间号 (网页协议) */
    danmuMode: "v3.danmuMode",
    /** 房间号模式用的直播间房间号 (短号/真实号都行, 后端会转换) */
    roomId: "v3.roomId",
    anchorCode: "v3.anchorCode",
    biliAppId: "v3.biliAppId",
    audioQuality: "v3.audioQuality",
    songListId: "v3.songListId",
    songListHistory: "v3.songListHistory",
    /** 队列播完后默认补歌来源: playlist / favorite / popular */
    idleSource: "v3.idleSource",
    userMaxOrder: "v3.userMaxOrder",
    globalMaxOrder: "v3.globalMaxOrder",
    orderMaxDuration: "v3.orderMaxDuration",
    overLimitSkip: "v3.overLimitSkip",
    cooldownSec: "v3.cooldownSec",
    triggerWords: "v3.triggerWords",
    enableFansMedalBoost: "v3.enableFansMedalBoost",
    fansMedalThreshold: "v3.fansMedalThreshold",
    enableSCBoost: "v3.enableSCBoost",
    showLyrics: "v3.showLyrics",
    theme: "v3.theme",
    /** 自定义主题强调色 (hex, 如 "#ff5fa2") */
    accentColor: "v3.accentColor",
    /** 暂停/播放 快捷键组合 (如 "Ctrl+Space"), 空串表示未设置 */
    shortcutPausePlay: "v3.shortcutPausePlay",
    /** 淡入淡出: 暂停/播放音频时是否走淡入淡出过渡, 默认关 */
    fadeEnabled: "v3.fadeEnabled",
    /** 淡入淡出时长(ms), 默认 1000 */
    fadeDuration: "v3.fadeDuration",
    /** 主程序音量 (0~1), 默认 1, 重新打开时恢复 */
    volume: "v3.volume",
    // OBS 浏览器源 - 直播叠加层显示开关 (默认全部开启)
    obsShowSongCard: "v3.obs.showSongCard",
    obsShowScrollLyrics: "v3.obs.showScrollLyrics",
    obsShowNextPreview: "v3.obs.showNextPreview",
    obsShowNotice: "v3.obs.showNotice",
    /** 关闭方式: ask / minimize / quit */
    closeMethod: "v3.closeMethod",
};

export type IdleSource = "playlist" | "favorite" | "popular";
export type DanmuMode = "open" | "room";
/** 关闭方式: ask=每次询问 / minimize=最小化到托盘 / quit=直接退出 */
export type CloseMethod = "ask" | "minimize" | "quit";

/** 默认主题强调色 (与 global.css 中 --accent 初始值保持一致) */
export const DEFAULT_ACCENT_COLOR = "#ff5fa2";

export interface SongListHistoryItem {
    platform: Platform;
    listId: string;
    listName: string;
}

const [musicPlatform, setMusicPlatform] = createSignal<Platform>(loadJSON(K.musicPlatform, "wy") as Platform);
const [danmuPlatform, setDanmuPlatform] = createSignal<DanmuPlatform>(loadJSON(K.danmuPlatform, "bilibili") as DanmuPlatform);
const [danmuMode, setDanmuMode] = createSignal<DanmuMode>(loadJSON(K.danmuMode, "room") as DanmuMode);
const [roomId, setRoomId] = createSignal<string>(loadJSON(K.roomId, ""));
const [anchorCode, setAnchorCode] = createSignal<string>(loadJSON(K.anchorCode, ""));
const [biliAppId, setBiliAppId] = createSignal<number>(loadJSON(K.biliAppId, 0));
// 统一音质档 (网易云/QQ 通用): standard / exhigh / lossless / hires.
// 默认取最高, 非 VIP 时后端自动降级到可用档位.
const [audioQuality, setAudioQuality] = createSignal<string>(loadJSON(K.audioQuality, "hires"));
const [songListId, setSongListId] = createSignal<string>(loadJSON(K.songListId, "7294328248"));
const [songListHistory, setSongListHistory] = createSignal<SongListHistoryItem[]>(loadJSON(K.songListHistory, []));
const [idleSource, setIdleSource] = createSignal<IdleSource>(loadJSON(K.idleSource, "playlist") as IdleSource);

const [userMaxOrder, setUserMaxOrder] = createSignal<number>(loadJSON(K.userMaxOrder, 3));
const [globalMaxOrder, setGlobalMaxOrder] = createSignal<number>(loadJSON(K.globalMaxOrder, 15));
const [orderMaxDuration, setOrderMaxDuration] = createSignal<number>(loadJSON(K.orderMaxDuration, 0));
const [overLimitSkip, setOverLimitSkip] = createSignal<number>(loadJSON(K.overLimitSkip, 0));
const [cooldownSec, setCooldownSec] = createSignal<number>(loadJSON(K.cooldownSec, 60));
const [triggerWords, setTriggerWords] = createSignal<string[]>(loadJSON(K.triggerWords, ["点歌", "来一首", "我要听"]));
const [enableFansMedalBoost, setEnableFansMedalBoost] = createSignal<boolean>(loadJSON(K.enableFansMedalBoost, true));
const [fansMedalThreshold, setFansMedalThreshold] = createSignal<number>(loadJSON(K.fansMedalThreshold, 10));
const [enableSCBoost, setEnableSCBoost] = createSignal<boolean>(loadJSON(K.enableSCBoost, true));
const [showLyrics, setShowLyrics] = createSignal<boolean>(loadJSON(K.showLyrics, true));
const [theme, setTheme] = createSignal<"dark" | "light">(loadJSON(K.theme, "light"));
const [accentColor, setAccentColor] = createSignal<string>(loadJSON(K.accentColor, DEFAULT_ACCENT_COLOR));
const [shortcutPausePlay, setShortcutPausePlay] = createSignal<string>(loadJSON(K.shortcutPausePlay, ""));
const [fadeEnabled, setFadeEnabled] = createSignal<boolean>(loadJSON(K.fadeEnabled, false));
const [fadeDuration, setFadeDuration] = createSignal<number>(loadJSON(K.fadeDuration, 1000));
const [volume, setVolume] = createSignal<number>(Math.max(0, Math.min(1, loadJSON(K.volume, 1))));
// OBS 浏览器源 - 直播叠加层显示开关, 默认全部开启
const [obsShowSongCard, setObsShowSongCard] = createSignal<boolean>(loadJSON(K.obsShowSongCard, true));
const [obsShowScrollLyrics, setObsShowScrollLyrics] = createSignal<boolean>(loadJSON(K.obsShowScrollLyrics, true));
const [obsShowNextPreview, setObsShowNextPreview] = createSignal<boolean>(loadJSON(K.obsShowNextPreview, true));
const [obsShowNotice, setObsShowNotice] = createSignal<boolean>(loadJSON(K.obsShowNotice, true));
// 关闭方式 (默认询问)
const [closeMethod, setCloseMethod] = createSignal<CloseMethod>(loadJSON(K.closeMethod, "ask") as CloseMethod);

/** 非持久化: 是否正在捕获快捷键, 用于全局监听跳过识别, 避免自触发 */
const [capturingShortcut, setCapturingShortcut] = createSignal<boolean>(false);

createEffect(() => saveJSON(K.musicPlatform, musicPlatform()));
createEffect(() => saveJSON(K.danmuPlatform, danmuPlatform()));
createEffect(() => saveJSON(K.danmuMode, danmuMode()));
createEffect(() => saveJSON(K.roomId, roomId()));
createEffect(() => saveJSON(K.anchorCode, anchorCode()));
createEffect(() => saveJSON(K.biliAppId, biliAppId()));
createEffect(() => saveJSON(K.audioQuality, audioQuality()));
createEffect(() => saveJSON(K.songListId, songListId()));
createEffect(() => saveJSON(K.songListHistory, songListHistory()));
createEffect(() => saveJSON(K.idleSource, idleSource()));
createEffect(() => saveJSON(K.userMaxOrder, userMaxOrder()));
createEffect(() => saveJSON(K.globalMaxOrder, globalMaxOrder()));
createEffect(() => saveJSON(K.orderMaxDuration, orderMaxDuration()));
createEffect(() => saveJSON(K.overLimitSkip, overLimitSkip()));
createEffect(() => saveJSON(K.cooldownSec, cooldownSec()));
createEffect(() => saveJSON(K.triggerWords, triggerWords()));
createEffect(() => saveJSON(K.enableFansMedalBoost, enableFansMedalBoost()));
createEffect(() => saveJSON(K.fansMedalThreshold, fansMedalThreshold()));
createEffect(() => saveJSON(K.enableSCBoost, enableSCBoost()));
createEffect(() => saveJSON(K.showLyrics, showLyrics()));
createEffect(() => saveJSON(K.theme, theme()));
createEffect(() => saveJSON(K.accentColor, accentColor()));
createEffect(() => saveJSON(K.shortcutPausePlay, shortcutPausePlay()));
createEffect(() => saveJSON(K.fadeEnabled, fadeEnabled()));
createEffect(() => saveJSON(K.fadeDuration, fadeDuration()));
createEffect(() => saveJSON(K.volume, volume()));
createEffect(() => saveJSON(K.obsShowSongCard, obsShowSongCard()));
createEffect(() => saveJSON(K.obsShowScrollLyrics, obsShowScrollLyrics()));
createEffect(() => saveJSON(K.obsShowNextPreview, obsShowNextPreview()));
createEffect(() => saveJSON(K.obsShowNotice, obsShowNotice()));
createEffect(() => saveJSON(K.closeMethod, closeMethod()));

export const settings = {
    musicPlatform, setMusicPlatform,
    danmuPlatform, setDanmuPlatform,
    danmuMode, setDanmuMode,
    roomId, setRoomId,
    anchorCode, setAnchorCode,
    biliAppId, setBiliAppId,
    audioQuality, setAudioQuality,
    songListId, setSongListId,
    songListHistory, setSongListHistory,
    idleSource, setIdleSource,
    userMaxOrder, setUserMaxOrder,
    globalMaxOrder, setGlobalMaxOrder,
    orderMaxDuration, setOrderMaxDuration,
    overLimitSkip, setOverLimitSkip,
    cooldownSec, setCooldownSec,
    triggerWords, setTriggerWords,
    enableFansMedalBoost, setEnableFansMedalBoost,
    fansMedalThreshold, setFansMedalThreshold,
    enableSCBoost, setEnableSCBoost,
    showLyrics, setShowLyrics,
    theme, setTheme,
    accentColor, setAccentColor,
    shortcutPausePlay, setShortcutPausePlay,
    fadeEnabled, setFadeEnabled,
    fadeDuration, setFadeDuration,
    volume, setVolume,
    obsShowSongCard, setObsShowSongCard,
    obsShowScrollLyrics, setObsShowScrollLyrics,
    obsShowNextPreview, setObsShowNextPreview,
    obsShowNotice, setObsShowNotice,
    closeMethod, setCloseMethod,
    capturingShortcut, setCapturingShortcut,
};

/**
 * 从 localStorage 重新读取并刷新所有设置 signal
 */
export function reloadSettingsFromStorage(): void {
    setMusicPlatform(loadJSON(K.musicPlatform, "wy") as Platform);
    setDanmuPlatform(loadJSON(K.danmuPlatform, "bilibili") as DanmuPlatform);
    setDanmuMode(loadJSON(K.danmuMode, "room") as DanmuMode);
    setRoomId(loadJSON(K.roomId, ""));
    setAnchorCode(loadJSON(K.anchorCode, ""));
    setBiliAppId(loadJSON(K.biliAppId, 0));
    setAudioQuality(loadJSON(K.audioQuality, "hires"));
    setSongListId(loadJSON(K.songListId, "7294328248"));
    setSongListHistory(loadJSON(K.songListHistory, []));
    setIdleSource(loadJSON(K.idleSource, "playlist") as IdleSource);
    setUserMaxOrder(loadJSON(K.userMaxOrder, 3));
    setGlobalMaxOrder(loadJSON(K.globalMaxOrder, 15));
    setOrderMaxDuration(loadJSON(K.orderMaxDuration, 0));
    setOverLimitSkip(loadJSON(K.overLimitSkip, 0));
    setCooldownSec(loadJSON(K.cooldownSec, 60));
    setTriggerWords(loadJSON(K.triggerWords, ["点歌", "来一首", "我要听"]));
    setEnableFansMedalBoost(loadJSON(K.enableFansMedalBoost, true));
    setFansMedalThreshold(loadJSON(K.fansMedalThreshold, 10));
    setEnableSCBoost(loadJSON(K.enableSCBoost, true));
    setShowLyrics(loadJSON(K.showLyrics, true));
    setTheme(loadJSON(K.theme, "light"));
    setAccentColor(loadJSON(K.accentColor, DEFAULT_ACCENT_COLOR));
    setShortcutPausePlay(loadJSON(K.shortcutPausePlay, ""));
    setFadeEnabled(loadJSON(K.fadeEnabled, false));
    setFadeDuration(loadJSON(K.fadeDuration, 1000));
    setObsShowSongCard(loadJSON(K.obsShowSongCard, true));
    setObsShowScrollLyrics(loadJSON(K.obsShowScrollLyrics, true));
    setObsShowNextPreview(loadJSON(K.obsShowNextPreview, true));
    setObsShowNotice(loadJSON(K.obsShowNotice, true));
    setCloseMethod(loadJSON(K.closeMethod, "ask") as CloseMethod);
}

/** 追加一条空闲歌单历史 (按 platform+listId 去重, 上限 50 条) */
export function pushSongListHistory(item: SongListHistoryItem): void {
    setSongListHistory((arr) => {
        const filtered = arr.filter((x) => !(x.platform === item.platform && x.listId === item.listId));
        return [...filtered, item].slice(-50);
    });
}
