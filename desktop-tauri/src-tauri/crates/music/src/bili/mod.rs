//! B 站 BV 号点歌音频客户端
//!
//! 复用 `ordersong-bili-web::wbi` 的 WBI 签名:
//! - `x/web-interface/view` 取标题 / UP 主 / 时长 / 封面 / 首 P cid
//! - `x/player/wbi/playurl` (WBI 签名) 取 DASH 音频直链
//!
//! 仅支持公开视频; 登录态 / 付费 / 地区限制视频不在范围内。

use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

use ordersong_bili_web::wbi::{fetch_wbi_keys, get_mixin_key, sign};
use ordersong_core::consts::{BILI_REFERER, DEFAULT_UA};
use serde_json::Value;

/// WBI 密钥缓存有效期 (秒)
const WBI_TTL_SECS: u64 = 300;

/// 视频元数据 + 首 P cid + 实际播放音质标签
pub struct BiliResolve {
    pub sname: String,
    pub sartist: String,
    pub duration: u64,
    pub cover_url: String,
    pub cid: u64,
    /// 实际选中的音质 (如 "Hi-Res 无损" / "FLAC 无损" / "杜比全景声" / "标准音质 192k")
    pub quality: String,
}

/// 音频直链 + 其音质标签
pub struct BiliAudio {
    pub url: String,
    pub quality: String,
}

pub struct BiliMusicClient {
    http: reqwest::Client,
    /// (img_key, sub_key, 获取时刻 epoch 秒)
    wbi: RwLock<Option<(String, String, u64)>>,
}

impl BiliMusicClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            wbi: RwLock::new(None),
        }
    }

    /// 取 mixin_key, 命中缓存则跳过 nav 请求
    async fn mixin_key(&self, cookie: &str) -> Result<String, String> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let cached = self.wbi.read().ok().and_then(|g| g.clone());
        if let Some((img, sub, ts)) = cached {
            if now.saturating_sub(ts) < WBI_TTL_SECS {
                return Ok(get_mixin_key(&img, &sub));
            }
        }
        let (img, sub) = fetch_wbi_keys(&self.http, cookie)
            .await
            .ok_or_else(|| "获取 B 站 WBI 密钥失败".to_string())?;
        let _ = self
            .wbi
            .write()
            .map(|mut g| *g = Some((img.clone(), sub.clone(), now)));
        Ok(get_mixin_key(&img, &sub))
    }

    /// 解析 BV 号 -> 元数据 + cid
    pub async fn resolve(&self, bvid: &str, cookie: &str) -> Result<BiliResolve, String> {
        let url = format!("https://api.bilibili.com/x/web-interface/view?bvid={}", bvid);
        let body: Value = self
            .http
            .get(&url)
            .header("User-Agent", DEFAULT_UA)
            .header("Referer", BILI_REFERER)
            .header("Cookie", cookie)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        if body.get("code").and_then(|c| c.as_i64()) != Some(0) {
            let msg = body
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("视频不存在或受限");
            return Err(msg.to_string());
        }

        let data = body.get("data").ok_or("响应缺少 data 字段")?;
        let sname = data
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let sartist = data
            .pointer("/owner/name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let duration = data.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);
        let cover_url = data
            .get("pic")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .replace("http://", "https://");
        let cid = data
            .pointer("/pages/0/cid")
            .and_then(|v| v.as_u64())
            .ok_or("响应缺少 cid (无分 P)")?;

        // 取实际播放音质 (复用 playurl 选流逻辑; 匿名时回落到标准 AAC)
        let quality = match self.audio_url(bvid, cid, cookie).await {
            Ok(a) => a.quality,
            Err(_) => "标准音质".to_string(),
        };

        Ok(BiliResolve {
            sname,
            sartist,
            duration,
            cover_url,
            cid,
            quality,
        })
    }

    /// 取最高品质音频直链. 优先级: Hi-Res (dolby.flac) > 无损 FLAC > 杜比 > 最高 AAC
    ///
    /// `fnval=4048` 才会下发 flac / dolby 流, 且这些无损/杜比流通常需要登录态 cookie,
    /// 未登录时退化为最高 AAC (192k).
    pub async fn audio_url(&self, bvid: &str, cid: u64, cookie: &str) -> Result<BiliAudio, String> {
        let mixin = self.mixin_key(cookie).await?;
        let params = vec![
            ("bvid".to_string(), bvid.to_string()),
            ("cid".to_string(), cid.to_string()),
            ("qn".to_string(), "127".to_string()),
            ("fnval".to_string(), "4048".to_string()),
            ("fourk".to_string(), "1".to_string()),
            ("platform".to_string(), "web".to_string()),
        ];
        let query = sign(params, &mixin);
        let url = format!("https://api.bilibili.com/x/player/wbi/playurl?{}", query);

        let body: Value = self
            .http
            .get(&url)
            .header("User-Agent", DEFAULT_UA)
            .header("Referer", BILI_REFERER)
            .header("Cookie", cookie)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        if body.get("code").and_then(|c| c.as_i64()) != Some(0) {
            let msg = body
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("获取音频流失败");
            return Err(msg.to_string());
        }

        let dash = body.pointer("/data/dash").ok_or("响应缺少 dash 字段")?;

        if let Some((url, quality)) = best_audio_url(dash) {
            return Ok(BiliAudio { url, quality });
        }

        Err("未找到可用音频流".to_string())
    }
}

/// 从 DASH 节点选出最高品质音频直链与其音质标签.
///
/// 返回 `(直链, 音质标签)`, 优先级 (高 -> 低):
/// 1. `dash.dolby.flac`  -- Hi-Res 无损
/// 2. `dash.flac.audio`  -- FLAC 无损
/// 3. `dash.dolby.audio` -- 杜比全景声
/// 4. `dash.audio` 中带宽最高的 AAC
fn best_audio_url(dash: &serde_json::Value) -> Option<(String, String)> {
    let pick = |node: &serde_json::Value| -> Option<String> {
        node.get("baseUrl")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                node.get("backupUrl")
                    .and_then(|a| a.as_array())
                    .and_then(|a| a.first())
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
    };

    // 1. Hi-Res 无损
    if let Some(u) = pick(dash.pointer("/dolby/flac").unwrap_or(&serde_json::Value::Null)) {
        return Some((u, "Hi-Res 无损".to_string()));
    }
    // 2. 无损 FLAC
    if let Some(u) = pick(dash.pointer("/flac/audio").unwrap_or(&serde_json::Value::Null)) {
        return Some((u, "FLAC 无损".to_string()));
    }
    // 3. 杜比全景声
    if let Some(u) = pick(dash.pointer("/dolby/audio").unwrap_or(&serde_json::Value::Null)) {
        return Some((u, "杜比全景声".to_string()));
    }
    // 4. 最高带宽 AAC
    if let Some(audio) = dash.get("audio").and_then(|a| a.as_array()) {
        if let Some(best) = audio
            .iter()
            .max_by_key(|v| v.get("bandwidth").and_then(|b| b.as_u64()).unwrap_or(0))
        {
            if let Some(u) = pick(best) {
                return Some((u, "标准音质 192k".to_string()));
            }
        }
    }
    None
}
