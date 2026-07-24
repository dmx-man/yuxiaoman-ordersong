/**
 * 音乐平台服务
 *
 * 上层 (PlayerService / IdleListService) 只依赖 MusicService 接口, 
 * 不关心网易云 weapi 与 QQ musicu.fcg 的字段差异
 */

import { neteaseApi } from "@/api/netease";
import { qqApi } from "@/api/qq";
import { resolveBili, biliStreamUrl } from "@/api/biliMusic";
import { loadWyCookie } from "@/stores/session";
import { settings } from "@/stores/settings";
import type { Platform, SongInfo } from "@/types/song";

/** 各平台音乐服务的统一接口. */
export interface MusicService {
    platform: Platform;
    /** 搜索关键词, 返回首条命中. */
    search(keyword: string): Promise<SongInfo | null>;
    /** 多候选搜索. */
    searchMulti(keyword: string, limit?: number): Promise<SongInfo[]>;
    /** 取歌曲播放 URL (后端含音质降级链). */
    getSongUrl(sid: string | number): Promise<string | null>;
    /** 取歌单全部歌曲. */
    getSongList(listId: string): Promise<SongInfo[]>;
    /** 取歌词 (LRC 文本). */
    getLyric(sid: string | number): Promise<string | null>;
}

/** 根据 QQ albummid 拼 300x300 封面 URL. */
function qqCoverUrl(albummid?: string): string | undefined {
    if (!albummid) return undefined;
    return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg`;
}

/** 将统一音质档映射为人类可读标签 (网易云 / QQ 通用, 实际可能因会员降级). */
function requestedQualityLabel(): string {
    switch (settings.audioQuality()) {
        case "standard": return "标准";
        case "exhigh": return "极高";
        case "lossless": return "无损";
        case "hires": return "Hi-Res";
        default: return "极高";
    }
}

/** 网易云音乐服务. */
export const neteaseService: MusicService & {
    getSongDetail(sid: string | number): Promise<Partial<SongInfo> | null>;
    getQrKey(): Promise<string | null>;
    getQrPicture(unikey: string): Promise<string | null>;
    checkQrStatus(unikey: string): Promise<{ code: number; message?: string; cookie?: string } | null>;
    getUserAccount(cookie?: string): Promise<unknown>;
    getFavoritePlaylistId(uid: string | number): Promise<string | null>;
} = {
    platform: "wy",

    async search(keyword) {
        const list = await neteaseService.searchMulti(keyword, 1);
        return list[0] ?? null;
    },

    async searchMulti(keyword, limit = 10) {
        const cookie = await loadWyCookie();
        try {
            const { data } = await neteaseApi.cloudsearch({ keywords: keyword, limit, type: 1, cookie });
            const songs = data.result?.songs ?? [];
            return songs.map((s) => ({
                platform: "wy" as const,
                sid: s.id,
                sname: s.name,
                sartist: (s.ar?.[0]?.name ?? s.artists?.[0]?.name) || "",
                duration: (s.dt ?? s.duration ?? 0) / 1000,
                coverUrl: s.al?.picUrl || s.album?.picUrl || undefined,
                albumName: s.al?.name || s.album?.name || undefined,
                quality: requestedQualityLabel(),
            }));
        } catch (err) {
            console.warn("[wy] 搜索失败:", err);
            return [];
        }
    },

    async getSongDetail(sid) {
        const cookie = await loadWyCookie();
        try {
            const { data } = await neteaseApi.songDetail({ ids: sid, cookie });
            const s = data.songs?.[0];
            if (!s) return null;
            return { coverUrl: s.al?.picUrl, albumName: s.al?.name };
        } catch (err) {
            console.warn("[wy] song/detail 失败:", err);
            return null;
        }
    },

    async getSongUrl(sid) {
        const cookie = await loadWyCookie();
        try {
            const { data } = await neteaseApi.songUrl({
                id: sid,
                level: settings.audioQuality() || "exhigh",
                cookie,
            });
            if (data?.data?.[0]?.url) return data.data[0].url;
        } catch (err) {
            console.warn("[wy] 取 URL 失败:", err);
        }
        return null;
    },

    async getSongList(listId) {
        const cookie = await loadWyCookie();
        try {
            const { data } = await neteaseApi.playlistTrackAll({ id: listId, cookie });
            return (data.songs ?? []).map((s) => ({
                platform: "wy" as const,
                sid: s.id,
                sname: s.name,
                sartist: s.ar[0]?.name ?? "",
                duration: (s.dt ?? 0) / 1000,
                coverUrl: s.al?.picUrl,
                albumName: s.al?.name,
            }));
        } catch (err) {
            console.warn("[wy] 取歌单失败:", err);
            return [];
        }
    },

    async getLyric(sid) {
        try {
            const { data } = await neteaseApi.lyric(sid);
            return data.lrc?.lyric ?? null;
        } catch (err) {
            console.warn("[wy] 取歌词失败:", err);
            return null;
        }
    },

    async getQrKey() {
        try {
            const { data } = await neteaseApi.qrKey();
            return data.data?.unikey ?? null;
        } catch (err) {
            console.warn("[wy] 取二维码 key 失败:", err);
            return null;
        }
    },

    async getQrPicture(unikey) {
        try {
            const { data } = await neteaseApi.qrCreate(unikey);
            return data.data?.qrimg ?? null;
        } catch (err) {
            console.warn("[wy] 取二维码图片失败:", err);
            return null;
        }
    },

    async checkQrStatus(unikey) {
        try {
            const { data } = await neteaseApi.qrCheck(unikey);
            return data;
        } catch (err) {
            console.warn("[wy] 取二维码状态失败:", err);
            return null;
        }
    },

    async getUserAccount(cookie) {
        try {
            const { data } = await neteaseApi.userAccount(cookie);
            return data;
        } catch (err) {
            console.warn("[wy] 取用户信息失败:", err);
            return null;
        }
    },

    async getFavoritePlaylistId(uid) {
        const cookie = await loadWyCookie();
        try {
            const { data } = await neteaseApi.userPlaylist(uid, cookie);
            const lists = data.playlist ?? [];
            const fav = lists.find((p) => String(p.userId ?? "") === String(uid)) ?? lists[0];
            return fav ? String(fav.id) : null;
        } catch (err) {
            console.warn("[wy] 取用户歌单失败:", err);
            return null;
        }
    },
};

/** QQ 音乐服务. */
export const qqService: MusicService & {
    setCookie(cookie: string): Promise<boolean>;
    getFavoriteSongs(): Promise<SongInfo[]>;
} = {
    platform: "qq",

    async search(keyword) {
        const list = await qqService.searchMulti(keyword, 1);
        return list[0] ?? null;
    },

    async searchMulti(keyword, limit = 5) {
        try {
            const { data } = await qqApi.search({ key: keyword, pageSize: limit, pageNo: 1 });
            const list = data.data?.list ?? [];
            return list.map((s) => ({
                platform: "qq" as const,
                sid: s.songmid,
                sname: s.songname,
                sartist: s.singer[0]?.name ?? "",
                duration: s.interval,
                coverUrl: qqCoverUrl(s.albummid),
                quality: requestedQualityLabel(),
            }));
        } catch (err) {
            console.warn("[qq] 搜索失败:", err);
            return [];
        }
    },

    async getSongUrl(sid) {
        try {
            const requested = settings.audioQuality() || "exhigh";
            const { data } = await qqApi.songUrl({ id: sid, level: requested });
            if (data.result === 100) {
                if (typeof data.data === "string") return data.data;
                const k = Object.keys(data.data)[0];
                return data.data[k] ?? null;
            }
        } catch (err) {
            console.warn("[qq] 取 URL 失败:", err);
        }
        return null;
    },

    async getSongList(listId) {
        if (!listId) return [];
        if (listId.startsWith("top:")) {
            const topid = parseInt(listId.slice(4), 10) || 4;
            try {
                const { data } = await qqApi.toplist({ topid, num: 100 });
                const list = data.data?.list ?? [];
                return list.map((s) => ({
                    platform: "qq" as const,
                    sid: s.songmid,
                    sname: s.songname,
                    sartist: s.singer[0]?.name ?? "",
                    duration: s.interval,
                    coverUrl: qqCoverUrl(s.albummid),
                }));
            } catch (err) {
                console.warn("[qq] 取排行榜失败:", err);
                return [];
            }
        }
        // TODO(qq): 自定义 disstid 歌单加载需要额外接口, 暂仅支持 top:<id>
        return [];
    },

    async getLyric(sid) {
        try {
            const { data } = await qqApi.lyric(sid);
            return data.lyric || null;
        } catch (err) {
            console.warn("[qq] 取歌词失败:", err);
            return null;
        }
    },

    async setCookie(cookie) {
        try {
            await qqApi.setCookie(cookie);
            return true;
        } catch (err) {
            console.warn("[qq] 设置 cookie 失败:", err);
            return false;
        }
    },

    async getFavoriteSongs() {
        try {
            const { data } = await qqApi.favorite();
            const list = data.data?.list ?? [];
            return list.map((s) => ({
                platform: "qq" as const,
                sid: s.songmid,
                sname: s.songname,
                sartist: s.singer[0]?.name ?? "",
                duration: s.interval,
                coverUrl: qqCoverUrl(s.albummid),
                quality: requestedQualityLabel(),
            }));
        } catch (err) {
            console.warn("[qq] 取「我喜欢」失败:", err);
            return [];
        }
    },
};

/** B 站 BV 号点歌服务. */
export const biliService: MusicService = {
    platform: "bili",

    async search(keyword) {
        const list = await biliService.searchMulti(keyword, 1);
        return list[0] ?? null;
    },

    async searchMulti(keyword, limit = 1) {
        try {
            const { data } = await resolveBili(keyword);
            if (data?.code !== 0 || !data?.sname) return [];
            const song: SongInfo = {
                platform: "bili",
                sid: keyword,
                sname: data.sname,
                sartist: data.sartist ?? "",
                duration: data.duration,
                coverUrl: data.coverUrl,
                albumName: "B站",
                quality: data.quality,
            };
            return limit >= 1 ? [song] : [];
        } catch (err) {
            console.warn("[bili] 解析失败:", err);
            return [];
        }
    },

    async getSongUrl(sid) {
        return biliStreamUrl(String(sid));
    },

    async getSongList() {
        return [];
    },

    async getLyric() {
        return null;
    },
};

const registry: Record<Platform, MusicService> = {
    wy: neteaseService,
    qq: qqService,
    bili: biliService,
};

/** 支持的音乐平台列表. */
export const PLATFORMS: Platform[] = ["wy", "qq", "bili"];

/** 按平台 key 取对应服务, 非法 key 回退网易云. */
export function getMusic(p?: Platform | string | null): MusicService {
    if (p === "wy" || p === "qq" || p === "bili") return registry[p];
    return registry.wy;
}
