use crate::domain::{GameModule, REUSE_DAYS, ScheduledPuzzle, VALIDATION_VERSION};
use anyhow::{Result, ensure};
use chrono::{Duration, NaiveDate};
use sqlx::{PgPool, postgres::PgPoolOptions};
#[derive(Clone)]
pub struct Store(pub PgPool);
impl Store {
    pub async fn connect(url: &str) -> Result<Self> {
        Ok(Self(
            PgPoolOptions::new()
                .max_connections(5)
                .acquire_timeout(std::time::Duration::from_secs(5))
                .connect(url)
                .await?,
        ))
    }
    pub async fn migrate(&self) -> Result<()> {
        sqlx::migrate!("./migrations").run(&self.0).await?;
        Ok(())
    }
    pub async fn get(&self, game: &str, date: NaiveDate) -> Result<Option<ScheduledPuzzle>> {
        let json: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT puzzle FROM editions WHERE game_id=$1 AND puzzle_date=$2")
                .bind(game)
                .bind(date)
                .fetch_optional(&self.0)
                .await?;
        json.map(serde_json::from_value)
            .transpose()
            .map_err(Into::into)
    }
    pub async fn used(&self, game: &str, date: NaiveDate) -> Result<Vec<String>> {
        let arrays: Vec<Vec<String>> = sqlx::query_scalar(
            "SELECT answer_tokens FROM editions WHERE game_id=$1 AND puzzle_date BETWEEN $2 AND $3",
        )
        .bind(game)
        .bind(date - Duration::days(REUSE_DAYS))
        .bind(date + Duration::days(REUSE_DAYS))
        .fetch_all(&self.0)
        .await?;
        Ok(arrays.into_iter().flatten().collect())
    }
    pub async fn attempt(&self, date: NaiveDate, model: &str, module: &GameModule) -> Result<i64> {
        Ok(sqlx::query_scalar("INSERT INTO generation_attempts(game_id,puzzle_date,provider_model,module_version,validation_version,outcome) VALUES($1,$2,$3,$4,$5,'started') RETURNING id")
            .bind(&module.manifest.id).bind(date).bind(model).bind(module.manifest.version).bind(VALIDATION_VERSION).fetch_one(&self.0).await?)
    }
    pub async fn outcome(&self, id: i64, outcome: &str, reason: &str) -> Result<()> {
        sqlx::query("UPDATE generation_attempts SET outcome=$2,reason=$3,finished_at=now() WHERE id=$1 AND outcome='started'").bind(id).bind(outcome).bind(reason).execute(&self.0).await?;
        Ok(())
    }
    pub async fn publish(
        &self,
        puzzle: &ScheduledPuzzle,
        module: &GameModule,
        attempt: Option<i64>,
    ) -> Result<bool> {
        module.validate_scheduled(puzzle)?;
        let tokens = module.tokens(&puzzle.content)?;
        let mut tx = self.0.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(927341)")
            .execute(&mut *tx)
            .await?;
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM editions WHERE game_id=$1 AND puzzle_date=$2)",
        )
        .bind(&puzzle.game_id)
        .bind(puzzle.date)
        .fetch_one(&mut *tx)
        .await?;
        if exists {
            if let Some(id) = attempt {
                sqlx::query("UPDATE generation_attempts SET outcome='superseded',finished_at=now() WHERE id=$1 AND outcome='started'").bind(id).execute(&mut *tx).await?;
            }
            tx.commit().await?;
            return Ok(false);
        }
        let reused:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM editions WHERE game_id=$1 AND puzzle_date BETWEEN $2 AND $3 AND answer_tokens && $4)")
            .bind(&puzzle.game_id).bind(puzzle.date-Duration::days(REUSE_DAYS)).bind(puzzle.date+Duration::days(REUSE_DAYS)).bind(&tokens).fetch_one(&mut *tx).await?;
        ensure!(!reused, "answer_recently_used");
        if let Some(id) = attempt {
            let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM generation_attempts WHERE id=$1 AND game_id=$2 AND puzzle_date=$3 AND outcome='started')").bind(id).bind(&puzzle.game_id).bind(puzzle.date).fetch_one(&mut *tx).await?;
            ensure!(valid, "invalid_attempt_identity");
        }
        sqlx::query("INSERT INTO editions(game_id,puzzle_date,puzzle,answer_tokens,source,attempt_id) VALUES($1,$2,$3,$4,$5,$6)").bind(&puzzle.game_id).bind(puzzle.date).bind(serde_json::to_value(puzzle)?).bind(tokens).bind(if attempt.is_some(){"llm"}else{"bootstrap"}).bind(attempt).execute(&mut *tx).await?;
        if let Some(id) = attempt {
            sqlx::query(
                "UPDATE generation_attempts SET outcome='published',finished_at=now() WHERE id=$1",
            )
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(true)
    }
    pub async fn bootstrap(&self, date: NaiveDate, module: &GameModule) -> Result<usize> {
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM editions WHERE game_id=$1")
            .bind(&module.manifest.id)
            .fetch_one(&self.0)
            .await?;
        if count > 0 {
            return Ok(0);
        }
        let mut count = 0;
        for (i, fixture) in module.catalog.fixtures.iter().take(14).enumerate() {
            let p = module.scheduled(date + Duration::days(i as i64), fixture.clone())?;
            if self.publish(&p, module, None).await? {
                count += 1;
            }
        }
        Ok(count)
    }
}
