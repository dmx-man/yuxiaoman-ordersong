/**
 * 播放编排 - 当前播放/切歌/预取/歌词/空闲补歌
 *
 */

import { createSignal } from "solid-js";
import { audioPlayer } from "@/infra/audio/AudioPlayer";
import { findActiveLyricIdx, parseLrc, type LyricLine } from "@/domain/lyrics/parser";
import { getMusic, neteaseService } from "@/services/MusicService";
import { tryAddOrder } from "@/services/QueueService";
import { queue } from "@/stores/queue";
import { settings, pushSongListHistory } from "@/stores/settings";
import { session } from "@/stores/session";
import { statsStore } from "@/stores/stats";
import { pushToast } from "@/utils/toast";
import type { OrderItem } from "@/types/order";
import type { SongInfo } from "@/types/song";

const [idleList, setIdleList] = createSignal<OrderItem[]>([]);
const [idleIdx, setIdleIdx] = createSignal<number>(-1);
const [lyrics, setLyrics] = createSignal<LyricLine[]>([]);
const [activeLyricIdx, setActiveLyricIdx] = createSignal<number>(-1);
const [lyricLoading, setLyricLoading] = createSignal<boolean>(false);

export { idleList, idleIdx, lyrics, activeLyricIdx, lyricLoading };

/** 歌词预取缓存: key = platform:sid. */
const lyricPrefetchCache = new Map<string, LyricLine[]>();
/** URL 预取缓存: key = platform:sid. */
const urlPrefetchCache = new Map<string, string>();

let isSwitching = false;
let pendingNext = false;

function shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function cacheKey(item: OrderItem): string {
    return `${item.song.platform}:${item.song.sid}`;
}

function recordPlay(item: OrderItem): void {
    statsStore.push({
        ts: Date.now(),
        uid: item.uid,
        uname: item.uname,
        sid: item.song.sid,
        sname: item.song.sname,
        sartist: item.song.sartist,
        platform: item.song.platform,
        duration: item.song.duration ?? 0,
        source: item.source,
        priority: item.priority,
    });
}

async function fetchLyricLines(item: OrderItem): Promise<LyricLine[]> {
    const raw = await getMusic(item.song.platform).getLyric(item.song.sid);
    return parseLrc(raw);
}

async function loadLyricsFor(item: OrderItem): Promise<void> {
    const k = cacheKey(item);
    const cached = lyricPrefetchCache.get(k);
    if (cached) {
        lyricPrefetchCache.delete(k);
        setActiveLyricIdx(-1);
        setLyrics(cached);
        setLyricLoading(false);
        return;
    }
    setLyrics([]);
    setActiveLyricIdx(-1);
    setLyricLoading(true);
    try {
        const parsed = await fetchLyricLines(item);
        setLyrics(parsed);
    } catch (err) {
        console.warn("[lyrics] 失败:", err);
    } finally {
        setLyricLoading(false);
    }
}

audioPlayer.audio.addEventListener("timeupdate", () => {
    const cur = audioPlayer.audio.currentTime;
    const arr = lyrics();
    if (arr.length) {
        const idx = findActiveLyricIdx(arr, cur);
        if (idx !== activeLyricIdx()) setActiveLyricIdx(idx);
    }
    const overLimit = settings.overLimitSkip();
    if (overLimit > 0 && cur > overLimit) {
        void playNext();
    }
});

audioPlayer.onEnded = () => {
    void playNext();
};
audioPlayer.onError = () => {
    pushToast("播放错误, 6 秒后切换下一首", "warn");
    setTimeout(() => void playNext(), 6000);
};

async function fetchSongUrl(item: OrderItem): Promise<string | null> {
    const k = cacheKey(item);
    if (urlPrefetchCache.has(k)) {
        const cached = urlPrefetchCache.get(k)!;
        urlPrefetchCache.delete(k);
        return cached;
    }
    return getMusic(item.song.platform).getSongUrl(item.song.sid);
}

/** 当前歌曲开始播放后, 异步预取下一首的 URL/歌词/封面*/
function prefetchNext(): void {
    const list = queue.orderList();
    const next = list[1] ?? null;
    if (!next) return;
    const k = cacheKey(next);

    if (!urlPrefetchCache.has(k)) {
        void getMusic(next.song.platform)
            .getSongUrl(next.song.sid)
            .then((url) => {
                if (url) urlPrefetchCache.set(k, url);
            });
    }
    if (!lyricPrefetchCache.has(k)) {
        void fetchLyricLines(next)
            .then((lines) => {
                if (lines.length) lyricPrefetchCache.set(k, lines);
            })
            .catch(() => {
                /* 预取失败无所谓, 切歌时再正常拉 */
            });
    }
    if (!next.song.coverUrl && next.song.platform === "wy") {
        void neteaseService.getSongDetail(next.song.sid).then((d) => {
            if (d?.coverUrl) {
                queue.setOrderList((arr) =>
                    arr.map((it) =>
                        it.id === next.id
                            ? { ...it, song: { ...it.song, coverUrl: d.coverUrl, albumName: d.albumName } }
                            : it
                    )
                );
            }
        });
    }
}

async function ensureCover(item: OrderItem): Promise<void> {
    if (item.song.coverUrl) return;
    if (item.song.platform !== "wy") return;
    const d = await neteaseService.getSongDetail(item.song.sid);
    if (d?.coverUrl) {
        queue.setOrderList((arr) =>
            arr.map((it) =>
                it.id === item.id
                    ? { ...it, song: { ...it.song, coverUrl: d.coverUrl, albumName: d.albumName } }
                    : it
            )
        );
    }
}

async function playItem(item: OrderItem): Promise<void> {
    try {
        const url = await fetchSongUrl(item);
        if (!url) {
            pushToast(`未取到链接: ${item.song.sname} (可能为 VIP 或下架, 跳过)`, "warn");
            isSwitching = false;
            flushPending();
            void playNext();
            return;
        }
        await audioPlayer.load(url);
        recordPlay(item);
        void loadLyricsFor(item);
        void ensureCover(item);
        setTimeout(() => prefetchNext(), 1500);
    } catch (err) {
        console.warn("[player] 加载失败:", err);
    } finally {
        isSwitching = false;
        flushPending();
    }
}

function flushPending(): void {
    if (pendingNext) {
        pendingNext = false;
        void playNext();
    }
}

/** 切到下一首. 队列为空时从空闲歌单循环补歌 */
export async function playNext(): Promise<void> {
    if (isSwitching) {
        pendingNext = true;
        return;
    }
    isSwitching = true;
    audioPlayer.stop();

    if (queue.orderList().length > 0) {
        const cur = queue.orderList()[0];
        queue.removeById(cur.id);
    }
    if (queue.orderList().length > 0) {
        await playItem(queue.orderList()[0]);
        return;
    }

    const idle = idleList();
    if (!idle.length) {
        pushToast("没有下一首了 >_<", "info");
        isSwitching = false;
        flushPending();
        return;
    }
    let next = idleIdx() + 1;
    if (next >= idle.length) {
        const reshuffled = shuffle(idle);
        setIdleList(reshuffled);
        next = 0;
    }
    setIdleIdx(next);
    const idleSong = idleList()[next];
    queue.insertAt(idleSong, 0);
    await playItem(idleSong);
}

/** 队列里有歌但播放器空闲时, 立即开播第一首 */
export function playFirstIfNeeded(): void {
    const arr = queue.orderList();
    if (arr.length > 0 && !audioPlayer.audio.src) {
        void playItem(arr[0]);
    }
}

/**
 * 暂停 / 播放切换的统一入口（底部按钮与全局快捷键共用）。
 * 根据设置中的「淡入淡出」开关决定是否走淡入淡出过渡。
 */
export function togglePlayback(): void {
    const fadeMs = settings.fadeEnabled() ? Math.max(0, settings.fadeDuration()) : 0;
    audioPlayer.toggle(fadeMs);
}

function applyIdleList(songs: SongInfo[]): void {
    const list: OrderItem[] = shuffle(
        songs.map((song) => ({
            id: `idle_${song.sid}`,
            uid: 0,
            uname: "空闲歌单",
            song,
            source: "idle" as const,
            priority: -100,
            addedAt: Date.now(),
        }))
    );
    setIdleList(list);
    setIdleIdx(-1);
}

/** 按 listId 加载空闲歌单 */
export async function loadIdleSongList(listId: string, opts: { silent?: boolean } = {}): Promise<boolean> {
    const toast = (m: string, lv: "info" | "warn" | "error" | "success") => {
        if (!opts.silent) pushToast(m, lv);
    };
    if (!listId) {
        toast("请输入有效歌单 ID", "warn");
        return false;
    }
    const platform = settings.musicPlatform();
    const songs = await getMusic(platform).getSongList(listId);
    if (!songs.length) {
        toast("歌单列表获取失败", "error");
        return false;
    }
    applyIdleList(songs);
    pushSongListHistory({ platform, listId, listName: listId });
    toast(`已加载歌单 (${songs.length} 首)`, "success");
    if (!queue.orderList().length) await playNext();
    return true;
}

/** 网易云"云音乐热歌榜"歌单 id (公开数据, 不需要登录) */
const NETEASE_HOT_LIST = "3778678";
/** QQ 音乐热门排行榜: topid=4 = 热歌榜 */
const QQ_HOT_TOP_ID = "top:4";

/**
 * 按 settings.idleSource + settings.musicPlatform 加载空闲补歌
 *   - playlist: settings.songListId 指定的歌单
 *   - favorite: 当前平台的我喜欢列表
 *   - popular : 当前平台热门歌曲 
 */
export async function loadIdleByCurrentSource(opts: { silent?: boolean } = {}): Promise<void> {
    const src = settings.idleSource();
    const platform = settings.musicPlatform();
    const toast = (msg: string, lv: "info" | "warn" | "error" | "success" = "info") => {
        if (!opts.silent) pushToast(msg, lv);
    };

    if (src === "playlist") {
        const id = settings.songListId();
        if (!id) {
            toast("请先在「歌单 & 平台」里填写空闲歌单 ID", "warn");
            return;
        }
        await loadIdleSongList(id, { silent: opts.silent });
        return;
    }

    if (src === "favorite") {
        if (platform === "wy") {
            const nlogin = session.login().netease;
            if (!nlogin.logged || !nlogin.userId) {
                toast("「我喜欢的」需要先登录网易云", "warn");
                return;
            }
            toast("正在加载网易云「我喜欢的音乐」...", "info");
            const favId = await neteaseService.getFavoritePlaylistId(nlogin.userId);
            if (!favId) {
                toast("没拿到「我喜欢的」歌单 id", "warn");
                return;
            }
            const songs = await neteaseService.getSongList(favId);
            if (!songs.length) {
                toast("「我喜欢的」是空的, 请先在网易云收藏几首", "warn");
                return;
            }
            applyIdleList(songs);
            toast(`已加载网易云「我喜欢的」(${songs.length} 首)`, "success");
            if (!queue.orderList().length) await playNext();
            return;
        }
        const qqlogin = session.login().qq;
        if (!qqlogin.logged) {
            toast("「我喜欢的」需要先登录 QQ 音乐", "warn");
            return;
        }
        toast("正在加载 QQ 音乐「我喜欢」...", "info");
        const favSongs = await qqGetFavorite();
        if (favSongs.length) {
            applyIdleList(favSongs);
            toast(`已加载 QQ「我喜欢」(${favSongs.length} 首)`, "success");
            if (!queue.orderList().length) await playNext();
            return;
        }
        toast("QQ「我喜欢」拿不到 (可能登录已过期), 已自动改用 QQ 热歌榜", "warn");
        const songs = await getMusic("qq").getSongList(QQ_HOT_TOP_ID);
        if (!songs.length) {
            toast("QQ 热歌榜加载失败", "error");
            return;
        }
        applyIdleList(songs);
        toast(`已加载 QQ 热歌榜 (${songs.length} 首)`, "success");
        if (!queue.orderList().length) await playNext();
        return;
    }

    if (src === "popular") {
        toast("正在加载热门歌曲...", "info");
        const songs =
            platform === "wy"
                ? await getMusic("wy").getSongList(NETEASE_HOT_LIST)
                : await getMusic("qq").getSongList(QQ_HOT_TOP_ID);
        if (!songs.length) {
            toast("热门歌曲加载失败", "error");
            return;
        }
        applyIdleList(songs);
        toast(`已加载${platform === "wy" ? "云音乐热歌榜" : "QQ 热歌榜"} (${songs.length} 首)`, "success");
        if (!queue.orderList().length) await playNext();
    }
}

/** 取 QQ「我喜欢」的小工具 (qqService 上的扩展方法) */
async function qqGetFavorite(): Promise<SongInfo[]> {
    const svc = getMusic("qq") as unknown as { getFavoriteSongs?: () => Promise<SongInfo[]> };
    return svc.getFavoriteSongs ? svc.getFavoriteSongs() : [];
}

/** 手动加歌 */
export async function adminAddSong(keyword: string): Promise<void> {
    const kw = keyword.trim();
    let platform = settings.musicPlatform();
    let query = kw;
    // BV 号 (忽略大小写, 形如 BV1CfTQ6uEqk) 直接走 B 站
    if (/^bv[0-9a-z]{10}$/i.test(kw)) {
        platform = "bili";
        query = "BV" + kw.slice(2);
    }
    const song = await getMusic(platform).search(query);
    if (!song) {
        pushToast(`没找到 [${keyword}]`, "warn");
        return;
    }
    const r = tryAddOrder({
        uid: session.adminUid(),
        uname: "主播",
        song,
        source: "danmu",
        isAdmin: true,
    });
    if (r.ok) {
        pushToast(`已加入: ${song.sname}`, "success");
        playFirstIfNeeded();
    }
}
