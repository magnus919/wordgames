use crate::{domain::Registry, store::Store};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{Duration, Utc};
use serde_json::json;
use std::{path::PathBuf, sync::Arc};
use tower_http::{set_header::SetResponseHeaderLayer, trace::TraceLayer};
#[derive(Clone)]
pub struct AppState {
    pub store: Store,
    pub registry: Arc<Registry>,
    pub games_dir: PathBuf,
}
fn unavailable(code: &str) -> Response {
    (StatusCode::SERVICE_UNAVAILABLE,[(header::CACHE_CONTROL,"no-store"),(header::RETRY_AFTER,"60")],Json(json!({"error":{"code":code,"message":"Today's puzzles aren't available yet. Please try again shortly."}}))).into_response()
}
async fn daily(State(state): State<AppState>) -> Response {
    let today = Utc::now().date_naive();
    let mut games = Vec::new();
    let mut available = 0;
    for module in state.registry.values() {
        let puzzle = match state.store.get(&module.manifest.id, today).await {
            Ok(Some(p)) if module.validate_scheduled(&p).is_ok() => {
                available += 1;
                Some(p)
            }
            Ok(_) => None,
            Err(_) => {
                tracing::error!("daily edition database read failed");
                return unavailable("database_unavailable");
            }
        };
        games.push(
            json!({"manifest":module.manifest,"puzzle":puzzle,"lexicons":module.catalog.lexicons}),
        );
    }
    if available == 0 {
        return unavailable("editions_unavailable");
    }
    ([(header::CACHE_CONTROL,"no-store")],Json(json!({"server_now":Utc::now(),"date":today,"number":crate::domain::number(today),"next_reset":(today+Duration::days(1)).and_hms_opt(0,0,0).unwrap().and_utc(),"games":games}))).into_response()
}
async fn games(State(state): State<AppState>) -> Response {
    Json(json!(
        state
            .registry
            .values()
            .map(|m| &m.manifest)
            .collect::<Vec<_>>()
    ))
    .into_response()
}
async fn health(State(state): State<AppState>) -> Response {
    if sqlx::query("SELECT 1")
        .execute(&state.store.0)
        .await
        .is_ok()
    {
        (StatusCode::OK, Json(json!({"status":"ok"}))).into_response()
    } else {
        unavailable("database_unavailable")
    }
}
fn asset(content: &'static str, mime: &'static str) -> Response {
    (
        [
            (header::CONTENT_TYPE, mime),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        content,
    )
        .into_response()
}
async fn game_asset(
    State(state): State<AppState>,
    Path((game, file)): Path<(String, String)>,
) -> Response {
    if !state.registry.contains_key(&game)
        || ![
            "game.js",
            "manifest.json",
            "schema.json",
            "catalog.json",
            "styles.css",
        ]
        .contains(&file.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    let path = state.games_dir.join(&game).join(&file);
    let Ok(metadata) = tokio::fs::symlink_metadata(&path).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return StatusCode::NOT_FOUND.into_response();
    }
    match tokio::fs::read(path).await {
        Ok(bytes) => {
            let mime = if file.ends_with(".js") {
                "text/javascript"
            } else if file.ends_with(".css") {
                "text/css"
            } else {
                "application/json"
            };
            (
                [
                    (header::CONTENT_TYPE, mime),
                    (header::CACHE_CONTROL, "no-cache"),
                ],
                bytes,
            )
                .into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
pub fn router(state: AppState) -> Router {
    Router::new().route("/api/v1/daily",get(daily)).route("/api/v1/games",get(games)).route("/healthz",get(health))
        .route("/games/{game}/{file}",get(game_asset))
        .route("/",get(||async{asset(include_str!("../../index.html"),"text/html; charset=utf-8")}))
        .route("/index.html",get(||async{asset(include_str!("../../index.html"),"text/html; charset=utf-8")}))
        .route("/styles.css",get(||async{asset(include_str!("../../styles.css"),"text/css; charset=utf-8")}))
        .route("/js/app.js",get(||async{asset(include_str!("../../js/app.js"),"text/javascript; charset=utf-8")}))
        .route("/js/core.js",get(||async{asset(include_str!("../../js/core.js"),"text/javascript; charset=utf-8")}))
        .route("/js/game-kit.js",get(||async{asset(include_str!("../../js/game-kit.js"),"text/javascript; charset=utf-8")}))
        .route("/js/storage.js",get(||async{asset(include_str!("../../js/storage.js"),"text/javascript; charset=utf-8")}))
        .route("/js/content.js",get(||async{asset(include_str!("../../js/content.js"),"text/javascript; charset=utf-8")}))
        .fallback(||async{(StatusCode::NOT_FOUND,Json(json!({"error":{"code":"not_found"}})))})
        .layer(SetResponseHeaderLayer::if_not_present(header::X_CONTENT_TYPE_OPTIONS,HeaderValue::from_static("nosniff")))
        .layer(SetResponseHeaderLayer::if_not_present(header::REFERRER_POLICY,HeaderValue::from_static("strict-origin-when-cross-origin")))
        .layer(SetResponseHeaderLayer::if_not_present(header::CONTENT_SECURITY_POLICY,HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")))
        .layer(TraceLayer::new_for_http()).with_state(state)
}
