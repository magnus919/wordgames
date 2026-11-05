use anyhow::{Context, Result, bail, ensure};
use chrono::Utc;
use std::{env, path::PathBuf, sync::Arc};
use wordgames::{
    domain::{GameModule, load_registry},
    generator::{Model, replenish},
    http::{AppState, router},
    store::Store,
};
fn install(source: PathBuf, root: &std::path::Path) -> Result<()> {
    let module = GameModule::load(&source)?;
    std::fs::create_dir_all(root)?;
    let target = root.join(&module.manifest.id);
    ensure!(
        !target.exists(),
        "game already installed; replacement requires an explicit version migration"
    );
    let staging = root.join(format!(
        ".install-{}-{}",
        module.manifest.id,
        std::process::id()
    ));
    std::fs::create_dir(&staging)?;
    let result = (|| -> Result<()> {
        for file in [
            "manifest.json",
            "schema.json",
            "catalog.json",
            "game.js",
            "styles.css",
        ] {
            let from = source.join(file);
            if !from.exists() && file == "styles.css" {
                continue;
            }
            let metadata = std::fs::symlink_metadata(&from)?;
            ensure!(
                metadata.is_file() && !metadata.file_type().is_symlink(),
                "package_symlink_not_allowed"
            );
            std::fs::copy(from, staging.join(file))?;
        }
        GameModule::load(&staging)?;
        std::fs::rename(&staging, &target)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    result?;
    let installed = load_registry(root)?;
    let ids: Vec<_> = installed.keys().collect();
    let index_tmp = root.join(".index.json.tmp");
    std::fs::write(&index_tmp, serde_json::to_vec_pretty(&ids)?)?;
    std::fs::rename(index_tmp, root.join("index.json"))?;
    tracing::info!(
        game = module.manifest.id,
        "game installed; restart services to discover it"
    );
    Ok(())
}
#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "wordgames=info,tower_http=info".into()),
        )
        .init();
    let command = env::args().nth(1).unwrap_or_else(|| "serve".into());
    let games_dir = env::var_os("GAMES_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../games"));
    if command == "install-module" {
        return install(
            env::args()
                .nth(2)
                .map(PathBuf::from)
                .context("usage: wordgames install-module PACKAGE_DIRECTORY")?,
            &games_dir,
        );
    }
    let registry = load_registry(&games_dir)?;
    if command == "validate-games" {
        tracing::info!(count = registry.len(), "English game packages valid");
        return Ok(());
    }
    let url = env::var("DATABASE_URL").context("DATABASE_URL is required")?;
    let store = Store::connect(&url)
        .await
        .map_err(|_| anyhow::anyhow!("database connection failed"))?;
    store.migrate().await?;
    match command.as_str() {
        "migrate" => {}
        "bootstrap" => {
            for module in registry.values() {
                let count = store.bootstrap(Utc::now().date_naive(), module).await?;
                tracing::info!(game = module.manifest.id, count, "bootstrap finished");
            }
        }
        "generate" => {
            let model = Model::new(
                env::var("LLM_CHAT_URL").context("LLM_CHAT_URL required")?,
                env::var("LLM_API_KEY").context("LLM_API_KEY required")?,
                env::var("LLM_MODEL").context("LLM_MODEL required")?,
            )?;
            replenish(&store, &registry, &model, Utc::now().date_naive()).await?;
        }
        "serve" => {
            let address = env::var("BIND_ADDRESS").unwrap_or_else(|_| "0.0.0.0:8080".into());
            let listener = tokio::net::TcpListener::bind(&address).await?;
            tracing::info!(%address,"wordgames listening");
            axum::serve(
                listener,
                router(AppState {
                    store,
                    registry: Arc::new(registry),
                    games_dir,
                }),
            )
            .with_graceful_shutdown(async {
                let _ = tokio::signal::ctrl_c().await;
            })
            .await?;
        }
        _ => bail!(
            "unknown command: use serve, migrate, bootstrap, generate, validate-games or install-module"
        ),
    }
    Ok(())
}
