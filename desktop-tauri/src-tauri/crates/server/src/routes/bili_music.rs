//! B 站 BV 号点歌音频路由
//!
//! - `GET /bili-music/resolve?bvid=BVxxx` 返回元数据 (标题 / UP / 时长 / 封面)
//! - `GET /bili-music/stream?bvid=BVxxx` 代理转发 B 站音频流 (带 Referer, 透传 Range)
//!
//! 直链有时效性, 每次 /stream 请求都重新取 playurl, 规避失效与浏览器跨域限制.

use axum::{
    body::Body,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::error::{ApiError, ApiResult};
use crate::state::AppStateRef;
use ordersong_core::consts::{BILI_REFERER, DEFAULT_UA};

/// 透传的响应头 (保证 seek / 流式播放正常)
const FORWARD_HEADERS: [&str; 5] = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
];

pub fn router() -> Router<AppStateRef> {
    Router::new()
        .route("/resolve", get(resolve))
        .route("/stream", get(stream))
}

#[derive(Deserialize)]
struct BvidQuery {
    bvid: Option<String>,
}

async fn resolve(
    State(state): State<AppStateRef>,
    Query(q): Query<BvidQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let bvid = q.bvid.ok_or_else(|| ApiError::bad("缺少 bvid 参数"))?;
    let cookie = state.bili_cookie_snapshot();
    let r = state
        .bili_music
        .resolve(&bvid, &cookie)
        .await
        .map_err(ApiError::upstream)?;
    Ok(Json(json!({
        "code": 0,
        "sname": r.sname,
        "sartist": r.sartist,
        "duration": r.duration,
        "coverUrl": r.cover_url,
        "quality": r.quality,
        "bvid": bvid,
    })))
}

async fn stream(
    State(state): State<AppStateRef>,
    headers: HeaderMap,
    Query(q): Query<BvidQuery>,
) -> impl IntoResponse {
    let bvid = match q.bvid {
        Some(b) => b,
        None => return (StatusCode::BAD_REQUEST, "缺少 bvid 参数").into_response(),
    };

    let cookie = state.bili_cookie_snapshot();
    let resolved = match state.bili_music.resolve(&bvid, &cookie).await {
        Ok(r) => r,
        Err(e) => return (StatusCode::BAD_GATEWAY, e).into_response(),
    };
    let audio = match state.bili_music.audio_url(&bvid, resolved.cid, &cookie).await {
        Ok(a) => a,
        Err(e) => return (StatusCode::BAD_GATEWAY, e).into_response(),
    };

    let mut req = state
        .http
        .get(&audio.url)
        .header("User-Agent", DEFAULT_UA)
        .header("Referer", BILI_REFERER)
        .header("Cookie", cookie);
    if let Some(range) = headers.get("range") {
        req = req.header("Range", range);
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => return (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    };

    let status = resp.status();
    let mut builder = axum::response::Response::builder().status(status);
    for name in FORWARD_HEADERS {
        if let Some(v) = resp.headers().get(name) {
            builder = builder.header(name, v.clone());
        }
    }

    let stream = resp.bytes_stream();
    builder
        .body(Body::from_stream(stream))
        .unwrap_or_else(|_| (StatusCode::INTERNAL_SERVER_ERROR, "构建响应失败").into_response())
}
