import { For, Show, createSignal } from "solid-js";
import { queue } from "@/stores/queue";
import { adminAddSong, playNext } from "@/services/PlayerService";
import styles from "./OrderTable.module.css";

const SOURCE_LABEL: Record<string, string> = {
    danmu: "弹幕",
    sc: "SC",
    admin: "主播",
    idle: "空闲"
};

export function OrderTable() {
    const [keyword, setKeyword] = createSignal("");
    const [adding, setAdding] = createSignal(false);

    const submitAdd = async () => {
        if (adding()) return;
        const k = keyword().trim();
        if (!k) return;
        setAdding(true);
        try {
            await adminAddSong(k);
            setKeyword("");
        } finally {
            setAdding(false);
        }
    };

    return (
        <div class={styles.panel}>
            <div class={styles.head}>
                <div class={styles.title}>点歌列表</div>
                <span class={styles.count}>{queue.orderList().length}</span>
                <div style={{ flex: 1 }} />
                <button class={styles.nextTop} onClick={() => playNext()}>下一首</button>
            </div>
            <div class={styles.searchRow}>
                <input
                    placeholder="手动加歌（关键词 / BV 号，回车提交）"
                    value={keyword()}
                    disabled={adding()}
                    onInput={(e) => setKeyword(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void submitAdd(); }}
                />
                <button class="primary" onClick={() => void submitAdd()} disabled={adding()}>
                    <Show when={adding()} fallback={"加入队列"}>
                        <span class={styles.btnLoading}><span class={styles.spinner} />查找中…</span>
                    </Show>
                </button>
            </div>
            <div class={`${styles.list} scroll-y`}>
                <For each={queue.orderList()} fallback={<div class={styles.empty}>暂无歌曲，等待观众点歌</div>}>
                    {(item, idx) => (
                        <div class={`${styles.row} ${idx() === 0 ? styles.playing : ""}`}>
                            <div class={styles.idx}>
                                <Show when={idx() === 0} fallback={<span>{idx() + 1}</span>}>
                                    <span class={styles.eq}><i /><i /><i /></span>
                                </Show>
                            </div>
                            <div class={styles.main}>
                                <div class={styles.nameLine}>
                                    <span class={`${styles.sourceBadge} ${styles[item.source]}`}>{SOURCE_LABEL[item.source] ?? item.source}</span>
                                    <span class={styles.sname}>{item.song.sname}</span>
                                </div>
                                <div class={styles.subLine}>
                                    <span class={styles.artist}>{item.song.sartist}</span>
                                    <span class={styles.dotSep}>·</span>
                                    <span class={styles.user}>{item.uname}</span>
                                </div>
                            </div>
                            <div class={styles.actions}>
                                <Show when={idx() > 1}>
                                    <button onClick={() => queue.pinToTop(item.id)} title="下一首播放">顶</button>
                                    <button onClick={() => queue.moveTo(item.id, idx() - 1)} title="上移一位">上</button>
                                </Show>
                                <Show when={idx() > 0 && idx() < queue.orderList().length - 1}>
                                    <button onClick={() => queue.moveTo(item.id, idx() + 1)} title="下移一位">下</button>
                                </Show>
                                <Show when={idx() > 0}>
                                    <button class={styles.del} onClick={() => queue.removeById(item.id)} title="删除">删</button>
                                </Show>
                            </div>
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
}
