/** 支持的音乐平台 -- 网易云 wy / QQ 音乐 qq / B 站 bili (BV 号点歌) */
export type Platform = "wy" | "qq" | "bili";

/**
 * 一首歌的标准化描述
 *
 * `sid` 既可能是数字 (网易云) 也可能是字符串 (QQ songmid) , 统一允许两种类型;
 * 持久化 / 序列化时建议转成 `string` 后再比较, 避免 `1 === "1"` 这种问题
 */
export interface SongInfo {
    platform: Platform;
    sid: string | number;
    sname: string;
    sartist: string;
    duration?: number;
    coverUrl?: string;
    albumName?: string;
    /** 播放音质标签 (B 站为后端实测, 网易云/QQ 为请求档位). */
    quality?: string;
}
