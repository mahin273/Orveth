use orveth_core::error::{OrvethError, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Pool, Sqlite};
use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

pub type DbPool = Pool<Sqlite>;

pub async fn init_db_pool(db_path: impl AsRef<Path>) -> Result<DbPool> {
    let path = db_path.as_ref();
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| {
            OrvethError::Database(format!(
                "Failed to create database directory {}: {e}",
                parent.display()
            ))
        })?;
    }

    let path_str = path
        .to_str()
        .ok_or_else(|| OrvethError::Database("Invalid database path characters".to_string()))?;

    let connection_uri = format!("sqlite://{path_str}?mode=rwc");

    let options = SqliteConnectOptions::from_str(&connection_uri)
        .map_err(|e| OrvethError::Database(format!("Invalid SQLite connection options: {e}")))?
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(options)
        .await
        .map_err(|e| OrvethError::Database(format!("Failed connecting to SQLite database: {e}")))?;

    run_migrations(&pool).await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &DbPool) -> Result<()> {
    let schema_sql = include_str!("../migrations/0001_initial_schema.sql");
    sqlx::raw_sql(schema_sql)
        .execute(pool)
        .await
        .map_err(|e| OrvethError::Database(format!("Failed running initial migrations: {e}")))?;
    Ok(())
}
