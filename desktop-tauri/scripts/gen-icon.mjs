/**
 * 从项目根目录的 logo.png 生成 Tauri 需要的 icon.ico (Windows)
 *
 * 实现策略：
 *   1. 用 pngjs 读 logo.png
 *   2. 如果非方形则用透明像素补 padding 到方形（保持原始分辨率，不缩放，质量无损）
 *   3. 喂给 png-to-ico 生成 ICO
 *
 * 用法：
 *   node desktop-tauri/scripts/gen-icon.mjs
 *
 * 若希望自定义图标，请替换项目根目录 logo.png（建议方形 256×256 或 512×512）后重新运行。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pngToIco from "png-to-ico";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

const LOGO_PNG = path.join(ROOT, "logo.png");
// 必须输出到 app crate 的 icons 目录, 与 tauri.conf.json 的 "icons/icon.ico" 对应
const ICO_PATH = path.join(__dirname, "..", "src-tauri", "crates", "app", "icons", "icon.ico");

if (!fs.existsSync(LOGO_PNG)) {
    console.error(`[icon] 找不到 ${LOGO_PNG}`);
    console.error("[icon] 请把 logo.png 放在项目根目录后再运行");
    process.exit(1);
}

const raw = PNG.sync.read(fs.readFileSync(LOGO_PNG));
const { width: w, height: h, data } = raw;
let inputBuf;

if (w === h) {
    console.log(`[icon] logo.png 已是方形 ${w}×${h}`);
    inputBuf = fs.readFileSync(LOGO_PNG);
} else {
    const size = Math.max(w, h);
    console.log(`[icon] logo.png ${w}×${h}，padding 到方形 ${size}×${size}`);
    const square = new PNG({ width: size, height: size });
    const offX = Math.floor((size - w) / 2);
    const offY = Math.floor((size - h) / 2);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const src = (y * w + x) * 4;
            const dst = ((y + offY) * size + (x + offX)) * 4;
            square.data[dst] = data[src];
            square.data[dst + 1] = data[src + 1];
            square.data[dst + 2] = data[src + 2];
            square.data[dst + 3] = data[src + 3];
        }
    }
    inputBuf = PNG.sync.write(square);
}

const ico = await pngToIco(inputBuf);
fs.mkdirSync(path.dirname(ICO_PATH), { recursive: true });
fs.writeFileSync(ICO_PATH, ico);
console.log(`[icon] 已生成 ${ICO_PATH} (${ico.length} bytes)`);
