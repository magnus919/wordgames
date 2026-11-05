//! TEST_DATABASE_URL must name a disposable database. Every test uses a fresh schema.
use axum::{Json, Router, routing::post};
use chrono::{Duration, Utc};
use serde_json::{Value, json};
use sqlx::{Row, postgres::PgPoolOptions};
use std::{path::PathBuf, sync::Arc};
use tower::ServiceExt;
use wordgames::{
    domain::{Registry, load_registry},
    generator::{Model, ModelFailure, replenish},
    http::{AppState, router},
    store::Store,
};
static NEXT_SCHEMA: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../games")
}
async fn fixture() -> (Store, Registry) {
    let url =
        std::env::var("TEST_DATABASE_URL").expect("set TEST_DATABASE_URL to a disposable database");
    let schema = format!(
        "wg_test_{}_{}_{}",
        std::process::id(),
        NEXT_SCHEMA.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    sqlx::query(&format!("CREATE SCHEMA {schema}"))
        .execute(&admin)
        .await
        .unwrap();
    admin.close().await;
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .after_connect(move |connection, _| {
            let q = format!("SET search_path TO {schema}");
            Box::pin(async move {
                sqlx::query(&q).execute(connection).await?;
                Ok(())
            })
        })
        .connect(&url)
        .await
        .unwrap();
    let store = Store(pool);
    store.migrate().await.unwrap();
    (store, load_registry(&root()).unwrap())
}
async fn mock_model(
    body: Value,
    status: axum::http::StatusCode,
) -> (Model, tokio::task::JoinHandle<()>) {
    let app = Router::new().route(
        "/chat",
        post(move || {
            let b = body.clone();
            async move { (status, Json(b)) }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (
        Model::new(
            format!("http://{address}/chat"),
            "test_only".into(),
            "mock".into(),
        )
        .unwrap(),
        task,
    )
}
#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn concurrent_publication_is_idempotent_and_live_editions_are_immutable() {
    let (store, r) = fixture().await;
    let m = &r["fivefold"];
    let day = Utc::now().date_naive();
    let p = m.scheduled(day, m.catalog.fixtures[0].clone()).unwrap();
    let (a, b) = tokio::join!(store.publish(&p, m, None), store.publish(&p, m, None));
    assert_eq!(usize::from(a.unwrap()) + usize::from(b.unwrap()), 1);
    let other = m.scheduled(day, m.catalog.fixtures[1].clone()).unwrap();
    assert!(!store.publish(&other, m, None).await.unwrap());
    assert_eq!(
        store
            .get(&m.manifest.id, day)
            .await
            .unwrap()
            .unwrap()
            .content["answer"],
        "PLANT"
    );
    assert!(
        sqlx::query("UPDATE editions SET source='llm'")
            .execute(&store.0)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM editions")
            .execute(&store.0)
            .await
            .is_err()
    );
    let reused = m
        .scheduled(day + Duration::days(1), m.catalog.fixtures[0].clone())
        .unwrap();
    assert!(store.publish(&reused, m, None).await.is_err());
    assert!(
        store
            .get(&m.manifest.id, day + Duration::days(1))
            .await
            .unwrap()
            .is_none()
    );
}
#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn invalid_publication_rolls_back_and_a_valid_retry_is_audited() {
    let (store, r) = fixture().await;
    let m = &r["fivefold"];
    let day = Utc::now().date_naive();
    let id = store.attempt(day, "mock", m).await.unwrap();
    let mut p = m.scheduled(day, m.catalog.fixtures[0].clone()).unwrap();
    p.content["answer"] = "PERRO".into();
    assert!(store.publish(&p, m, Some(id)).await.is_err());
    store
        .outcome(id, "rejected", "word_not_approved_english")
        .await
        .unwrap();
    assert!(store.get(&m.manifest.id, day).await.unwrap().is_none());
    let retry = store.attempt(day, "mock", m).await.unwrap();
    let p = m.scheduled(day, m.catalog.fixtures[0].clone()).unwrap();
    assert!(store.publish(&p, m, Some(retry)).await.unwrap());
    let rows = sqlx::query("SELECT outcome FROM generation_attempts ORDER BY id")
        .fetch_all(&store.0)
        .await
        .unwrap();
    assert_eq!(
        rows.iter()
            .map(|r| r.get::<String, _>("outcome"))
            .collect::<Vec<_>>(),
        ["rejected", "published"]
    );
}
#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn api_is_today_only_and_unavailable_games_are_explicit() {
    let (store, r) = fixture().await;
    let app = router(AppState {
        store: store.clone(),
        registry: Arc::new(r.clone()),
        games_dir: root(),
    });
    let request = || {
        axum::http::Request::builder()
            .uri("/api/v1/daily")
            .body(axum::body::Body::empty())
            .unwrap()
    };
    let response = app.clone().oneshot(request()).await.unwrap();
    assert_eq!(response.status(), 503);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let day = Utc::now().date_naive();
    let m = &r["fivefold"];
    let p = m.scheduled(day, m.catalog.fixtures[0].clone()).unwrap();
    store.publish(&p, m, None).await.unwrap();
    let response = app.clone().oneshot(request()).await.unwrap();
    assert_eq!(response.status(), 200);
    let body: Value = serde_json::from_slice(
        &axum::body::to_bytes(response.into_body(), 500_000)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(body["date"], day.to_string());
    assert_eq!(body["games"][0]["puzzle"]["content"]["answer"], "PLANT");
    assert!(body["games"][1]["puzzle"].is_null());
    assert!(body["server_now"].is_string());
    for (path, expected) in [
        ("/api/v1/daily?date=2099-01-01", 200),
        ("/.env", 404),
        ("/backend/src/main.rs", 404),
        ("/games/not-installed/game.js", 404),
        ("/games/fivefold/game.js", 200),
    ] {
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri(path)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
}
#[tokio::test]
async fn model_malformed_output_and_provider_failures_are_classified() {
    let registry = load_registry(&root()).unwrap();
    let m = &registry["fivefold"];
    for content in ["not json", "```json {} ```"] {
        let (model, task) = mock_model(
            json!({"choices":[{"message":{"content":content}}]}),
            axum::http::StatusCode::OK,
        )
        .await;
        assert!(matches!(
            model.propose(m, &m.catalog.fixtures[0]).await,
            Err(ModelFailure::Rejected(_))
        ));
        task.abort();
    }
    let (model, task) = mock_model(
        json!({"error":"rate limited"}),
        axum::http::StatusCode::TOO_MANY_REQUESTS,
    )
    .await;
    assert!(matches!(
        model.propose(m, &m.catalog.fixtures[0]).await,
        Err(ModelFailure::Failed(_))
    ));
    task.abort();
    let (model, task) = mock_model(
        json!({"choices":[{"message":{"content":"x".repeat(140_000)}}]}),
        axum::http::StatusCode::OK,
    )
    .await;
    assert!(matches!(
        model.propose(m, &m.catalog.fixtures[0]).await,
        Err(ModelFailure::Rejected("provider_response_too_large"))
    ));
    task.abort();
}
#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn worker_rejects_wrong_length_then_recovers_without_replacing_existing_puzzles() {
    let (store, mut registry) = fixture().await;
    registry.retain(|id, _| id == "fivefold");
    let m = &registry["fivefold"];
    let today = Utc::now().date_naive();
    for i in 0..13 {
        let p = m
            .scheduled(
                today + Duration::days(i),
                m.catalog.fixtures[i as usize].clone(),
            )
            .unwrap();
        store.publish(&p, m, None).await.unwrap();
    }
    let mut bad = m.catalog.fixtures[13].clone();
    bad["answer"] = "TOOLONG".into();
    let (model, task) = mock_model(
        json!({"choices":[{"message":{"content":bad.to_string()}}]}),
        axum::http::StatusCode::OK,
    )
    .await;
    assert!(replenish(&store, &registry, &model, today).await.is_err());
    task.abort();
    let target = today + Duration::days(13);
    assert!(store.get(&m.manifest.id, target).await.unwrap().is_none());
    let rejected: i64 =
        sqlx::query_scalar("SELECT count(*) FROM generation_attempts WHERE outcome='rejected'")
            .fetch_one(&store.0)
            .await
            .unwrap();
    assert_eq!(rejected, 3);
    let good = m.catalog.fixtures[13].clone();
    let (model, task) = mock_model(
        json!({"choices":[{"message":{"content":good.to_string()}}]}),
        axum::http::StatusCode::OK,
    )
    .await;
    assert_eq!(
        replenish(&store, &registry, &model, today).await.unwrap(),
        1
    );
    assert_eq!(
        replenish(&store, &registry, &model, today).await.unwrap(),
        0
    );
    task.abort();
    assert_eq!(
        store
            .get(&m.manifest.id, today)
            .await
            .unwrap()
            .unwrap()
            .content["answer"],
        "PLANT"
    );
    assert!(store.get(&m.manifest.id, target).await.unwrap().is_some());
}

#[test]
fn installer_discovers_third_package_and_refuses_overwrite() {
    let temp = std::env::temp_dir().join(format!(
        "wg_install_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let source = temp.join("source");
    let installed = temp.join("games");
    std::fs::create_dir_all(&source).unwrap();
    for file in ["manifest.json", "schema.json", "catalog.json", "game.js"] {
        std::fs::copy(root().join("fivefold").join(file), source.join(file)).unwrap();
    }
    let manifest_path = source.join("manifest.json");
    let mut manifest: Value =
        serde_json::from_slice(&std::fs::read(&manifest_path).unwrap()).unwrap();
    manifest["id"] = "third-game".into();
    std::fs::write(&manifest_path, manifest.to_string()).unwrap();
    let entry = std::fs::read_to_string(source.join("game.js"))
        .unwrap()
        .replace("id: \"fivefold\"", "id: \"third-game\"");
    std::fs::write(source.join("game.js"), entry).unwrap();
    let run = || {
        std::process::Command::new(env!("CARGO_BIN_EXE_wordgames"))
            .arg("install-module")
            .arg(&source)
            .env("GAMES_DIR", &installed)
            .output()
            .unwrap()
    };
    let first = run();
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    let registry = load_registry(&installed).unwrap();
    assert!(registry.contains_key("third-game"));
    assert_eq!(
        serde_json::from_slice::<Value>(&std::fs::read(installed.join("index.json")).unwrap())
            .unwrap(),
        json!(["third-game"])
    );
    assert!(!run().status.success());
    std::fs::remove_dir_all(temp).unwrap();
}
