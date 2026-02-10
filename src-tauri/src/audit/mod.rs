use crate::models::AuditEntry;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct AuditLogger {
    entries: Arc<RwLock<Vec<AuditEntry>>>,
    log_dir: PathBuf,
}

impl AuditLogger {
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
            std::fs::write(path, json).ok();
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
        let entry = AuditEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            vault_name: vault_name.to_string(),
            action: action.to_string(),
            item_type: item_type.to_string(),
            item_name: item_name.to_string(),
            result: result.to_string(),
            details: details.map(|s| s.to_string()),
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
                if entry.action.contains("get_value") || entry.action.contains("set_secret") {
                    entry.details = Some("[REDACTED]".to_string());
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
}
