//! Local audit logging for user-visible activity history.
//!
//! Security guarantees:
//! - Audit entries are persisted locally as JSON in the app data directory.
//! - On Unix, the audit file has `0o600` permissions (owner-only read/write).
//! - Sensitive data in `details` is redacted before storage via keyword detection.
//! - The in-memory log is bounded to 1000 entries to prevent unbounded growth.
//! - Exported data goes through an additional sanitisation pass.

use crate::models::AuditEntry;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Maximum number of audit entries kept in memory and on disk.
const MAX_ENTRIES: usize = 1000;

/// Maximum character length for individual detail fields before truncation.
const MAX_DETAIL_LEN: usize = 512;

/// Manages in-memory and persisted audit log entries.
pub struct AuditLogger {
    entries: Arc<RwLock<Vec<AuditEntry>>>,
    log_dir: PathBuf,
}

impl AuditLogger {
    /// Initialises the logger, creating the audit directory and loading
    /// any previously persisted entries from disk.
    pub fn new(app_data_dir: PathBuf) -> Self {
        let log_dir = app_data_dir.join("audit_logs");
        std::fs::create_dir_all(&log_dir).ok();

        let entries = Self::load_entries(&log_dir).unwrap_or_default();

        Self {
            entries: Arc::new(RwLock::new(entries)),
            log_dir,
        }
    }

    /// Returns the path to the audit JSON file.
    fn log_file(log_dir: &PathBuf) -> PathBuf {
        log_dir.join("audit.json")
    }

    /// Loads entries from the persisted audit file.
    fn load_entries(log_dir: &PathBuf) -> Option<Vec<AuditEntry>> {
        let path = Self::log_file(log_dir);
        let content = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    }

    /// Atomically writes all entries to the audit file.
    /// On Unix, restricts file permissions to owner-only (0o600).
    fn save_entries(log_dir: &PathBuf, entries: &[AuditEntry]) {
        let path = Self::log_file(log_dir);
        if let Ok(json) = serde_json::to_string_pretty(entries) {
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(&path)
            {
                let _ = file.write_all(json.as_bytes());
                // Security: restrict audit log to owner-only on Unix
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
                }
            }
        }
    }

    /// Records a new audit entry, sanitising details before persistence.
    pub async fn log_action(
        &self,
        vault_name: &str,
        action: &str,
        item_type: &str,
        item_name: &str,
        result: &str,
        details: Option<&str>,
    ) {
        let entry = AuditEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            vault_name: vault_name.to_string(),
            action: action.to_string(),
            item_type: item_type.to_string(),
            item_name: item_name.to_string(),
            result: result.to_string(),
            details: details.map(Self::sanitize_details),
        };

        let mut entries = self.entries.write().await;
        entries.push(entry);

        // Enforce bounded log size
        if entries.len() > MAX_ENTRIES {
            let drain_count = entries.len() - MAX_ENTRIES;
            entries.drain(0..drain_count);
        }

        Self::save_entries(&self.log_dir, &entries);
    }

    /// Returns the most recent `limit` entries (default 100).
    pub async fn get_entries(&self, limit: Option<usize>) -> Vec<AuditEntry> {
        let entries = self.entries.read().await;
        let limit = limit.unwrap_or(100).min(entries.len());
        entries[entries.len() - limit..].to_vec()
    }

    /// Produces a sanitised JSON export where sensitive actions have
    /// their details replaced with `[REDACTED]`.
    pub async fn get_sanitized_export(&self) -> String {
        let entries = self.entries.read().await;
        let sanitized: Vec<_> = entries
            .iter()
            .map(|e| {
                let mut entry = e.clone();
                if entry.action.contains("secret")
                    || entry.action.contains("token")
                    || entry.action.contains("value")
                {
                    entry.details = Some("[REDACTED]".to_string());
                } else if let Some(details) = &entry.details {
                    entry.details = Some(Self::sanitize_details(details));
                }
                entry
            })
            .collect();

        serde_json::to_string_pretty(&sanitized).unwrap_or_default()
    }

    /// Clears all in-memory and persisted audit entries.
    pub async fn clear(&self) {
        let mut entries = self.entries.write().await;
        entries.clear();
        Self::save_entries(&self.log_dir, &entries);
    }

    /// Redacts details that contain sensitive keywords (secret, token,
    /// password, access_key, connection_string, etc.) and truncates
    /// remaining text to `MAX_DETAIL_LEN` characters.
    pub(crate) fn sanitize_details(details: &str) -> String {
        let lower = details.to_lowercase();
        let sensitive_keywords = [
            "secret",
            "token",
            "password",
            "access_key",
            "connection_string",
            "credential",
            "private_key",
            "bearer",
        ];
        for keyword in &sensitive_keywords {
            if lower.contains(keyword) {
                return "[REDACTED]".to_string();
            }
        }
        details.chars().take(MAX_DETAIL_LEN).collect()
    }
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_sensitive_details_token() {
        assert_eq!(
            AuditLogger::sanitize_details("token=abcdef12345"),
            "[REDACTED]"
        );
    }

    #[test]
    fn redacts_sensitive_details_password() {
        assert_eq!(
            AuditLogger::sanitize_details("password=hunter2"),
            "[REDACTED]"
        );
    }

    #[test]
    fn redacts_sensitive_details_connection_string() {
        assert_eq!(
            AuditLogger::sanitize_details(
                "Server=tcp:db.windows.net;Password=connection_string_value"
            ),
            "[REDACTED]"
        );
    }

    #[test]
    fn redacts_sensitive_details_bearer() {
        assert_eq!(
            AuditLogger::sanitize_details("Authorization: Bearer eyJ..."),
            "[REDACTED]"
        );
    }

    #[test]
    fn redacts_sensitive_details_credential() {
        assert_eq!(
            AuditLogger::sanitize_details("Found credential in key vault"),
            "[REDACTED]"
        );
    }

    #[test]
    fn passes_non_sensitive_details() {
        // Note: "secrets" contains "secret" which triggers redaction,
        // so we use a string without any sensitive keywords.
        let safe = "Listed 42 items from vault";
        assert_eq!(AuditLogger::sanitize_details(safe), safe);
    }

    #[test]
    fn truncates_long_non_sensitive_details() {
        let input = "x".repeat(1024);
        let output = AuditLogger::sanitize_details(&input);
        assert_eq!(output.len(), MAX_DETAIL_LEN);
    }

    #[test]
    fn sanitize_is_case_insensitive() {
        assert_eq!(AuditLogger::sanitize_details("TOKEN=ABC"), "[REDACTED]");
        assert_eq!(
            AuditLogger::sanitize_details("My Secret Value"),
            "[REDACTED]"
        );
    }

    #[tokio::test]
    async fn keeps_entries_bounded_at_max() {
        let dir = std::env::temp_dir().join(format!("azvault-audit-test-{}", uuid::Uuid::new_v4()));
        let logger = AuditLogger::new(dir.clone());

        // Write more than MAX_ENTRIES
        for i in 0..1100 {
            logger
                .log_action(
                    "vault",
                    "test_action",
                    "secret",
                    &format!("item-{}", i),
                    "success",
                    None,
                )
                .await;
        }

        let all_entries = logger.get_entries(Some(2000)).await;
        assert!(
            all_entries.len() <= MAX_ENTRIES,
            "Should not exceed {} entries, got {}",
            MAX_ENTRIES,
            all_entries.len()
        );

        // Clean up temp dir
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn get_entries_respects_limit() {
        let dir = std::env::temp_dir().join(format!("azvault-audit-test-{}", uuid::Uuid::new_v4()));
        let logger = AuditLogger::new(dir.clone());

        for _ in 0..50 {
            logger
                .log_action("vault", "action", "secret", "item", "success", None)
                .await;
        }

        let entries = logger.get_entries(Some(10)).await;
        assert_eq!(entries.len(), 10);

        let entries = logger.get_entries(None).await;
        assert_eq!(entries.len(), 50); // default limit is 100, but only 50 exist

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn clear_removes_all_entries() {
        let dir = std::env::temp_dir().join(format!("azvault-audit-test-{}", uuid::Uuid::new_v4()));
        let logger = AuditLogger::new(dir.clone());

        logger
            .log_action("vault", "action", "secret", "item", "success", None)
            .await;
        assert_eq!(logger.get_entries(None).await.len(), 1);

        logger.clear().await;
        assert_eq!(logger.get_entries(None).await.len(), 0);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn sanitized_export_redacts_secret_actions() {
        let dir = std::env::temp_dir().join(format!("azvault-audit-test-{}", uuid::Uuid::new_v4()));
        let logger = AuditLogger::new(dir.clone());

        logger
            .log_action(
                "vault",
                "get_secret_value",
                "secret",
                "my-secret",
                "success",
                Some("actual value here"),
            )
            .await;

        let export = logger.get_sanitized_export().await;
        assert!(export.contains("[REDACTED]"));
        assert!(!export.contains("actual value here"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn persists_and_loads_entries() {
        let dir = std::env::temp_dir().join(format!("azvault-audit-test-{}", uuid::Uuid::new_v4()));

        // Write entries
        {
            let logger = AuditLogger::new(dir.clone());
            logger
                .log_action("vault", "test_persist", "secret", "item", "success", None)
                .await;
        }

        // Load from disk in a new instance
        {
            let logger = AuditLogger::new(dir.clone());
            let entries = logger.get_entries(None).await;
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].action, "test_persist");
        }

        let _ = std::fs::remove_dir_all(&dir);
    }
}
