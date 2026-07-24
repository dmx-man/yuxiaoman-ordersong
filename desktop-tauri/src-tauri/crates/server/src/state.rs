//! 全局 AppState
//!
//! 所有路由 handler 通过 State<AppStateRef> 共享访问下列数据:
//! - 配置 (cfg)
//! - 共享 reqwest::Client (http)
//! - LRU 缓存 (cache) & 运行时指标 (metrics)
//! - 三套 cookie (B 站 / 网易云不需要在后端长期持有, 所以只存 B 站和 QQ)
//! - 跨进程播放快照 (live_state) & 跨客户端共享配置 (shared_config)

use std::sync::{Arc, RwLock};
use std::time::Duration;

use ordersong_bili_open::BiliOpenClient;
use ordersong_core::consts::{DEFAULT_UA, HTTP_TIMEOUT_SECS};
use ordersong_core::AppConfig;
use ordersong_music::{BiliMusicClient, NeteaseClient, QqClient};

use crate::cache::Caches;
use crate::metrics::Metrics;
use crate::shared_config;

pub struct AppState {
    pub cfg: AppConfig,
    pub http: reqwest::Client,
    pub cache: Caches,
    pub metrics: Metrics,

    /// 内存中的 QQ 音乐 cookie (前端登录后通过 /qq-api/user/setCookie 写入)
    pub qq_cookie: RwLock<String>,
    /// 内存中的 B 站 cookie (扫码登录后由后端解析写入; 前端 hydrate 完成后 set 回来)
    pub bili_cookie: RwLock<String>,

    /// 主程序播放状态快照 (OBS 浏览器源跨进程读取)
    pub live_state: RwLock<serde_json::Value>,
    /// 跨客户端共享配置 (落盘 + 内存双缓存)
    pub shared_config: RwLock<serde_json::Value>,

    /// B 站开放平台客户端 (持有 access_key + app_id)
    pub bili_open: BiliOpenClient,
    /// 网易云客户端
    pub netease: NeteaseClient,
    /// QQ 音乐客户端
    pub qq: QqClient,
    /// B 站 BV 号点歌音频客户端
    pub bili_music: BiliMusicClient,
}

pub type AppStateRef = Arc<AppState>;

impl AppState {
    pub fn new(cfg: AppConfig) -> AppStateRef {
        let http = reqwest::ClientBuilder::new()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .cookie_store(false)
            .user_agent(DEFAULT_UA)
            .build()
            .expect("reqwest client build");

        let bili_open = BiliOpenClient::new(
            http.clone(),
            cfg.access_key_id.clone(),
            cfg.access_key_secret.clone(),
            cfg.bili_app_id,
        );
        let netease = NeteaseClient::new(http.clone());
        let qq = QqClient::new(http.clone());
        let bili_music = BiliMusicClient::new(http.clone());

        Arc::new(Self {
            cache: Caches::new(&cfg),
            metrics: Metrics::default(),
            qq_cookie: RwLock::new(String::new()),
            bili_cookie: RwLock::new(String::new()),
            live_state: RwLock::new(serde_json::Value::Null),
            shared_config: RwLock::new(shared_config::load_from_disk()),
            cfg,
            http,
            bili_open,
            netease,
            qq,
            bili_music,
        })
    }

    /// 读取 B 站 cookie 的工具方法
    pub fn bili_cookie_snapshot(&self) -> String {
        self.bili_cookie.read().map(|c| c.clone()).unwrap_or_default()
    }

    /// 读取 QQ cookie 的工具方法
    pub fn qq_cookie_snapshot(&self) -> String {
        self.qq_cookie.read().map(|c| c.clone()).unwrap_or_default()
    }
}
