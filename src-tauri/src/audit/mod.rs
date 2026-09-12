//! Local audit logging for user-visible activity history.
//!
//! Security guarantees:
//! - Audit entries are persisted locally as JSON in the app data directory.
//! - On Unix, the audit file has `0o600` permissions (owner-only read/write)
//!   and its directory `0o700`, independent of the process umask.
//! - Writes are atomic (temp file + rename), so a crash mid-write cannot
//!   truncate an existing log.
//! - Sensitive data in `details` is redacted before storage via keyword detection.
//! - Every field is truncated at the storage boundary, so no caller can grow
//!   an entry without bound.
//! - The in-memory log is bounded to 1000 entries to prevent unbounded growth,
//!   on the write path *and* on the read path, so a hand-edited file on disk
//!   cannot smuggle oversized or unbounded entries back in.
//! - Exported data goes through an additional sanitisation pass.
//!
//! Durability:
//! - Persistence runs off the async runtime (`spawn_blocking`) and outside the
//!   entries lock, so a burst of commands is not serialised behind `fsync`.
//! - Writes are coalesced: concurrent loggers collapse onto one write of the
//!   newest state rather than one write each. Every entry is still persisted --
//!   a writer always re-reads the latest snapshot before writing, so the last
//!   entry of a burst is included in the final write.
//! - [`AuditLogger::flush`] awaits quiescence and is called on app exit.

use crate::models::AuditEntry;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

/// Maximum number of audit entries kept in memory and on disk.
const MAX_ENTRIES: usize = 1000;

/// Maximum character length for individual detail fields before truncation.
const MAX_DETAIL_LEN: usize = 512;

/// Maximum character length for every other audit field before truncation.
pub(crate) const MAX_FIELD_LEN: usize = 512;

/// Manages in-memory and persisted audit log entries.
pub struct AuditLogger {
    entries: Arc<RwLock<Vec<AuditEntry>>>,
    log_dir: PathBuf,
    /// Bumped on every mutation. A write that records generation N has that
    /// entry (and everything before it) on disk.
    generation: Arc<AtomicU64>,
    /// Serialises writers and records the highest generation persisted.
    /// Doubles as the coalescing point: a writer that finds a newer generation
    /// already on disk has nothing to do.
    persisted: Arc<Mutex<u64>>,
    /// Count of disk writes actually performed; lets tests prove that a burst
    /// of entries is coalesced instead of fsynced once per entry.
    writes: Arc<AtomicU64>,
}

impl AuditLogger {
    /// Initialises the logger, creating the audit directory and loading
    /// any previously persisted entries from disk.
    pub fn new(app_data_dir: PathBuf) -> Self {
        let log_dir = app_data_dir.join("audit_logs");
        Self::create_log_dir(&log_dir);

        let entries = Self::load_entries(&log_dir).unwrap_or_default();

        Self {
            entries: Arc::new(RwLock::new(entries)),
            log_dir,
            generation: Arc::new(AtomicU64::new(0)),
            persisted: Arc::new(Mutex::new(0)),
            writes: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Number of times the audit file has been written by this logger.
    #[cfg(test)]
    pub(crate) fn write_count(&self) -> u64 {
        self.writes.load(Ordering::SeqCst)
    }

    /// A detachable handle over the shared state, so a background write does
    /// not need to borrow `&self`.
    fn writer(&self) -> AuditWriter {
        AuditWriter {
            entries: Arc::clone(&self.entries),
            log_dir: self.log_dir.clone(),
            generation: Arc::clone(&self.generation),
            persisted: Arc::clone(&self.persisted),
            writes: Arc::clone(&self.writes),
        }
    }

    /// Creates the audit directory, owner-only on Unix.
    ///
    /// `create_dir_all` alone would apply the process umask, which in a
    /// GUI-launched app is whatever the launching environment happened to set.
    fn create_log_dir(log_dir: &Path) {
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            let mut builder = std::fs::DirBuilder::new();
            builder.recursive(true).mode(0o700);
            let _ = builder.create(log_dir);
            // A directory created by an earlier version (or by the parent
            // `create_dir_all`) may still be group/world readable.
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(log_dir, std::fs::Permissions::from_mode(0o700));
        }
        #[cfg(not(unix))]
        {
            let _ = std::fs::create_dir_all(log_dir);
        }
    }

    /// Returns the path to the audit JSON file.
    fn log_file(log_dir: &Path) -> PathBuf {
        log_dir.join("audit.json")
    }

    /// Loads entries from the persisted audit file.
    ///
    /// The file is not a trusted input: it can be hand-edited, or written by a
    /// build with different limits. The same bounds the writer enforces are
    /// re-applied here, so the "truncated at the storage boundary" guarantee
    /// holds for the read path too and a doctored file cannot reintroduce
    /// unbounded fields or an unbounded entry count.
    fn load_entries(log_dir: &Path) -> Option<Vec<AuditEntry>> {
        let path = Self::log_file(log_dir);
        let content = std::fs::read_to_string(path).ok()?;
        let entries: Vec<AuditEntry> = serde_json::from_str(&content).ok()?;
        Some(Self::bound_loaded_entries(entries))
    }

    /// Applies the storage-boundary limits to entries read from disk.
    pub(crate) fn bound_loaded_entries(mut entries: Vec<AuditEntry>) -> Vec<AuditEntry> {
        if entries.len() > MAX_ENTRIES {
            let drain_count = entries.len() - MAX_ENTRIES;
            entries.drain(0..drain_count);
        }

        entries
            .into_iter()
            .map(|entry| AuditEntry {
                timestamp: Self::truncate_field(&entry.timestamp),
                vault_name: Self::truncate_field(&entry.vault_name),
                action: Self::truncate_field(&entry.action),
                item_type: Self::truncate_field(&entry.item_type),
                item_name: Self::truncate_field(&entry.item_name),
                result: Self::truncate_field(&entry.result),
                details: entry.details.as_deref().map(Self::sanitize_details),
            })
            .collect()
    }

    /// Atomically replaces the audit file with `entries`.
    ///
    /// The payload is written to a fresh temp file in the same directory,
    /// flushed to disk, and then `rename`d over the target. Truncating the
    /// real file in place would mean that a crash between truncate and write
    /// leaves an empty or half-written file, which `load_entries` silently
    /// recovers as "no history at all".
    ///
    /// On Unix the temp file is created 0o600, so the contents are never
    /// briefly readable by anyone else.
    ///
    /// Returns `false` when nothing reached disk, so the caller can keep the
    /// state dirty and retry instead of reporting a write that never happened.
    /// Blocking I/O: call it from `spawn_blocking`, never from an async task.
    fn save_entries(log_dir: &Path, entries: &[AuditEntry]) -> bool {
        let json = match serde_json::to_string_pretty(entries) {
            Ok(json) => json,
            Err(error) => {
                log::warn!("Audit log could not be serialised, not persisted: {error}");
                return false;
            }
        };
        let path = Self::log_file(log_dir);
        let temp_path = log_dir.join(format!("audit.json.{}.tmp", uuid::Uuid::new_v4()));

        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }

        let written = match options.open(&temp_path) {
            Ok(mut file) => file
                .write_all(json.as_bytes())
                .and_then(|_| file.sync_all())
                .is_ok(),
            Err(error) => {
                // Silence here meant the entry stayed in memory, the user saw a
                // success toast, and nothing ever reached disk.
                log::warn!("Audit log temp file could not be created: {error}");
                false
            }
        };

        if !written || std::fs::rename(&temp_path, &path).is_err() {
            log::warn!("Audit log could not be persisted to {}", path.display());
            // Never leave the scratch file behind holding audit data.
            let _ = std::fs::remove_file(&temp_path);
            return false;
        }

        // Belt and braces: an existing file replaced by rename carries the
        // temp file's mode, but re-assert it in case of an odd filesystem.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }

        true
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
        // Security: truncation and detail sanitisation happen here, at the
        // storage boundary, so every caller is covered regardless of where the
        // strings came from.
        let action_for_durability = action.to_string();
        let entry = AuditEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            vault_name: Self::truncate_field(vault_name),
            action: Self::truncate_field(action),
            item_type: Self::truncate_field(item_type),
            item_name: Self::truncate_field(item_name),
            result: Self::truncate_field(result),
            details: details.map(Self::sanitize_details),
        };

        let generation = {
            let mut entries = self.entries.write().await;
            entries.push(entry);

            // Enforce bounded log size
            if entries.len() > MAX_ENTRIES {
                let drain_count = entries.len() - MAX_ENTRIES;
                entries.drain(0..drain_count);
            }

            // The guard is dropped here, before any I/O: serialising 1000
            // entries and fsyncing them while holding the write lock blocked
            // every concurrent reader and logger for the duration.
            self.generation.fetch_add(1, Ordering::SeqCst) + 1
        };

        // Reads are coalesced, but anything that changed the vault (or ended the
        // session) is written before the caller is told it succeeded: a crash
        // must not be able to swallow the record of a delete or a purge.
        if Self::is_durable_action(&action_for_durability) {
            self.writer().persist(generation).await;
        } else {
            self.writer().persist_in_background(generation);
        }
    }

    /// Actions whose audit record must survive a crash that happens immediately
    /// afterwards: every mutation, plus value reads and session changes.
    pub(crate) fn is_durable_action(action: &str) -> bool {
        const DURABLE: [&str; 8] = [
            "set", "delete", "recover", "purge", "value", "sign_out", "clear", "import",
        ];
        DURABLE.iter().any(|verb| action.contains(verb))
    }

    /// Persists any unwritten entries and returns once they are on disk.
    ///
    /// Called on app exit and by tests; also safe to call at any time.
    pub async fn flush(&self) {
        let target = self.generation.load(Ordering::SeqCst);
        self.writer().persist(target).await;
    }

    /// Returns the most recent `limit` entries (default 100).
    pub async fn get_entries(
        &self,
        limit: Option<usize>,
        vault_name: Option<&str>,
    ) -> Vec<AuditEntry> {
        let entries = self.entries.read().await;
        let mut matching: Vec<_> = entries
            .iter()
            .rev()
            .filter(|entry| matches_vault(entry, vault_name))
            .take(limit.unwrap_or(100))
            .cloned()
            .collect();
        matching.reverse();
        matching
    }

    /// Produces a sanitised JSON export where sensitive actions have
    /// their details replaced with `[REDACTED]`.
    pub async fn get_sanitized_export(&self, vault_name: Option<&str>) -> String {
        let entries = self.entries.read().await;
        let sanitized: Vec<_> = entries
            .iter()
            .filter(|entry| matches_vault(entry, vault_name))
            .map(Self::sanitize_entry_for_export)
            .collect();

        serde_json::to_string_pretty(&sanitized).unwrap_or_default()
    }

    /// Clears all in-memory and persisted audit entries.
    pub async fn clear(&self, vault_name: Option<&str>) {
        let generation = {
            let mut entries = self.entries.write().await;
            if let Some(vault_name) = vault_name {
                entries.retain(|entry| entry.vault_name != vault_name);
            } else {
                entries.clear();
            }
            self.generation.fetch_add(1, Ordering::SeqCst) + 1
        };

        // A clear is user-visible and destructive: wait for it to land rather
        // than reporting success over a write that may never happen.
        self.writer().persist(generation).await;
    }

    /// Returns `true` when an audit action is sensitive enough that its
    /// `details` must never be exported verbatim.
    pub(crate) fn is_sensitive_action(action: &str) -> bool {
        action.contains("secret") || action.contains("token") || action.contains("value")
    }

    /// Returns an export-safe copy of an audit entry: details for sensitive
    /// actions become `[REDACTED]`, everything else is keyword-sanitised.
    pub(crate) fn sanitize_entry_for_export(entry: &AuditEntry) -> AuditEntry {
        let mut entry = entry.clone();
        if Self::is_sensitive_action(&entry.action) {
            entry.details = Some("[REDACTED]".to_string());
        } else if let Some(details) = &entry.details {
            entry.details = Some(Self::sanitize_details(details));
        }
        entry
    }

    /// Truncates an audit field to `MAX_FIELD_LEN` characters.
    ///
    /// Counts `char`s, not bytes, so a multi-byte string is never cut mid
    /// code point.
    pub(crate) fn truncate_field(value: &str) -> String {
        value.chars().take(MAX_FIELD_LEN).collect()
    }

    /// Redacts details that contain sensitive keywords (secret, token,
    /// password, value, api_key, access_key, connection_string, etc.) and
    /// truncates remaining text to `MAX_DETAIL_LEN` characters.
    ///
    /// The list is deliberately broad: a false redaction costs a line of
    /// diagnostics, a missed one writes key material to disk.
    pub(crate) fn sanitize_details(details: &str) -> String {
        let lower = details.to_lowercase();
        let sensitive_keywords = [
            "secret",
            "token",
            "password",
            "passphrase",
            "value",
            "api_key",
            "apikey",
            "access_key",
            "connection_string",
            "credential",
            "private_key",
            "bearer",
            "sas",
            "pfx",
            "pem",
        ];
        for keyword in &sensitive_keywords {
            if lower.contains(keyword) {
                return "[REDACTED]".to_string();
            }
        }
        details.chars().take(MAX_DETAIL_LEN).collect()
    }
}

/// Detached handle used to persist the audit log without borrowing the logger.
#[derive(Clone)]
struct AuditWriter {
    entries: Arc<RwLock<Vec<AuditEntry>>>,
    log_dir: PathBuf,
    generation: Arc<AtomicU64>,
    persisted: Arc<Mutex<u64>>,
    writes: Arc<AtomicU64>,
}

impl AuditWriter {
    /// Schedules a write for `target` without waiting for it.
    ///
    /// The IPC command that produced the entry returns immediately; the write
    /// lands a moment later on a blocking thread.
    fn persist_in_background(self, target: u64) {
        tokio::spawn(async move { self.persist(target).await });
    }

    /// Ensures generation `target` (or newer) is on disk.
    ///
    /// Coalescing works through the `persisted` mutex: the first writer takes
    /// it and writes the newest snapshot, everyone queued behind it finds a
    /// generation at or past their own already persisted and returns without
    /// touching the disk. A hundred bulk-delete entries therefore cost a couple
    /// of writes, not a hundred fsyncs -- while the snapshot is always re-read
    /// inside the lock, so the last entry of a burst is never the one left
    /// unwritten.
    async fn persist(&self, target: u64) {
        let mut persisted = self.persisted.lock().await;
        if *persisted >= target {
            return;
        }

        let (snapshot, generation) = {
            let entries = self.entries.read().await;
            (entries.clone(), self.generation.load(Ordering::SeqCst))
        };

        let log_dir = self.log_dir.clone();
        let written =
            tokio::task::spawn_blocking(move || AuditLogger::save_entries(&log_dir, &snapshot))
                .await
                .unwrap_or(false);

        self.writes.fetch_add(1, Ordering::SeqCst);
        if written {
            *persisted = generation;
        }
        // On failure `persisted` is left behind, so the next entry (or the
        // exit flush) retries instead of assuming the log is durable.
    }
}

/// Returns `true` when `entry` belongs to `vault_name`, or when no vault
/// filter was supplied.
fn matches_vault(entry: &AuditEntry, vault_name: Option<&str>) -> bool {
    match vault_name {
        Some(vault) => entry.vault_name == vault,
        None => true,
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

        let all_entries = logger.get_entries(Some(2000), None).await;
        // `<=` here would also pass if the logger dropped everything: the log
        // must be trimmed *to* the cap, not below it.
        assert_eq!(
            all_entries.len(),
            MAX_ENTRIES,
            "the log must be bounded at exactly {MAX_ENTRIES} entries"
        );
        assert_eq!(all_entries.first().unwrap().item_name, "item-100");
        assert_eq!(all_entries.last().unwrap().item_name, "item-1099");

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

        let entries = logger.get_entries(Some(10), None).await;
        assert_eq!(entries.len(), 10);

        let entries = logger.get_entries(None, None).await;
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
        assert_eq!(logger.get_entries(None, None).await.len(), 1);

        logger.clear(None).await;
        assert_eq!(logger.get_entries(None, None).await.len(), 0);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn scopes_read_export_and_clear_to_vault() {
        let dir = std::env::temp_dir().join(format!("azvault-audit-test-{}", uuid::Uuid::new_v4()));
        let logger = AuditLogger::new(dir.clone());

        logger
            .log_action("vault-a", "list", "secret", "a", "success", None)
            .await;
        logger
            .log_action("vault-b", "list", "secret", "b", "success", None)
            .await;

        let scoped = logger.get_entries(None, Some("vault-a")).await;
        assert_eq!(scoped.len(), 1);
        assert_eq!(scoped[0].vault_name, "vault-a");
        assert!(!logger
            .get_sanitized_export(Some("vault-a"))
            .await
            .contains("vault-b"));

        logger.clear(Some("vault-a")).await;
        assert!(logger.get_entries(None, Some("vault-a")).await.is_empty());
        assert_eq!(logger.get_entries(None, Some("vault-b")).await.len(), 1);

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

        let export = logger.get_sanitized_export(None).await;
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
            logger.flush().await;
        }

        // Load from disk in a new instance
        {
            let logger = AuditLogger::new(dir.clone());
            let entries = logger.get_entries(None, None).await;
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].action, "test_persist");
        }

        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod redaction_tests {
    use super::*;

    #[test]
    fn sanitize_details_redaction_table() {
        let must_redact = [
            "token=abc",
            "TOKEN=ABC",
            "Token",
            "my secret",
            "SECRET",
            "password=hunter2",
            "PassWord",
            "access_key=AKIA",
            "connection_string=Server=x",
            "credential",
            "CREDENTIALS were rotated",
            "private_key",
            "Authorization: Bearer eyJ",
            "bearer",
            // substring matches count too
            "the tokenizer failed",
            "secretary notes",
            // keywords added after review: these all name key material that
            // a caller could otherwise have written to disk verbatim
            "value=CORRECT-HORSE",
            "Value: hunter2",
            "api_key=abc123",
            "APIKEY=abc123",
            "passphrase=letmein",
            "sas=?sv=2021&sig=abc",
            "cert.pfx contents",
            "-----BEGIN CERTIFICATE----- (pem)",
        ];
        for input in must_redact {
            assert_eq!(
                AuditLogger::sanitize_details(input),
                "[REDACTED]",
                "input={input:?} must be redacted"
            );
        }

        let must_pass = [
            "Listed 42 items from vault",
            "user signed out",
            "certificate expired",
            "key rotation completed",
            "",
            "404 not found",
        ];
        for input in must_pass {
            assert_eq!(
                AuditLogger::sanitize_details(input),
                input,
                "input={input:?} should pass through"
            );
        }
    }

    #[test]
    fn sanitize_details_truncates_at_char_boundary() {
        // Multi-byte characters must not be split mid-code-point.
        let input = "é".repeat(1024);
        let output = AuditLogger::sanitize_details(&input);
        assert_eq!(output.chars().count(), MAX_DETAIL_LEN);
        assert_eq!(output.len(), MAX_DETAIL_LEN * 2);
    }

    #[test]
    fn sanitize_details_boundary_lengths() {
        for len in [MAX_DETAIL_LEN - 1, MAX_DETAIL_LEN, MAX_DETAIL_LEN + 1] {
            let output = AuditLogger::sanitize_details(&"x".repeat(len));
            assert_eq!(output.len(), len.min(MAX_DETAIL_LEN), "len={len}");
        }
    }

    #[test]
    fn long_sensitive_details_are_redacted_not_truncated() {
        let input = format!("{}token", "x".repeat(5000));
        assert_eq!(AuditLogger::sanitize_details(&input), "[REDACTED]");
    }

    #[test]
    fn is_sensitive_action_table() {
        let sensitive = [
            "get_secret_value",
            "set_secret",
            "delete_secret",
            "purge_secret",
            "list_secrets",
            "refresh_token",
            "read_value",
        ];
        for action in sensitive {
            assert!(AuditLogger::is_sensitive_action(action), "{action}");
        }

        let benign = [
            "sign_out",
            "list_keys",
            "list_certificates",
            "list_keyvaults",
        ];
        for action in benign {
            assert!(!AuditLogger::is_sensitive_action(action), "{action}");
        }
    }

    fn entry(action: &str, details: Option<&str>) -> AuditEntry {
        AuditEntry {
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            vault_name: "v".to_string(),
            action: action.to_string(),
            item_type: "secret".to_string(),
            item_name: "i".to_string(),
            result: "success".to_string(),
            details: details.map(str::to_string),
        }
    }

    #[test]
    fn export_sanitiser_redacts_sensitive_actions_even_with_benign_details() {
        let out = AuditLogger::sanitize_entry_for_export(&entry(
            "get_secret_value",
            Some("harmless looking text"),
        ));
        assert_eq!(out.details.as_deref(), Some("[REDACTED]"));
    }

    #[test]
    fn export_sanitiser_stamps_redaction_on_sensitive_action_without_details() {
        let out = AuditLogger::sanitize_entry_for_export(&entry("set_secret", None));
        assert_eq!(out.details.as_deref(), Some("[REDACTED]"));
    }

    #[test]
    fn export_sanitiser_keyword_scans_benign_actions() {
        let out =
            AuditLogger::sanitize_entry_for_export(&entry("list_keys", Some("bearer eyJleak")));
        assert_eq!(out.details.as_deref(), Some("[REDACTED]"));

        let out = AuditLogger::sanitize_entry_for_export(&entry("list_keys", Some("found 3")));
        assert_eq!(out.details.as_deref(), Some("found 3"));

        let out = AuditLogger::sanitize_entry_for_export(&entry("list_keys", None));
        assert!(out.details.is_none());
    }

    #[test]
    fn export_sanitiser_preserves_non_detail_fields() {
        let original = entry("get_secret_value", Some("x"));
        let out = AuditLogger::sanitize_entry_for_export(&original);
        assert_eq!(out.timestamp, original.timestamp);
        assert_eq!(out.vault_name, original.vault_name);
        assert_eq!(out.action, original.action);
        assert_eq!(out.item_type, original.item_type);
        assert_eq!(out.item_name, original.item_name);
        assert_eq!(out.result, original.result);
    }

    #[test]
    fn matches_vault_filter() {
        let e = entry("a", None);
        assert!(matches_vault(&e, None));
        assert!(matches_vault(&e, Some("v")));
        assert!(!matches_vault(&e, Some("other")));
        assert!(!matches_vault(&e, Some("V")), "matching is case sensitive");
        assert!(!matches_vault(&e, Some("")));
    }
}

#[cfg(test)]
mod logger_tests {
    use super::*;

    /// Temp directory that cleans itself up when the test ends.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let dir =
                std::env::temp_dir().join(format!("azvault-audit-test-{}", uuid::Uuid::new_v4()));
            Self(dir)
        }
        fn path(&self) -> PathBuf {
            self.0.clone()
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[tokio::test]
    async fn new_logger_starts_empty_and_creates_the_directory() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        assert!(logger.get_entries(None, None).await.is_empty());
        assert!(dir.path().join("audit_logs").is_dir());
    }

    #[tokio::test]
    async fn log_action_records_every_field() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger
            .log_action(
                "vault-a",
                "list_keys",
                "key",
                "my-key",
                "success",
                Some("3 found"),
            )
            .await;

        let entries = logger.get_entries(None, None).await;
        assert_eq!(entries.len(), 1);
        let e = &entries[0];
        assert_eq!(e.vault_name, "vault-a");
        assert_eq!(e.action, "list_keys");
        assert_eq!(e.item_type, "key");
        assert_eq!(e.item_name, "my-key");
        assert_eq!(e.result, "success");
        assert_eq!(e.details.as_deref(), Some("3 found"));
        assert!(
            chrono::DateTime::parse_from_rfc3339(&e.timestamp).is_ok(),
            "timestamp must be RFC 3339: {}",
            e.timestamp
        );
    }

    #[tokio::test]
    async fn log_action_redacts_sensitive_details_before_they_reach_memory_or_disk() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger
            .log_action(
                "v",
                "set_secret",
                "secret",
                "db",
                "success",
                Some("password=hunter2"),
            )
            .await;
        logger.flush().await;

        assert_eq!(
            logger.get_entries(None, None).await[0].details.as_deref(),
            Some("[REDACTED]")
        );

        let on_disk =
            std::fs::read_to_string(dir.path().join("audit_logs").join("audit.json")).unwrap();
        assert!(
            !on_disk.contains("hunter2"),
            "secret material must never be persisted: {on_disk}"
        );
    }

    #[tokio::test]
    async fn entries_are_returned_in_chronological_order() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        for i in 0..5 {
            logger
                .log_action("v", "a", "t", &format!("item-{i}"), "success", None)
                .await;
        }

        let entries = logger.get_entries(None, None).await;
        let names: Vec<&str> = entries.iter().map(|e| e.item_name.as_str()).collect();
        assert_eq!(names, ["item-0", "item-1", "item-2", "item-3", "item-4"]);
    }

    #[tokio::test]
    async fn limit_returns_the_most_recent_entries_in_order() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        for i in 0..10 {
            logger
                .log_action("v", "a", "t", &format!("item-{i}"), "success", None)
                .await;
        }

        let entries = logger.get_entries(Some(3), None).await;
        let names: Vec<&str> = entries.iter().map(|e| e.item_name.as_str()).collect();
        assert_eq!(names, ["item-7", "item-8", "item-9"]);
    }

    #[tokio::test]
    async fn limit_boundaries() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        for i in 0..3 {
            logger
                .log_action("v", "a", "t", &format!("{i}"), "success", None)
                .await;
        }

        assert!(logger.get_entries(Some(0), None).await.is_empty());
        assert_eq!(logger.get_entries(Some(1), None).await.len(), 1);
        assert_eq!(logger.get_entries(Some(3), None).await.len(), 3);
        assert_eq!(logger.get_entries(Some(999), None).await.len(), 3);
        assert_eq!(logger.get_entries(Some(usize::MAX), None).await.len(), 3);
    }

    #[tokio::test]
    async fn ring_buffer_drops_oldest_entries_first() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        for i in 0..(MAX_ENTRIES + 5) {
            logger
                .log_action("v", "a", "t", &format!("item-{i}"), "success", None)
                .await;
        }

        let entries = logger.get_entries(Some(usize::MAX), None).await;
        assert_eq!(entries.len(), MAX_ENTRIES);
        assert_eq!(entries.first().unwrap().item_name, "item-5");
        assert_eq!(
            entries.last().unwrap().item_name,
            format!("item-{}", MAX_ENTRIES + 4)
        );
    }

    #[tokio::test]
    async fn exactly_max_entries_is_not_trimmed() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        for i in 0..MAX_ENTRIES {
            logger
                .log_action("v", "a", "t", &format!("item-{i}"), "success", None)
                .await;
        }
        let entries = logger.get_entries(Some(usize::MAX), None).await;
        assert_eq!(entries.len(), MAX_ENTRIES);
        assert_eq!(entries.first().unwrap().item_name, "item-0");
    }

    #[tokio::test]
    async fn vault_scoped_reads_and_clears() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger.log_action("a", "x", "t", "1", "success", None).await;
        logger.log_action("b", "x", "t", "2", "success", None).await;
        logger.log_action("a", "x", "t", "3", "success", None).await;

        assert_eq!(logger.get_entries(None, Some("a")).await.len(), 2);
        assert_eq!(logger.get_entries(None, Some("b")).await.len(), 1);
        assert!(logger.get_entries(None, Some("missing")).await.is_empty());

        logger.clear(Some("a")).await;
        assert!(logger.get_entries(None, Some("a")).await.is_empty());
        assert_eq!(logger.get_entries(None, None).await.len(), 1);

        logger.clear(None).await;
        assert!(logger.get_entries(None, None).await.is_empty());
    }

    #[tokio::test]
    async fn clearing_an_unknown_vault_is_a_no_op() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger.log_action("a", "x", "t", "1", "success", None).await;
        logger.clear(Some("nonexistent")).await;
        assert_eq!(logger.get_entries(None, None).await.len(), 1);
    }

    #[tokio::test]
    async fn clear_is_persisted_to_disk() {
        let dir = TempDir::new();
        {
            let logger = AuditLogger::new(dir.path());
            logger.log_action("a", "x", "t", "1", "success", None).await;
            logger.clear(None).await;
        }
        let logger = AuditLogger::new(dir.path());
        assert!(logger.get_entries(None, None).await.is_empty());
    }

    #[tokio::test]
    async fn export_is_valid_json_and_round_trips() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger
            .log_action("v", "list_keys", "key", "k", "success", Some("2 found"))
            .await;

        let export = logger.get_sanitized_export(None).await;
        let parsed: Vec<AuditEntry> = serde_json::from_str(&export).expect("valid JSON export");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].details.as_deref(), Some("2 found"));
        assert!(export.contains("vaultName"), "export uses camelCase keys");
    }

    #[tokio::test]
    async fn empty_export_is_an_empty_json_array() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        assert_eq!(logger.get_sanitized_export(None).await, "[]");
        assert_eq!(logger.get_sanitized_export(Some("nope")).await, "[]");
    }

    #[tokio::test]
    async fn export_never_leaks_secret_material() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        for action in ["get_secret_value", "set_secret", "refresh_token"] {
            logger
                .log_action(
                    "v",
                    action,
                    "secret",
                    "s",
                    "success",
                    Some("p@ssw0rd-value"),
                )
                .await;
        }

        let export = logger.get_sanitized_export(None).await;
        assert!(!export.contains("p@ssw0rd-value"), "{export}");
        assert_eq!(export.matches("[REDACTED]").count(), 3);
    }

    #[tokio::test]
    async fn export_respects_vault_scope() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger
            .log_action("vault-a", "list_keys", "key", "ka", "success", None)
            .await;
        logger
            .log_action("vault-b", "list_keys", "key", "kb", "success", None)
            .await;

        let export = logger.get_sanitized_export(Some("vault-a")).await;
        assert!(export.contains("vault-a"));
        assert!(!export.contains("vault-b"));
    }

    #[tokio::test]
    async fn entries_survive_a_restart_with_order_intact() {
        let dir = TempDir::new();
        {
            let logger = AuditLogger::new(dir.path());
            for i in 0..3 {
                logger
                    .log_action("v", "a", "t", &format!("item-{i}"), "success", None)
                    .await;
            }
            logger.flush().await;
        }
        let logger = AuditLogger::new(dir.path());
        let names: Vec<String> = logger
            .get_entries(None, None)
            .await
            .into_iter()
            .map(|e| e.item_name)
            .collect();
        assert_eq!(names, ["item-0", "item-1", "item-2"]);

        // appending after a reload keeps the history
        logger
            .log_action("v", "a", "t", "item-3", "success", None)
            .await;
        assert_eq!(logger.get_entries(None, None).await.len(), 4);
    }

    #[tokio::test]
    async fn corrupt_audit_file_degrades_to_an_empty_log() {
        let dir = TempDir::new();
        let log_dir = dir.path().join("audit_logs");
        std::fs::create_dir_all(&log_dir).unwrap();
        std::fs::write(log_dir.join("audit.json"), "{ this is not valid json").unwrap();

        let logger = AuditLogger::new(dir.path());
        assert!(logger.get_entries(None, None).await.is_empty());

        // and the logger stays usable afterwards
        logger.log_action("v", "a", "t", "i", "success", None).await;
        assert_eq!(logger.get_entries(None, None).await.len(), 1);
    }

    #[tokio::test]
    async fn json_of_wrong_shape_degrades_to_an_empty_log() {
        let dir = TempDir::new();
        let log_dir = dir.path().join("audit_logs");
        std::fs::create_dir_all(&log_dir).unwrap();
        std::fs::write(log_dir.join("audit.json"), r#"{"not":"an array"}"#).unwrap();

        let logger = AuditLogger::new(dir.path());
        assert!(logger.get_entries(None, None).await.is_empty());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn audit_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;

        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger.log_action("v", "a", "t", "i", "success", None).await;
        logger.flush().await;

        let path = dir.path().join("audit_logs").join("audit.json");
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "audit log must not be readable by others");
    }

    #[tokio::test]
    async fn concurrent_writers_do_not_lose_entries() {
        let dir = TempDir::new();
        let logger = Arc::new(AuditLogger::new(dir.path()));

        let mut handles = Vec::new();
        for i in 0..25 {
            let logger = logger.clone();
            handles.push(tokio::spawn(async move {
                logger
                    .log_action("v", "a", "t", &format!("item-{i}"), "success", None)
                    .await;
            }));
        }
        for handle in handles {
            handle.await.unwrap();
        }

        assert_eq!(logger.get_entries(Some(usize::MAX), None).await.len(), 25);
    }

    #[tokio::test]
    async fn every_field_is_truncated_at_the_storage_boundary() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        let long = "x".repeat(4096);
        logger
            .log_action(&long, &long, &long, &long, &long, Some(&long))
            .await;

        let entries = logger.get_entries(None, None).await;
        let e = &entries[0];
        for field in [
            &e.vault_name,
            &e.action,
            &e.item_type,
            &e.item_name,
            &e.result,
        ] {
            assert_eq!(field.chars().count(), MAX_FIELD_LEN, "{field}");
        }
        assert_eq!(entries[0].details.as_ref().unwrap().len(), MAX_DETAIL_LEN);
    }

    #[tokio::test]
    async fn truncation_respects_char_boundaries() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        let long = "é".repeat(4096);
        logger
            .log_action(&long, "a", "t", "i", "success", None)
            .await;

        let entries = logger.get_entries(None, None).await;
        assert_eq!(entries[0].vault_name.chars().count(), MAX_FIELD_LEN);
    }

    #[test]
    fn truncate_field_boundaries() {
        for len in [0, 1, MAX_FIELD_LEN - 1, MAX_FIELD_LEN, MAX_FIELD_LEN + 1] {
            let out = AuditLogger::truncate_field(&"a".repeat(len));
            assert_eq!(out.len(), len.min(MAX_FIELD_LEN), "len={len}");
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn audit_directory_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger.log_action("v", "a", "t", "i", "success", None).await;

        let mode = std::fs::metadata(dir.path().join("audit_logs"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(
            mode, 0o700,
            "audit directory must not be group/world readable"
        );
    }

    #[tokio::test]
    async fn saving_leaves_no_temp_files_behind() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        for i in 0..5 {
            logger
                .log_action("v", "a", "t", &format!("i{i}"), "success", None)
                .await;
        }
        logger.flush().await;

        let leftovers: Vec<_> = std::fs::read_dir(dir.path().join("audit_logs"))
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }

    /// A write that never completes must leave the previous log untouched.
    ///
    /// The property only holds because the payload is staged in a temp file and
    /// `rename`d over the target. A `File::create` on the real path would have
    /// truncated the good log *before* discovering it could not write, which is
    /// exactly the failure this test reproduces: the directory is made
    /// read-only, so creating the temp file fails while the existing
    /// `audit.json` itself stays writable (and so stays truncatable).
    #[cfg(unix)]
    #[tokio::test]
    async fn a_failed_write_never_replaces_a_good_log() {
        use std::os::unix::fs::PermissionsExt;

        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger
            .log_action("v", "first", "t", "i", "success", None)
            .await;
        logger.flush().await;

        let log_dir = dir.path().join("audit_logs");
        let path = log_dir.join("audit.json");
        let before = std::fs::read_to_string(&path).unwrap();
        assert!(before.contains("first"));

        // Read + execute only: no new entries may be created in the directory.
        std::fs::set_permissions(&log_dir, std::fs::Permissions::from_mode(0o500)).unwrap();

        // Root ignores the mode bits; there is nothing to reproduce there.
        let root = std::fs::File::create(log_dir.join("root-probe")).is_ok();
        if root {
            let _ = std::fs::remove_file(log_dir.join("root-probe"));
            std::fs::set_permissions(&log_dir, std::fs::Permissions::from_mode(0o700)).unwrap();
            return;
        }

        let replacement = vec![AuditEntry {
            timestamp: "2026-01-01T00:00:00Z".to_string(),
            vault_name: "v".to_string(),
            action: "second".to_string(),
            item_type: "t".to_string(),
            item_name: "i".to_string(),
            result: "success".to_string(),
            details: None,
        }];
        assert!(
            !AuditLogger::save_entries(&log_dir, &replacement),
            "a write that cannot stage its payload must report failure"
        );

        // The old log is byte-for-byte intact: not truncated, not half-written.
        let after = std::fs::read_to_string(&path).unwrap();
        assert_eq!(
            after, before,
            "the good log was clobbered by a failed write"
        );

        std::fs::set_permissions(&log_dir, std::fs::Permissions::from_mode(0o700)).unwrap();

        // No scratch file was left holding audit data either.
        let leftovers: Vec<_> = std::fs::read_dir(&log_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");

        // A reload sees the complete original log, not an empty recovery.
        let reloaded = AuditLogger::new(dir.path());
        let entries = reloaded.get_entries(None, None).await;
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].action, "first");
    }

    #[tokio::test]
    async fn a_successful_write_replaces_the_log_wholesale() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger
            .log_action("v", "first", "t", "i", "success", None)
            .await;
        logger.flush().await;
        logger
            .log_action("v", "second", "t", "i", "success", None)
            .await;
        logger.flush().await;

        let after =
            std::fs::read_to_string(dir.path().join("audit_logs").join("audit.json")).unwrap();
        assert!(after.contains("first") && after.contains("second"));

        let reloaded = AuditLogger::new(dir.path());
        assert_eq!(reloaded.get_entries(None, None).await.len(), 2);
    }
}

#[cfg(test)]
mod persistence_tests {
    use super::*;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            Self(
                std::env::temp_dir()
                    .join(format!("azvault-audit-persist-{}", uuid::Uuid::new_v4())),
            )
        }
        fn path(&self) -> PathBuf {
            self.0.clone()
        }
        fn log_file(&self) -> PathBuf {
            self.0.join("audit_logs").join("audit.json")
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[tokio::test]
    async fn a_mutation_is_on_disk_before_log_action_returns() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());

        logger
            .log_action("v", "delete_secret", "secret", "doomed", "success", None)
            .await;

        // No flush: a crash right here must still leave the record behind.
        let raw =
            std::fs::read_to_string(dir.path().join("audit_logs").join("audit.json")).unwrap();
        assert!(raw.contains("doomed"), "delete was not durable: {raw}");
    }

    #[tokio::test]
    async fn reads_are_coalesced_rather_than_written_one_by_one() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());

        for i in 0..20 {
            logger
                .log_action(
                    "v",
                    "list_secrets",
                    "secret",
                    &format!("s{i}"),
                    "success",
                    None,
                )
                .await;
        }

        // Flush first: non-durable entries are dispatched with `tokio::spawn`,
        // so without awaiting quiescence the spawned writes need never have run
        // and a write count of zero would "prove" coalescing for free.
        logger.flush().await;

        assert!(
            logger.write_count() <= 2,
            "expected reads to coalesce into at most 2 writes, got {}",
            logger.write_count()
        );
        assert_eq!(logger.get_entries(Some(100), None).await.len(), 20);

        // Coalescing is only correct if the entries actually reached disk.
        let on_disk = std::fs::read_to_string(dir.log_file()).unwrap();
        let persisted: Vec<AuditEntry> = serde_json::from_str(&on_disk).unwrap();
        assert_eq!(
            persisted.len(),
            20,
            "coalesced entries must still be on disk"
        );
        assert_eq!(persisted[0].item_name, "s0");
        assert_eq!(persisted[19].item_name, "s19");
    }

    #[test]
    fn durable_actions_cover_every_mutation_and_value_read() {
        for action in [
            "set_secret",
            "delete_secret",
            "recover_secret",
            "purge_secret",
            "get_secret_value",
            "sign_out",
            "clear_audit_log",
            "import_secrets",
        ] {
            assert!(
                AuditLogger::is_durable_action(action),
                "{action} should be written durably"
            );
        }
        for action in [
            "list_secrets",
            "list_keys",
            "get_secret_metadata",
            "list_keyvaults",
        ] {
            assert!(
                !AuditLogger::is_durable_action(action),
                "{action} should be coalesced"
            );
        }
    }

    #[tokio::test]
    async fn a_burst_is_coalesced_into_far_fewer_writes() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());

        for i in 0..100 {
            logger
                .log_action(
                    "v",
                    "list_secrets",
                    "secret",
                    &format!("s{i}"),
                    "success",
                    None,
                )
                .await;
        }
        logger.flush().await;

        let writes = logger.write_count();
        assert!(
            writes <= 3,
            "a 100-entry burst of coalescible reads must collapse into a handful \
             of writes, not one per entry (writes={writes})"
        );
    }

    #[tokio::test]
    async fn flush_persists_every_entry_of_a_burst() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());

        for i in 0..100 {
            logger
                .log_action(
                    "v",
                    "delete_secret",
                    "secret",
                    &format!("s{i}"),
                    "success",
                    None,
                )
                .await;
        }
        logger.flush().await;

        // Coalescing must never drop the tail of a burst: the very last entry
        // is the one a naive debounce loses.
        let on_disk = std::fs::read_to_string(dir.log_file()).unwrap();
        let reloaded: Vec<AuditEntry> = serde_json::from_str(&on_disk).unwrap();
        assert_eq!(reloaded.len(), 100);
        assert_eq!(reloaded[0].item_name, "s0");
        assert_eq!(reloaded[99].item_name, "s99");
    }

    #[tokio::test]
    async fn concurrent_loggers_all_reach_disk() {
        let dir = TempDir::new();
        let logger = Arc::new(AuditLogger::new(dir.path()));

        let mut handles = Vec::new();
        for i in 0..50 {
            let logger = Arc::clone(&logger);
            handles.push(tokio::spawn(async move {
                logger
                    .log_action("v", "a", "t", &format!("i{i}"), "success", None)
                    .await;
            }));
        }
        for handle in handles {
            handle.await.unwrap();
        }
        logger.flush().await;

        let reloaded = AuditLogger::new(dir.path());
        assert_eq!(reloaded.get_entries(Some(1000), None).await.len(), 50);
    }

    #[tokio::test]
    async fn clear_is_durable_without_an_explicit_flush() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());
        logger.log_action("v", "a", "t", "i", "success", None).await;
        logger.flush().await;

        // `clear` awaits its own write: the user is told the history is gone.
        logger.clear(None).await;

        let on_disk = std::fs::read_to_string(dir.log_file()).unwrap();
        assert_eq!(on_disk.trim(), "[]");
        assert!(AuditLogger::new(dir.path())
            .get_entries(None, None)
            .await
            .is_empty());
    }

    #[test]
    fn save_reports_failure_when_the_temp_file_cannot_be_created() {
        // A regular file where the log directory should be: the temp file can
        // never be created. Returning `true` here would report a durable write
        // that never happened.
        let dir = TempDir::new();
        std::fs::create_dir_all(dir.path()).unwrap();
        let fake_log_dir = dir.path().join("not-a-dir");
        std::fs::write(&fake_log_dir, b"x").unwrap();

        assert!(!AuditLogger::save_entries(&fake_log_dir, &[]));
    }

    #[tokio::test]
    async fn a_failed_write_leaves_the_log_dirty_for_a_retry() {
        let dir = TempDir::new();
        let logger = AuditLogger::new(dir.path());

        // Remove the directory out from under the logger so the write fails.
        let log_dir = dir.path().join("audit_logs");
        std::fs::remove_dir_all(&log_dir).unwrap();

        logger.log_action("v", "a", "t", "i", "success", None).await;
        logger.flush().await;
        assert!(!log_dir.exists());

        // Restoring the directory and flushing again must persist the entry
        // that the failed write left behind.
        AuditLogger::create_log_dir(&log_dir);
        logger.flush().await;

        let reloaded = AuditLogger::new(dir.path());
        assert_eq!(reloaded.get_entries(None, None).await.len(), 1);
    }
}

#[cfg(test)]
mod load_bounds_tests {
    use super::*;

    fn entry(name: &str, details: Option<&str>) -> AuditEntry {
        AuditEntry {
            timestamp: "2026-01-01T00:00:00Z".to_string(),
            vault_name: "v".to_string(),
            action: "a".to_string(),
            item_type: "t".to_string(),
            item_name: name.to_string(),
            result: "success".to_string(),
            details: details.map(str::to_string),
        }
    }

    #[test]
    fn load_keeps_only_the_most_recent_max_entries() {
        let oversized: Vec<AuditEntry> = (0..MAX_ENTRIES + 500)
            .map(|i| entry(&format!("i{i}"), None))
            .collect();

        let bounded = AuditLogger::bound_loaded_entries(oversized);

        assert_eq!(bounded.len(), MAX_ENTRIES);
        // The newest entries survive, not the oldest.
        assert_eq!(bounded[0].item_name, "i500");
        assert_eq!(
            bounded[MAX_ENTRIES - 1].item_name,
            format!("i{}", MAX_ENTRIES + 499)
        );
    }

    #[test]
    fn load_re_truncates_oversized_fields() {
        let long = "a".repeat(MAX_FIELD_LEN * 4);
        let mut e = entry(&long, None);
        e.timestamp = long.clone();
        e.vault_name = long.clone();
        e.action = long.clone();
        e.item_type = long.clone();
        e.result = long.clone();

        let bounded = AuditLogger::bound_loaded_entries(vec![e]);
        let e = &bounded[0];

        for field in [
            &e.timestamp,
            &e.vault_name,
            &e.action,
            &e.item_type,
            &e.item_name,
            &e.result,
        ] {
            assert_eq!(field.chars().count(), MAX_FIELD_LEN);
        }
    }

    #[test]
    fn load_re_sanitizes_details() {
        let bounded = AuditLogger::bound_loaded_entries(vec![entry("i", Some("password=hunter2"))]);
        assert_eq!(bounded[0].details.as_deref(), Some("[REDACTED]"));

        let bounded = AuditLogger::bound_loaded_entries(vec![entry(
            "i",
            Some(&"b".repeat(MAX_DETAIL_LEN * 3)),
        )]);
        assert_eq!(
            bounded[0].details.as_deref().unwrap().chars().count(),
            MAX_DETAIL_LEN
        );
    }

    #[test]
    fn load_leaves_a_within_bounds_log_untouched() {
        let entries = vec![entry("i0", Some("2 found")), entry("i1", None)];
        let bounded = AuditLogger::bound_loaded_entries(entries.clone());

        assert_eq!(
            serde_json::to_value(&bounded).unwrap(),
            serde_json::to_value(&entries).unwrap()
        );
    }

    #[tokio::test]
    async fn a_doctored_file_on_disk_cannot_smuggle_unbounded_entries_back_in() {
        let dir = std::env::temp_dir().join(format!("azvault-audit-load-{}", uuid::Uuid::new_v4()));
        let log_dir = dir.join("audit_logs");
        std::fs::create_dir_all(&log_dir).unwrap();

        let long = "a".repeat(MAX_FIELD_LEN * 10);
        let doctored: Vec<AuditEntry> = (0..MAX_ENTRIES + 200)
            .map(|_| entry(&long, Some("token=LEAKED")))
            .collect();
        std::fs::write(
            log_dir.join("audit.json"),
            serde_json::to_string(&doctored).unwrap(),
        )
        .unwrap();

        let logger = AuditLogger::new(dir.clone());
        let loaded = logger.get_entries(Some(usize::MAX), None).await;

        assert_eq!(loaded.len(), MAX_ENTRIES);
        assert!(loaded
            .iter()
            .all(|e| e.item_name.chars().count() == MAX_FIELD_LEN));
        assert!(loaded
            .iter()
            .all(|e| e.details.as_deref() == Some("[REDACTED]")));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
