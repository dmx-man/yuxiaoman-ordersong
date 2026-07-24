/**
 * 版本号单一真源同步.
 *
 * 唯一需要手改的地方: 仓库根目录的 package.json 的 `version`.
 * 本脚本从该文件读出版本, 同步到:
 *   - desktop-tauri/src-tauri/crates/app/tauri.conf.json (Tauri 打包版本)
 *   - desktop-tauri/src-tauri/Cargo.toml              (workspace.package.version)
 *   - frontend/package.json
 *   - frontend/src/version.ts                        (前端运行时读取的常量)
 *
 * 已接入 `dev:desktop` / `build:frontend` / `installer` 流程, 改完根 package.json 直接构建即可.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(__dirname, ".."); // desktop-tauri
const ROOT = path.resolve(DESKTOP, ".."); // yuxiaoman-ordersong

// 1) 唯一真源: 根 package.json
const ROOT_PKG = path.join(ROOT, "package.json");
const rootPkg = JSON.parse(readFileSync(ROOT_PKG, "utf8"));
const version = rootPkg.version;
if (!version) {
    console.error("[sync-version] 根 package.json 缺少 version 字段");
    process.exit(1);
}
console.log("[sync-version] 版本源 (package.json):", version);

// 2) tauri.conf.json 的 version (Tauri 打包以此为准)
const confPath = path.join(DESKTOP, "src-tauri", "crates", "app", "tauri.conf.json");
let confRaw = readFileSync(confPath, "utf8");
confRaw = confRaw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
writeFileSync(confPath, confRaw);

// 3) Cargo.toml 的 [workspace.package] version (仅匹配行首的 version = "...")
const cargoPath = path.join(DESKTOP, "src-tauri", "Cargo.toml");
let cargo = readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);

// 4) frontend/package.json (根 package.json 是源, 不再回写)
function setPkgVersion(p) {
    const s = readFileSync(p, "utf8");
    const out = s.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
    writeFileSync(p, out);
}
setPkgVersion(path.join(ROOT, "frontend", "package.json"));

// 5) 前端常量 (运行时读取, 避免硬编码)
const verTs = path.join(ROOT, "frontend", "src", "version.ts");
writeFileSync(
    verTs,
    `// 自动生成, 勿手改. 版本唯一真源: 仓库根 package.json 的 version\n` +
        `export const APP_VERSION = "${version}";\n`
);

console.log("[sync-version] 已同步 tauri.conf.json / Cargo.toml / frontend/package.json / frontend/src/version.ts");
