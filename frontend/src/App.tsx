import { Show, createSignal, createEffect, onMount } from "solid-js";
import { Toast } from "./components/Toast/Toast";
import { NowPlayingBar } from "./components/NowPlayingBar/NowPlayingBar";
import { OrderTable } from "./components/OrderTable/OrderTable";
import { LyricView } from "./components/LyricView/LyricView";
import { SettingsPanel, goToSettingsTab } from "./components/SettingsPanel/SettingsPanel";
import { ThemeColorPicker } from "./components/ThemeColorPicker/ThemeColorPicker";
import { StreamOverlay } from "./components/StreamOverlay/StreamOverlay";
import { ListOverlay } from "./components/ListOverlay/ListOverlay";
import { AudioBridge } from "./components/AudioBridge/AudioBridge";
import { OnboardingModal } from "./components/OnboardingModal/OnboardingModal";
import { ExitChoiceModal } from "./components/ExitChoiceModal/ExitChoiceModal";
import { BiliQrLogin } from "./components/BiliQrLogin/BiliQrLogin";
import { startDanmu } from "./services/DanmuService";
import { loadIdleByCurrentSource, lyrics, activeLyricIdx, lyricLoading } from "./services/PlayerService";
import { settings, reloadSettingsFromStorage } from "./stores/settings";
import { session, loadWyCookie, loadQqCookie, loadBiliCookie, reloadSessionFromStorage } from "./stores/session";
import { biliPassportService } from "./services/AuthService";
import { hydrateFromSharedConfig } from "./infra/storage/shared";
import { neteaseService, qqService } from "./services/MusicService";
import { danmuStatus, danmuNeedCode, type DanmuStatus } from "./infra/danmu/status";
import { queue } from "./stores/queue";
import { liveNotice } from "./stores/notice";
import { audioPlayer } from "./infra/audio/AudioPlayer";
import { startLiveStatePush, startLiveStatePoll, type LiveStateSnapshot } from "./stores/liveState";
import { initGlobalShortcut } from "./infra/globalShortcut";
import { ENV } from "./config/env";
import { APP_VERSION } from "@/version";
import { pushToast } from "./utils/toast";
import { applyAccentColor } from "./utils/accent";
import { isTauri } from "@/infra/tauri/invoke";
import styles from "./App.module.css";

/** 主程序: 把当前播放快照拼装出来推给后端, 供 OBS 浏览器源同步 */
function buildLiveSnapshot(): LiveStateSnapshot {
    const cur = queue.orderList()[0] ?? null;
    const n = liveNotice();
    // audio.src 在 stop() 后被 removeAttribute 清空, 但拿到的字符串会被解析成当前页, 这里过滤掉
    const rawSrc = audioPlayer.audio.src || "";
    const nowUrl = rawSrc && rawSrc !== window.location.href ? rawSrc : null;
    return {
        now: cur
            ? {
                  sname: cur.song.sname,
                  sartist: cur.song.sartist,
                  platform: cur.song.platform,
                  coverUrl: cur.song.coverUrl,
                  uname: cur.uname
              }
            : null,
        lyrics: lyrics(),
        lyricsLoading: lyricLoading(),
        activeIdx: activeLyricIdx(),
        currentTime: audioPlayer.currentTime(),
        duration: audioPlayer.duration(),
        playing: audioPlayer.playing(),
        queue: queue.orderList().slice(1, 51).map((it) => ({
            sname: it.song.sname,
            sartist: it.song.sartist,
            uname: it.uname,
            platform: it.song.platform,
            quality: it.song.quality
        })),
        notice: n ? { text: n.text, level: n.level } : null,
        nowUrl,
        fadeEnabled: settings.fadeEnabled(),
        fadeDuration: settings.fadeDuration(),
        accentColor: settings.accentColor(),
        theme: settings.theme(),
        t: Date.now()
    };
}

const STATUS_TEXT: Record<DanmuStatus, string> = {
    idle: "弹幕未连接",
    connecting: "连接中…",
    connected: "弹幕已连接",
    reconnecting: "重连中…",
    failed: "连接失败"
};
const STATUS_CLASS: Record<DanmuStatus, string> = {
    idle: styles.dotIdle,
    connecting: styles.dotWarn,
    connected: styles.dotOk,
    reconnecting: styles.dotWarn,
    failed: styles.dotErr
};

function DanmuBadge() {
    return (
        <div class={styles.danmuBadge} title="哔哩哔哩弹幕连接状态">
            <span class={`${styles.statusDot} ${STATUS_CLASS[danmuStatus()]}`} />
            {STATUS_TEXT[danmuStatus()]}
        </div>
    );
}

/**
 * 启动时根据本地加密 cookie 恢复登录态
 */
async function restoreLogin() {
    session.setRestoring(true);
    try {
        const wy = await loadWyCookie();
        if (wy) {
            try {
                const info = (await neteaseService.getUserAccount(wy)) as {
                    profile?: { userId?: number; nickname?: string; avatarUrl?: string; vipType?: number };
                } | null;
                if (info?.profile) {
                    session.setLogin({
                        ...session.login(),
                        netease: {
                            logged: true,
                            userId: info.profile.userId,
                            nickname: info.profile.nickname,
                            avatar: info.profile.avatarUrl,
                            vipType: info.profile.vipType
                        }
                    });
                }
            } catch (_) { /* cookie expired, leave logged=false */ }
        }
        const qq = await loadQqCookie();
        if (qq) {
            session.setLogin({ ...session.login(), qq: { logged: true } });
            void qqService.setCookie(qq);
        }
        const bili = await loadBiliCookie();
        if (bili) {
            void biliPassportService.setCookie(bili);
        }
    } finally {
        session.setRestoring(false);
    }
}

export function App() {
    const [showSettings, setShowSettings] = createSignal(true);
    const [onboardingDismissed, setOnboardingDismissed] = createSignal(false);
    const [booted, setBooted] = createSignal(false);
    const [showExitChoice, setShowExitChoice] = createSignal(false);

    createEffect(() => {
        document.body.classList.toggle("theme-light", settings.theme() === "light");
    });

    // 自定义主题强调色: 变化时实时写入根节点 CSS 变量
    createEffect(() => {
        applyAccentColor(settings.accentColor());
    });

    createEffect(() => {
        if (danmuNeedCode()) setOnboardingDismissed(false);
    });

    // 叠加层 (OBS 浏览器源等独立 web 视图): 不依赖主程序 live-state 实时推送,
    // 启动时直接从共享配置拉取主题色/主题, 保证即使主程序尚未推送也能显示客户端设置的主题色
    createEffect(() => {
        const v = ENV.VIEW;
        if (v === "lyrics" || v === "stream" || v === "list" || v === "audio") {
            void hydrateFromSharedConfig().then(() => reloadSettingsFromStorage());
        }
    });

    onMount(async () => {
        // 系统级全局快捷键（窗口失焦 / 最小化也能触发）：注册并随设置变化自动同步
        initGlobalShortcut();

        if (ENV.VIEW === "lyrics" || ENV.VIEW === "stream" || ENV.VIEW === "list" || ENV.VIEW === "audio") return;
        await hydrateFromSharedConfig();
        reloadSettingsFromStorage();
        // 恢复上次保存的音量 (否则每次打开都回到最大)
        audioPlayer.setVolume(settings.volume());
        reloadSessionFromStorage();
        setBooted(true);

        await restoreLogin();
        void loadIdleByCurrentSource({ silent: true });

        const mode = settings.danmuMode();
        if (mode === "room") {
            if (!settings.roomId().trim() && session.biliUser()?.uname) {
                const r = await biliPassportService.fetchMyRoomId();
                if (r.code === 0 && r.room_id) settings.setRoomId(String(r.room_id));
            }
            if (settings.roomId().trim()) {
                void startDanmu();
            }
        } else {
            if (ENV.ANCHOR_CODE || settings.anchorCode()) {
                void startDanmu();
            }
        }

        startLiveStatePush(buildLiveSnapshot);

        // 监听 Rust 发出的"请求选择退出方式"事件（点关闭按钮时触发）
        if (isTauri()) {
            import("@tauri-apps/api/event").then(({ listen, emit }) => {
                listen<unknown>("request-exit-choice", () => {
                    const m = settings.closeMethod();
                    // 已记住选择: 直接执行对应退出方式, 不再弹窗
                    if (m === "minimize") {
                        void emit("exit-choice-minimize");
                    } else if (m === "quit") {
                        void emit("exit-choice-quit");
                    } else {
                        // 询问(默认): 弹出选择框
                        setShowExitChoice(true);
                    }
                }).catch(() => {});
            });
        }
    });

    if (ENV.VIEW === "lyrics") {
        startLiveStatePoll();
        return (
            <div class={styles.lyricsOnly}>
                <Toast />
                <LyricView obs />
            </div>
        );
    }

    if (ENV.VIEW === "stream") {
        startLiveStatePoll();
        return (
            <div class={styles.streamView}>
                <Toast />
                <StreamOverlay />
            </div>
        );
    }

    if (ENV.VIEW === "list") {
        startLiveStatePoll();
        return (
            <>
                <Toast />
                <ListOverlay />
            </>
        );
    }

    if (ENV.VIEW === "audio") {
        // 更高频轮询, 让换源 / 播停感知更及时
        startLiveStatePoll(300);
        return <AudioBridge />;
    }

    const hasCode = () => !!(ENV.ANCHOR_CODE || settings.anchorCode());
    // 身份码引导仅在"开放平台(身份码)模式"下出现; 房间号模式不需要身份码
    const showOnboarding = () =>
        booted()
        && settings.danmuMode() === "open"
        && (!hasCode() || danmuNeedCode())
        && !onboardingDismissed();
    // 房间号模式: 没登录 B 站且没房间号
    const showRoomLogin = () =>
        booted()
        && settings.danmuMode() === "room"
        && !settings.roomId().trim()
        && !session.biliUser()?.uname
        && !onboardingDismissed();
    // 登录成功后: 自动取房间号并连接
    const onRoomLoginSuccess = async () => {
        const r = await biliPassportService.fetchMyRoomId();
        if (r.code === 0 && r.room_id) {
            settings.setRoomId(String(r.room_id));
            void startDanmu();
        } else {
            pushToast(r.message || "未自动获取到房间号，请在「设置 → 弹幕」手动填写", "warn", 8000);
        }
    };
    const needConfig = () =>
        settings.danmuMode() === "room" ? !settings.roomId().trim() : (!hasCode() || danmuNeedCode());

    const jumpToDanmuSetting = () => {
        setShowSettings(true);
        goToSettingsTab("danmu");
    };

    return (
        <div class={styles.app}>
            <Toast />
            <Show when={showOnboarding()}>
                <OnboardingModal onClose={() => setOnboardingDismissed(true)} />
            </Show>
            <Show when={showExitChoice()}>
                <ExitChoiceModal onClose={() => setShowExitChoice(false)} />
            </Show>
            <Show when={showRoomLogin()}>
                <BiliQrLogin
                    onClose={() => setOnboardingDismissed(true)}
                    onSuccess={() => void onRoomLoginSuccess()}
                />
            </Show>
            <div class={styles.header}>
                <div class={styles.brand}>
                    <img class={styles.logo} src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
                    <span class={styles.brandName}>鱼小曼点歌助手</span>
                    <small>v{APP_VERSION}</small>
                </div>
                <DanmuBadge />
                <Show when={needConfig()}>
                    <button class={styles.warnPill} onClick={jumpToDanmuSetting} title="点击跳转到设置 → 弹幕">
                        {settings.danmuMode() === "room"
                            ? "未配置房间号 · 点此设置"
                            : (danmuNeedCode() ? "身份码已失效 · 点此更新" : "未配置身份码 · 点此设置")}
                    </button>
                </Show>
                <div class={styles.spacer} />
                <ThemeColorPicker />
                <button
                    class={styles.headerBtn}
                    onClick={() => settings.setTheme(settings.theme() === "dark" ? "light" : "dark")}
                    title="切换日间 / 夜间主题"
                >
                    {settings.theme() === "dark" ? "日间模式" : "夜间模式"}
                </button>
                <button class={styles.headerBtn} onClick={() => settings.setShowLyrics(!settings.showLyrics())}>
                    {settings.showLyrics() ? "隐藏歌词" : "显示歌词"}
                </button>
                <button class={styles.headerBtn} onClick={() => setShowSettings((v) => !v)}>
                    {showSettings() ? "隐藏设置" : "显示设置"}
                </button>
            </div>
            <div class={styles.body}>
                <div class={styles.left}>
                    <NowPlayingBar />
                    <OrderTable />
                </div>
                <div class={styles.right}>
                    <Show when={settings.showLyrics()}>
                        <LyricView />
                    </Show>
                    <Show when={showSettings()}>
                        <SettingsPanel />
                    </Show>
                </div>
            </div>
        </div>
    );
}
