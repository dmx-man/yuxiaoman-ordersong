/**
 * `/bili-music/*` -- B 站 BV 号点歌音频代理客户端.
 *
 * 只做"瘦"封装: 把 HTTP 调用贴近后端响应; 上层 `services/MusicService`
 * 负责把它适配成统一的 `SongInfo` / 播放 URL 领域形态.
 */

import { ENV } from "@/config/env";
import { api } from "./http";

const url = (path: string) => ENV.BASE_PATH + "/bili-music" + path;

export interface BiliResolveResp {
    code: number;
    message?: string;
    sname?: string;
    sartist?: string;
    duration?: number;
    coverUrl?: string;
    quality?: string;
    bvid?: string;
}

/** 解析 BV 号, 返回视频元数据 (标题 / UP / 时长 / 封面). */
export function resolveBili(bvid: string) {
    return api.get<BiliResolveResp>(url("/resolve"), { params: { bvid }, timeout: 8000 });
}

/** 取 B 站音频流代理地址 (由后端转发, 规避跨域与直链时效). */
export function biliStreamUrl(bvid: string): string {
    return `${ENV.BASE_PATH}/bili-music/stream?bvid=${encodeURIComponent(bvid)}`;
}
