/**
 * 编译/运行时配置
 *
 * BASE_PATH 与后端 webapi.js 保持一致; 可被 URL 参数 ?base=/foo 覆盖 (用于多实例反代)
 */

const params = new URLSearchParams(window.location.search);

export const ENV = {
    BASE_PATH: (params.get("base") || "/order").replace(/\/$/, "") || "",
    BILI_API: "/bili-api",
    NETEASE_API: "/netease_api",
    QQ_API: params.get("qq_api") || "/qq-api",
    ANCHOR_CODE: (params.get("code") || params.get("CODE") || "").trim(),
    APP_ID: parseInt(params.get("app_id") || "0", 10) || 0,
    VIEW: (params.get("view") || "full").toLowerCase() as "full" | "lyrics" | "stream" | "list" | "audio" | "compact",
    // OBS 直播叠加层显隐开关 (URL 控制); 仅 =0 时隐藏, 缺省/其他值(如 1)均显示
    SHOW_CARD: params.get("showCard") !== "0",
    SHOW_LYRICS: params.get("showLyrics") !== "0",
    SHOW_NEXT: params.get("showNext") !== "0",
    SHOW_NOTICE: params.get("showNotice") !== "0",
    DEBUG: params.get("debug") === "1"
};

export function biliApiUrl(path = ""): string {
    return ENV.BASE_PATH + ENV.BILI_API + path;
}
export function neteaseApiUrl(path = ""): string {
    return ENV.BASE_PATH + ENV.NETEASE_API + path;
}
export function qqApiUrl(path = ""): string {
    if (/^https?:\/\//.test(ENV.QQ_API)) return ENV.QQ_API + path;
    return ENV.BASE_PATH + ENV.QQ_API + path;
}
