// release 构建隐藏控制台黑框
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser;
mod logger;
mod tray;
mod webview_login;

use std::time::{Duration, Instant};

use ordersong_core::config;
use std::fs;

use tauri::{Manager, WindowEvent};

use crate::logger::write_log;

const WAIT_BACKEND_TIMEOUT: Duration = Duration::from_secs(15);

/// dev 模式下 Vite dev server 监听端口
#[cfg(debug_assertions)]
const VITE_DEV_PORT: u16 = 5173;

fn main() {
    std::panic::set_hook(Box::new(|info| {
        write_log(&format!("PANIC: {}", info));
    }));

    write_log("=== start.exe boot (rust-native backend) ===");
    write_log(&format!("exe: {:?}", std::env::current_exe()));
    write_log(&format!("cwd: {:?}", std::env::current_dir()));

    let result = std::panic::catch_unwind(run_app);
    if let Err(err) = result {
        write_log(&format!("FATAL caught: {:?}", err));
        std::process::exit(2);
    }
}

/// 将配置备份写入用户通过对话框选择的任意路径 (供前端“备份配置”使用).
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| format!("写入文件失败：{e}"))
}

/// 读取用户通过对话框选择的备份文件内容 (供前端“导入配置”使用).
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{e}"))
}

fn check_health(url: &str) -> bool {
    matches!(
        ureq::get(url).timeout(Duration::from_secs(2)).call(),
        Ok(r) if r.status() == 200
    )
}

fn run_app() {
    let cfg = config::load();
    write_log(&format!(
        "[config] host={} port={} base={} app_id={} key_id_present={}",
        cfg.web_server_host,
        cfg.web_server_port,
        cfg.base_path,
        cfg.bili_app_id,
        !cfg.access_key_id.is_empty()
    ));

    let port = cfg.web_server_port;
    let base = cfg.base_path.clone();
    let host = cfg.web_server_host.clone();

    let healthz_url = format!("http://{}:{}/healthz", host, port);

    // dev 模式下 WebView 加载 Vite dev server
    // 以获得前端 HMR；prod 模式下由 axum 从打包资源里直接提供前端
    #[cfg(debug_assertions)]
    let display_url = format!("http://{}:{}{}/", host, VITE_DEV_PORT, base);
    #[cfg(not(debug_assertions))]
    let display_url = format!("http://{}:{}{}/", host, port, base);

    let state = ordersong_server::new_state(cfg);

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            webview_login::open_netease_login,
            webview_login::read_netease_cookies,
            webview_login::close_netease_login,
            webview_login::open_qq_login,
            webview_login::read_qq_cookies,
            webview_login::close_qq_login,
            browser::open_bili_live_settings,
            browser::open_bili_qr_login,
            browser::close_bili_live_settings,
            write_text_file,
            read_text_file,
        ])
        .setup(move |app| {
            write_log("setup() start");
            tray::build(app)?;

            // 启动内嵌 axum 服务
            let state_for_serve = state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ordersong_server::serve(state_for_serve).await {
                    write_log(&format!("axum server error: {e}"));
                }
            });

            // 等 backend 健康检查通过后再显示主窗口
            let handle = app.handle().clone();
            let healthz_url = healthz_url.clone();
            let display_url = display_url.clone();
            tauri::async_runtime::spawn(async move {
                let start = Instant::now();
                loop {
                    if start.elapsed() > WAIT_BACKEND_TIMEOUT {
                        write_log("等待 axum 启动超时");
                        break;
                    }
                    let ok = tokio::task::spawn_blocking({
                        let u = healthz_url.clone();
                        move || check_health(&u)
                    })
                    .await
                    .unwrap_or(false);
                    if ok {
                        write_log("axum healthz ok");
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(150)).await;
                }
                if let Some(win) = handle.get_webview_window("main") {
                    let _ = win.eval(format!("location.replace('{}')", display_url));
                    let _ = win.show();
                    let _ = win.set_focus();
                    write_log(&format!("window shown, url={}", display_url));
                } else {
                    write_log("get_webview_window('main') 返回 None");
                }
            });

            write_log("setup() done");
            Ok(())
        })
        .on_window_event(|window, event| {
            //隐藏到托盘
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                    write_log("[main] 关闭按钮 → 已隐藏到托盘");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Tauri 运行错误");
}
