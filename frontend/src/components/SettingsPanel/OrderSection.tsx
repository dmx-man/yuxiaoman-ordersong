import { For, Show, createSignal } from "solid-js";
import { settings, type IdleSource } from "@/stores/settings";
import { session } from "@/stores/session";
import { loadIdleSongList, loadIdleByCurrentSource } from "@/services/PlayerService";
import styles from "./SettingsPanel.module.css";
import type { Platform } from "@/types";

export function OrderSection() {
    const [selectedUserBlack, setSelectedUserBlack] = createSignal<string | null>(null);
    const [selectedSongBlack, setSelectedSongBlack] = createSignal<string | null>(null);
    const [selectedUserHistory, setSelectedUserHistory] = createSignal<string | null>(null);
    const [selectedSongHistory, setSelectedSongHistory] = createSignal<string | null>(null);

    return (
        <>
            <div class={styles.section}>
                <h3>歌单 & 平台</h3>
                <div class={styles.row}>
                    <label>音乐平台</label>
                    <select
                        value={settings.musicPlatform()}
                        onChange={(e) => {
                            settings.setMusicPlatform(e.currentTarget.value as Platform);
                            // 切换平台后立即按新平台重新加载空闲歌单
                            void loadIdleByCurrentSource();
                        }}
                    >
                        <option value="wy">网易云音乐</option>
                        <option value="qq">QQ 音乐</option>
                        <option value="bili">B站 (BV 号)</option>
                    </select>
                    <span />
                </div>
                <div class={styles.row}>
                    <label>音质</label>
                    <select
                        value={settings.audioQuality()}
                        onChange={(e) => settings.setAudioQuality(e.currentTarget.value)}
                    >
                        <option value="standard">标准 128k</option>
                        <option value="exhigh">极高 320k</option>
                        <option value="lossless">无损 FLAC</option>
                        <option value="hires">Hi-Res（最高）</option>
                    </select>
                    <span />
                </div>
                <div class={styles.row}>
                    <label />
                    <div style={{ "font-size": "12px", color: "var(--text-2)", "line-height": "1.6" }}>
                        网易云 / QQ 音乐通用。<b>无损 / Hi-Res</b> 需黑胶 VIP（网易云）或绿钻豪华版（QQ）；非会员会自动降级到可用音质。
                    </div>
                    <span />
                </div>
                <div class={styles.row}>
                    <label>队列播完后</label>
                    <select
                        value={settings.idleSource()}
                        onChange={(e) => {
                            const v = e.currentTarget.value as IdleSource;
                            settings.setIdleSource(v);
                            // 切换源后立刻按新源重新加载, 不用等到下一首
                            void loadIdleByCurrentSource();
                        }}
                    >
                        <option value="playlist">自定义歌单</option>
                        <option value="favorite">我喜欢的</option>
                        <option value="popular">热门歌曲</option>
                    </select>
                    <button onClick={() => loadIdleByCurrentSource()} title="按当前平台 + 来源立即刷新空闲歌单">刷新</button>
                </div>

                <Show when={settings.idleSource() === "playlist"}>
                    <div class={styles.row}>
                        <label>空闲歌单 ID</label>
                        <input
                            type="text"
                            value={settings.songListId()}
                            onInput={(e) => settings.setSongListId(e.currentTarget.value)}
                            placeholder="例如 7294328248"
                        />
                        <button class="primary" onClick={() => loadIdleSongList(settings.songListId())}>加载</button>
                    </div>
                    <div class={styles.row}>
                        <label />
                        <div style={{ "font-size": "12px", color: "var(--text-2)", "line-height": "1.6" }}>
                            从网易云任意歌单页 URL 里复制 <code>?id=</code> 后面的数字。例如 <br />
                            <code style={{ "word-break": "break-all" }}>music.163.com/#/playlist?id=<b>7294328248</b></code>
                        </div>
                        <span />
                    </div>
                    <div class={styles.row}>
                        <label>历史歌单</label>
                        <select onChange={(e) => settings.setSongListId(e.currentTarget.value)}>
                            <option value="">— 选择 —</option>
                            <For each={settings.songListHistory().filter((x) => x.platform === settings.musicPlatform())}>
                                {(h) => <option value={h.listId}>{h.listName}</option>}
                            </For>
                        </select>
                        <span />
                    </div>
                </Show>

                <Show when={settings.idleSource() === "favorite"}>
                    <div class={styles.row}>
                        <label />
                        <div style={{ "font-size": "12px", color: "var(--text-2)", "line-height": "1.6" }}>
                            {settings.musicPlatform() === "wy"
                                ? (session.login().netease.logged
                                    ? "自动加载你的网易云「我喜欢的音乐」，用作直播间空闲补歌。"
                                    : "未登录网易云。请先到「登录」面板登录后再选这一项。")
                                : (session.login().qq.logged
                                    ? "自动加载你的我喜欢歌单，用作直播间空闲补歌。"
                                    : "未登录 QQ 音乐。请先到「登录」面板登录后再选这一项；失败时会自动回退到 QQ 热歌榜。")}
                        </div>
                        <span />
                    </div>
                </Show>

                <Show when={settings.idleSource() === "popular"}>
                    <div class={styles.row}>
                        <label />
                        <div style={{ "font-size": "12px", color: "var(--text-2)", "line-height": "1.6" }}>
                            {settings.musicPlatform() === "wy"
                                ? "使用网易「云音乐热歌榜」，公开数据不需要登录，每天自动更新。"
                                : "使用 QQ 音乐「热歌榜」（topid=4），公开数据不需要登录。"}
                        </div>
                        <span />
                    </div>
                </Show>
            </div>

            <div class={styles.section}>
                <h3>点歌规则</h3>
                <div class={styles.row}>
                    <label>用户点歌数</label>
                    <input type="number" min="1" value={settings.userMaxOrder()} onInput={(e) => settings.setUserMaxOrder(+e.currentTarget.value || 1)} />
                    <span />
                </div>
                <div class={styles.row}>
                    <label>最大点歌数</label>
                    <input type="number" min="1" value={settings.globalMaxOrder()} onInput={(e) => settings.setGlobalMaxOrder(+e.currentTarget.value || 1)} />
                    <span />
                </div>
                <div class={styles.row}>
                    <label>歌曲时长上限(秒)</label>
                    <input type="number" min="0" value={settings.orderMaxDuration()} onInput={(e) => settings.setOrderMaxDuration(+e.currentTarget.value || 0)} />
                    <span />
                </div>
                <div class={styles.row}>
                    <label>超时切歌(秒)</label>
                    <input type="number" min="0" value={settings.overLimitSkip()} onInput={(e) => settings.setOverLimitSkip(+e.currentTarget.value || 0)} />
                    <span />
                </div>
                <div class={styles.row}>
                    <label>点歌冷却(秒)</label>
                    <input type="number" min="0" value={settings.cooldownSec()} onInput={(e) => settings.setCooldownSec(+e.currentTarget.value || 0)} />
                    <span />
                </div>
                <div class={styles.row}>
                    <label>触发词</label>
                    <input
                        type="text"
                        value={settings.triggerWords().join(",")}
                        onChange={(e) => settings.setTriggerWords(e.currentTarget.value.split(/[,，\s]+/).filter(Boolean))}
                    />
                    <span />
                </div>
                <div class={styles.row}>
                    <label>显示歌词</label>
                    <input type="checkbox" checked={settings.showLyrics()} onChange={(e) => settings.setShowLyrics(e.currentTarget.checked)} />
                    <span />
                </div>
            </div>

            <div class={styles.section}>
                <h3>用户黑名单</h3>
                <div class={styles.row}>
                    <label>历史点歌用户</label>
                    <div class={styles.miniList}>
                        <Show
                            when={session.userHistory().length > 0}
                            fallback={<div class={styles.miniEmpty}>暂无历史</div>}
                        >
                            <For each={session.userHistory()}>{(u) => (
                                <div
                                    class={`${styles.miniItem} ${selectedUserHistory() === String(u.uid) ? styles.selected : ""}`}
                                    onClick={() => setSelectedUserHistory(String(u.uid))}
                                >
                                    <span>{u.uname}</span>
                                </div>
                            )}</For>
                        </Show>
                    </div>
                    <button onClick={() => {
                        const sel = selectedUserHistory();
                        if (!sel) return;
                        const u = session.userHistory().find((x) => String(x.uid) === sel);
                        if (u) session.addUserBlack(u);
                    }}>加入黑名单</button>
                </div>

                <div class={styles.row}>
                    <label>用户黑名单</label>
                    <div class={styles.miniList}>
                        <Show
                            when={session.userBlackList().length > 0}
                            fallback={<div class={styles.miniEmpty}>暂无黑名单用户</div>}
                        >
                            <For each={session.userBlackList()}>{(u) => (
                                <div
                                    class={`${styles.miniItem} ${selectedUserBlack() === String(u.uid) ? styles.selected : ""}`}
                                    onClick={() => setSelectedUserBlack(String(u.uid))}
                                >
                                    <span>{u.uname}</span>
                                </div>
                            )}</For>
                        </Show>
                    </div>
                    <button onClick={() => {
                        const sel = selectedUserBlack();
                        if (sel) session.removeUserBlack(sel);
                    }}>移除</button>
                </div>
            </div>

            <div class={styles.section}>
                <h3>歌曲黑名单</h3>
                <div class={styles.row}>
                    <label>历史点歌歌曲</label>
                    <div class={styles.miniList}>
                        <Show
                            when={session.songHistory().length > 0}
                            fallback={<div class={styles.miniEmpty}>暂无历史</div>}
                        >
                            <For each={session.songHistory()}>{(s) => (
                                <div
                                    class={`${styles.miniItem} ${selectedSongHistory() === String(s.sid) ? styles.selected : ""}`}
                                    onClick={() => setSelectedSongHistory(String(s.sid))}
                                >
                                    <span>{s.sname}</span>
                                </div>
                            )}</For>
                        </Show>
                    </div>
                    <button onClick={() => {
                        const sel = selectedSongHistory();
                        if (!sel) return;
                        const s = session.songHistory().find((x) => String(x.sid) === sel);
                        if (s) session.addSongBlack(s);
                    }}>加入黑名单</button>
                </div>

                <div class={styles.row}>
                    <label>歌曲黑名单</label>
                    <div class={styles.miniList}>
                        <Show
                            when={session.songBlackList().length > 0}
                            fallback={<div class={styles.miniEmpty}>暂无黑名单歌曲</div>}
                        >
                            <For each={session.songBlackList()}>{(s) => (
                                <div
                                    class={`${styles.miniItem} ${selectedSongBlack() === String(s.sid) ? styles.selected : ""}`}
                                    onClick={() => setSelectedSongBlack(String(s.sid))}
                                >
                                    <span>{s.sname}</span>
                                </div>
                            )}</For>
                        </Show>
                    </div>
                    <button onClick={() => {
                        const sel = selectedSongBlack();
                        if (sel) session.removeSongBlack(sel);
                    }}>移除</button>
                </div>
            </div>
        </>
    );
}
