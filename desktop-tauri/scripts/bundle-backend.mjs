/**
 * 准备桌面打包所需的资源（frontend dist + config）
 *
 * 注：旧版本会构建 Node sidecar 并打包 backend 代码。本版本已完全切换到 Rust 内嵌服务，
 *     这里只需要复制前端静态资源 + 配置文件即可。
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DESKTOP_DIR = path.resolve(__dirname, "..");
const APP_CRATE = path.join(DESKTOP_DIR, "src-tauri", "crates", "app");
const RESOURCES_DIR = path.join(APP_CRATE, "resources");
const FRONTEND_DIST = path.join(ROOT, "frontend", "dist");

function rimraf(p) {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}
function copyDir(src, dst) {
    fs.cpSync(src, dst, { recursive: true, dereference: true });
}

// Tauri 的 frontendDist 指向占位目录 `dist-stub` (真正 UI 由 axum 在 17777 提供)。
// 该目录被 .gitignore 忽略, 这里每次构建前自动补一个最小 index.html, 避免 "Unable to find your web assets"。
const DIST_STUB = path.join(DESKTOP_DIR, "dist-stub");
ensureDir(DIST_STUB);
const STUB_HTML = path.join(DIST_STUB, "index.html");
if (!fs.existsSync(STUB_HTML)) {
    fs.writeFileSync(
        STUB_HTML,
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>鱼小曼点歌助手</title></head>' +
        "<body><!-- 占位页：生产 UI 由内嵌 axum (127.0.0.1:17777) 的 resources/frontend/dist 提供 --></body></html>\n"
    );
    console.log("[bundle] 生成占位 frontendDist:", STUB_HTML);
}

console.log("[bundle] 清理旧产物");
rimraf(RESOURCES_DIR);
ensureDir(RESOURCES_DIR);

console.log("[bundle] 构建 frontend (vite)");
execFileSync("pnpm", ["--filter", "ordersong-frontend", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true
});

console.log("[bundle] 复制 frontend/dist → resources/frontend/dist");
copyDir(FRONTEND_DIST, path.join(RESOURCES_DIR, "frontend", "dist"));

console.log("[bundle] 复制 config → resources/config");
copyDir(path.join(ROOT, "config"), path.join(RESOURCES_DIR, "config"));

console.log("[bundle] 完成");
