//! 网易云音乐 + QQ 音乐客户端集合
//!
//! 两个平台共享 MusicClient trait (高层"搜索 / 取流 / 取歌词 / 取歌单"接口) ,
//! 让上层路由 / 业务代码可以同一抽象对待

pub mod bili;
pub mod netease;
pub mod qq;

pub use bili::BiliMusicClient;
pub use netease::NeteaseClient;
pub use qq::QqClient;
