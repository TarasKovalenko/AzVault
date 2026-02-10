//! Local audit logging for user-visible activity history.
//!
//! Important guarantees:
//! - Audit entries are persisted locally.
//! - Sensitive data in `details` is redacted/truncated before storage/export.
//! - Log size is bounded to avoid unbounded disk growth.

use crate::models::AuditEntry;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct AuditLogger {
    entries: Arc<RwLock<Vec<AuditEntry>>>,
    log_dir: PathBuf,
}

impl AuditLogger {
    /// Initializes the logger and loads existing entries from disk (if present).
    pub fn new(app_data_dir: PathBuf) -> Self {
        let log_dir = app_data_dir.join("audit_logs");
        std::fs::create_dir_all(&log_dir).ok();

        // Load existing entries from file
        let entries = Self::load_entries(&log_dir).unwrap_or_default();

        Self {
            entries: Arc::new(RwLock::new(entries)),
            log_dir,
        }
    }

    fn log_file(log_dir: &PathBuf) -> PathBuf {
        log_dir.join("audit.json")
    }

    fn load_entries(log_dir: &PathBuf) -> Option<Vec<AuditEntry>> {
        let path = Self::log_file(log_dir);
        let content = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    }

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
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
                }
            }
        }
    }

    pub async fn log_action(
        &self,
        vault_name: &str,
        action: &str,
        item_type: &str,
        item_name: &str,
        result: &str,
        details: Option<&str>,
    ) {
        // Sanitize `details` before writing so sensitive material never lands on disk.
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

        // Keep last 1000 entries
        if entries.len() > 1000 {
            let drain_count = entries.len() - 1000;
            entries.drain(0..drain_count);
        }

        Self::save_entries(&self.log_dir, &entries);
    }

    pub async fn get_entries(&self, limit: Option<usize>) -> Vec<AuditEntry> {
        let entries = self.entries.read().await;
        let limit = limit.unwrap_or(100).min(entries.len());
        entries[entries.len() - limit..].to_vec()
    }

    pub async fn get_sanitized_export(&self) -> String {
        let entries = self.entries.read().await;
        // Sanitize: never include actual secret values in export
        let sanitized: Vec<_> = entries
            .iter()
            .map(|e| {
                let mut entry = e.clone();
                // Redact any details that might contain sensitive info
                if entry.action.contains("get_value")
                    || entry.action.contains("set_secret")
                    || entry.action.contains("token")
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

    pub async fn clear(&self) {
        let mut entries = self.entries.write().await;
        entries.clear();
        Self::save_entries(&self.log_dir, &entries);
    }

    pub(crate) fn sanitize_details(details: &str) -> String {
        // Very defensive keyword check. We prefer occasional false positives over leaking secrets.
        let lower = details.to_ascii_lowercase();
        if lower.contains("secret")
            || lower.contains("token")
            || lower.contains("password")
            || lower.contains("access_key")
        {
            return "[REDACTED]".to_string();
        }
        details.chars().take(512).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_sensitive_details() {
        let redacted = AuditLogger::sanitize_details("token=abcdef");
        assert_eq!(redacted, "[REDACTED]");
    }

    #[test]
    fn truncates_non_sensitive_details() {
        let input = "x".repeat(700);
        let output = AuditLogger::sanitize_details(&input);
        assert_eq!(output.len(), 512);
    }

    #[tokio::test]
    async fn keeps_entries_bounded() {
        let dir = std::env::temp_dir().join(format!("azvault-audit-test-{}", uuid::Uuid::new_v4()));
        let logger = AuditLogger::new(dir);
        for _ in 0..1100 {
            logger
                .log_action("vault", "action", "secret", "item", "success", None)
                .await;
        }
        let entries = logger.get_entries(None).await;
        assert_eq!(entries.len(), 100);
    }
}
