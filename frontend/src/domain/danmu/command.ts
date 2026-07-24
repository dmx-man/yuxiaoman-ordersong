/**
 * 弹幕命令解析 (纯函数) .
 *
 * 当前支持的命令:
 * - `<触发词> <关键词>` 点歌: 触发词由 settings 配置; 关键词可在开头再带 `wy`/`qq` 指定平台.
 * - `切歌` 切到下一首 (权限校验在调用层) .
 * - `暂停` / `播放` 播放控制 (仅主播) .
 */

import type { Platform } from "@/types/song";

const PLATFORM_PREFIXES = ["wy", "qq"] as const;

/** 解析"点歌命令"的结果. */
export interface OrderCommand {
    /** 是否命中了某个触发词. */
    matched: boolean;
    /** 去掉触发词与平台前缀后的搜索关键词. */
    keyword?: string;
    /** 用户显式指定的平台 (未指定时由调用方使用默认值) . */
    platform?: Platform;
}

/** 解析"切歌 / 暂停 / 播放"等控制命令的类型. */
export type ControlCommand = "skip" | "pause" | "play" | null;

/**
 * 用配置的触发词集合解析一条弹幕文本.
 *
 * @returns `matched=true` 表示是点歌命令; 为 false 时调用方应继续判断它是不是控制命令.
 */
export function parseOrderCommand(text: string, triggerWords: readonly string[]): OrderCommand {
    const trimmed = text.trim();
    if (!trimmed) return { matched: false };

    for (const tw of triggerWords) {
        if (trimmed.startsWith(tw)) {
            const keywordRaw = trimmed.slice(tw.length).trim();
            // BV 号 (忽略大小写, 形如 BV1eN4y1w73u) 直接识别为 B 站视频
            if (/^bv[0-9a-z]{10}$/i.test(keywordRaw)) {
                return {
                    matched: true,
                    keyword: "BV" + keywordRaw.slice(2),
                    platform: "bili",
                };
            }
            let keyword = keywordRaw;
            let platform: Platform | undefined;
            const head = keyword.slice(0, 2).toLowerCase();
            if ((PLATFORM_PREFIXES as readonly string[]).includes(head)) {
                platform = head as Platform;
                keyword = keyword.slice(2).trim();
            }
            return { matched: true, keyword, platform };
        }
    }
    return { matched: false };
}

/** 解析控制命令 (切歌 / 暂停 / 播放) . 返回 `null` 表示不是控制命令. */
export function parseControlCommand(text: string): ControlCommand {
    const t = text.trim();
    if (t === "切歌") return "skip";
    if (t === "暂停") return "pause";
    if (t === "播放") return "play";
    return null;
}
