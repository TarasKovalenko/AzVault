//! Authentication module – Azure CLI delegation.
//!
//! Security design:
//! - AzVault **never** owns or persists credentials.
//! - Tokens are obtained from the Azure CLI (`az account get-access-token`)
//!   and held only in memory, never written to disk, logs, errors or `Debug`.
//! - A token is cached per (resource, tenant) until five minutes before the
//!   expiry the CLI reported, so a burst of commands costs one CLI spawn.
//! - Token requests are restricted to an allow-list of Azure resource scopes.
//! - Tenant preference is app-local and only influences the `--tenant` flag.
//!
//! This module intentionally avoids MSAL/browser-based flows to keep the
//! attack surface minimal for a desktop developer tool.

use chrono::{DateTime, Duration as ChronoDuration, Local, NaiveDateTime, TimeZone, Utc};
use serde_json::Value;
use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;
use std::{env, ffi::OsStr, path::Path, path::PathBuf};
use tokio::process::Command;
use tokio::sync::{Mutex, RwLock};

/// Default tenant value used by Azure CLI when no explicit tenant is specified.
const TENANT_DEFAULT: &str = "organizations";

/// Common Azure CLI install locations that Finder-launched macOS apps do not
/// always inherit via PATH.
#[cfg(target_os = "macos")]
const MACOS_AZ_CLI_FALLBACK_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/opt/azure-cli/bin",
    "/Library/Frameworks/Python.framework/Versions/Current/bin",
];

/// How long before the CLI-reported expiry a cached token is considered dead.
///
/// Azure access tokens are validated server-side against their `exp` claim, so
/// handing out a token that expires mid-flight turns a cheap cache hit into a
/// 401. Five minutes comfortably covers clock skew plus a slow request.
const TOKEN_EXPIRY_SKEW_SECS: i64 = 300;

/// Cache key: a token is only valid for the resource *and* tenant it was
/// minted for, so both take part in the identity.
type TokenCacheKey = (String, String);

/// An access token plus the moment it stops being usable.
///
/// `Debug` is implemented by hand: the derived one would print the bearer
/// token into any log line, panic message or `{:?}` formatting of the
/// surrounding structs.
#[derive(Clone)]
struct CachedToken {
    token: String,
    expires_at: DateTime<Utc>,
}

impl fmt::Debug for CachedToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CachedToken")
            .field("token", &"[REDACTED]")
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

impl CachedToken {
    /// `true` while the token is still usable with the safety margin applied.
    fn is_fresh(&self, now: DateTime<Utc>) -> bool {
        now + ChronoDuration::seconds(TOKEN_EXPIRY_SKEW_SECS) < self.expires_at
    }
}

/// The parsed `az account get-access-token` payload.
///
/// `expires_at` is `None` when the CLI reported an expiry AzVault could not
/// understand. Such a token is used once and never cached: guessing a lifetime
/// would either hand out dead tokens or hold live ones past their revocation.
#[derive(Clone)]
struct CliToken {
    token: String,
    expires_at: Option<DateTime<Utc>>,
}

impl fmt::Debug for CliToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CliToken")
            .field("token", &"[REDACTED]")
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

/// Manages Azure CLI-based authentication for the app.
pub struct AuthManager {
    /// The currently preferred tenant ID (set by the user in the sidebar).
    tenant_id: Arc<RwLock<String>>,
    /// Live tokens keyed by (resource, tenant).
    token_cache: Arc<RwLock<HashMap<TokenCacheKey, CachedToken>>>,
    /// One gate per cache key so that N concurrent commands that miss the
    /// cache spawn one `az` process instead of N (thundering herd).
    fetch_gates: Arc<Mutex<HashMap<TokenCacheKey, Arc<Mutex<()>>>>>,
}

impl fmt::Debug for AuthManager {
    /// Deliberately opaque: `AuthManager` holds live bearer tokens and the
    /// tenant the user works in, neither of which belongs in a log line.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AuthManager")
            .field("tenant_id", &"[REDACTED]")
            .field("token_cache", &"[REDACTED]")
            .finish()
    }
}

impl AuthManager {
    /// Creates a new CLI-backed auth manager with the default tenant.
    pub fn new() -> Self {
        Self {
            tenant_id: Arc::new(RwLock::new(TENANT_DEFAULT.to_string())),
            token_cache: Arc::new(RwLock::new(HashMap::new())),
            fetch_gates: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Sets the tenant preference for subsequent token requests.
    ///
    /// Cached tokens are dropped: they were minted for the previous tenant and
    /// must not be reused, not even for the few minutes left on their clock.
    pub async fn set_tenant(&self, tenant_id: &str) {
        let sanitized = Self::sanitize_tenant_id(tenant_id);
        {
            let mut tid = self.tenant_id.write().await;
            *tid = sanitized;
        }
        self.clear_token_cache().await;
    }

    /// Returns the currently preferred tenant ID.
    pub async fn get_tenant(&self) -> String {
        self.tenant_id.read().await.clone()
    }

    /// Requests an ARM management-plane token, served from cache when live.
    pub async fn get_management_token(&self) -> Result<String, String> {
        let tenant = self.get_tenant().await;
        self.token_for("https://management.azure.com/", &tenant)
            .await
    }

    /// Requests a Key Vault data-plane token, served from cache when live.
    pub async fn get_vault_token(&self) -> Result<String, String> {
        let tenant = self.get_tenant().await;
        self.token_for("https://vault.azure.net", &tenant).await
    }

    /// Returns a live token for `(resource, tenant)`, spawning the Azure CLI
    /// only when the cache cannot serve the request.
    ///
    /// Three steps, in order:
    /// 1. A read-locked cache probe. The hot path takes no exclusive lock and
    ///    never blocks a concurrent fetch.
    /// 2. A per-key gate. Opening the Overview fires three commands at once and
    ///    a bulk delete fires one per item; without the gate each one spawns its
    ///    own `az` process for the same token.
    /// 3. A second probe behind the gate, so the callers that queued up on a
    ///    single fetch take that fetch's result instead of re-running it.
    ///
    /// The gate is per key, so an ARM fetch never blocks a vault fetch, and the
    /// cache lock is never held across the process spawn.
    async fn token_for(&self, resource: &str, tenant: &str) -> Result<String, String> {
        let key = (resource.to_string(), tenant.to_string());

        if let Some(token) = self.cached_token(&key).await {
            return Ok(token);
        }

        let gate = self.fetch_gate(&key).await;
        let _fetching = gate.lock().await;

        if let Some(token) = self.cached_token(&key).await {
            return Ok(token);
        }

        let fetched = self.get_az_cli_token(resource, Some(tenant)).await?;
        self.store_token(key, &fetched).await;
        Ok(fetched.token)
    }

    /// Returns the cached token for `key` when it is still comfortably live.
    async fn cached_token(&self, key: &TokenCacheKey) -> Option<String> {
        let cache = self.token_cache.read().await;
        cache
            .get(key)
            .filter(|entry| entry.is_fresh(Utc::now()))
            .map(|entry| entry.token.clone())
    }

    /// Caches `token`, unless its expiry could not be parsed.
    async fn store_token(&self, key: TokenCacheKey, token: &CliToken) {
        let Some(expires_at) = token.expires_at else {
            log::warn!(
                "Azure CLI token for '{}' carried no parsable expiry; not caching it.",
                key.0
            );
            return;
        };

        let entry = CachedToken {
            token: token.token.clone(),
            expires_at,
        };
        if !entry.is_fresh(Utc::now()) {
            return;
        }

        self.token_cache.write().await.insert(key, entry);
    }

    /// Returns (creating if needed) the fetch gate for `key`.
    async fn fetch_gate(&self, key: &TokenCacheKey) -> Arc<Mutex<()>> {
        let mut gates = self.fetch_gates.lock().await;
        Arc::clone(gates.entry(key.clone()).or_default())
    }

    /// Drops every cached token.
    async fn clear_token_cache(&self) {
        self.token_cache.write().await.clear();
    }

    /// Resets the tenant preference (app-level sign-out) and forgets every
    /// cached token, so nothing survives the sign-out in memory.
    /// The actual Azure CLI session is external and not invalidated here.
    pub async fn sign_out(&self) {
        {
            let mut tid = self.tenant_id.write().await;
            *tid = TENANT_DEFAULT.to_string();
        }
        self.clear_token_cache().await;
    }

    /// Returns `true` if Azure CLI can produce a valid management token.
    pub async fn is_signed_in(&self) -> bool {
        self.get_management_token().await.is_ok()
    }

    /// Calls `az account get-access-token` for an allow-listed resource scope.
    ///
    /// # Security
    /// - Only resources in `is_allowed_cli_resource` can be requested.
    /// - The tenant ID is sanitised to prevent command injection.
    ///
    /// The CLI takes 0.5-2s to answer, so the child process is driven
    /// asynchronously: a blocking `output()` here would park a tokio worker
    /// thread and stall every concurrent list/audit task for that long.
    async fn get_az_cli_token(
        &self,
        resource: &str,
        tenant: Option<&str>,
    ) -> Result<CliToken, String> {
        if !Self::is_allowed_cli_resource(resource) {
            return Err("Unsupported Azure CLI resource scope.".to_string());
        }

        let args = Self::build_token_args(resource, tenant);

        let mut command = Command::new(Self::resolve_az_cli_path());
        #[cfg(target_os = "macos")]
        command.env(
            "PATH",
            Self::build_command_path(env::var_os("PATH").as_deref()),
        );

        let output = command
            .args(args)
            .output()
            .await
            .map_err(|e| format!("Azure CLI not available: {}", e))?;

        if !output.status.success() {
            return Err(
                "Azure CLI token acquisition failed. Run 'az login' and retry.".to_string(),
            );
        }

        Self::parse_cli_access_token(&output.stdout)
    }

    /// Builds the `az account get-access-token` argument vector.
    ///
    /// The `--tenant` flag is only appended for an explicit, non-default
    /// tenant so the Azure CLI keeps using its own default otherwise.
    fn build_token_args<'a>(resource: &'a str, tenant: Option<&'a str>) -> Vec<&'a str> {
        let mut args = vec![
            "account",
            "get-access-token",
            "--resource",
            resource,
            "--output",
            "json",
        ];

        if let Some(tid) = tenant {
            if !tid.is_empty() && tid != TENANT_DEFAULT {
                args.push("--tenant");
                args.push(tid);
            }
        }

        args
    }

    /// Allow-list of token resource scopes that AzVault is permitted to request.
    fn is_allowed_cli_resource(resource: &str) -> bool {
        matches!(
            resource,
            "https://management.azure.com/" | "https://vault.azure.net"
        )
    }

    /// Builds the PATH used for child processes, augmenting GUI-launched macOS
    /// apps with common Azure CLI install directories.
    fn build_command_path(path_env: Option<&OsStr>) -> PathBuf {
        env::join_paths(Self::az_cli_search_paths(path_env))
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(path_env.unwrap_or_else(|| OsStr::new(""))))
    }

    /// Resolves the Azure CLI executable path with support for Apple Silicon
    /// Homebrew installs when the app is launched from Finder.
    ///
    /// # Security
    /// Release builds resolve `az` from the search path only. An
    /// `AZURE_CLI_PATH` override would hand anything able to set the app's
    /// environment arbitrary code execution inside the app's context -- and
    /// the spawned binary is passed `--tenant`, so it also learns which tenant
    /// the user works in. The override is kept for debug builds, where the
    /// developer already controls the process anyway.
    fn resolve_az_cli_path() -> PathBuf {
        if let Some(path) = Self::cli_path_override() {
            return path;
        }

        for dir in Self::az_cli_search_paths(env::var_os("PATH").as_deref()) {
            let candidate = dir.join("az");
            if Self::is_executable_file(&candidate) {
                return candidate;
            }
        }

        PathBuf::from("az")
    }

    /// The developer-only `AZURE_CLI_PATH` escape hatch.
    ///
    /// Always `None` in release builds -- see `resolve_az_cli_path`.
    fn cli_path_override() -> Option<PathBuf> {
        #[cfg(debug_assertions)]
        {
            env::var_os("AZURE_CLI_PATH")
                .filter(|path| !path.is_empty())
                .map(PathBuf::from)
        }
        #[cfg(not(debug_assertions))]
        {
            None
        }
    }

    /// Returns `true` when `candidate` is a regular file the OS would actually
    /// run.
    ///
    /// Checking only `is_file()` means a non-executable `az` sitting earlier on
    /// PATH shadows the real CLI, and the spawn then fails with a misleading
    /// "Azure CLI not available".
    fn is_executable_file(candidate: &Path) -> bool {
        let Ok(metadata) = std::fs::metadata(candidate) else {
            return false;
        };
        if !metadata.is_file() {
            return false;
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            metadata.permissions().mode() & 0o111 != 0
        }
        #[cfg(not(unix))]
        {
            true
        }
    }

    /// Candidate directories used to locate Azure CLI, most trusted first.
    ///
    /// # Security
    /// The known-good install directories come *before* the inherited `PATH`.
    /// PATH is attacker-influenceable (a poisoned login shell, a dropped
    /// `~/bin/az`, a hijacked launchd environment), and the binary found here is
    /// executed and handed `--tenant`. Searching PATH first meant a planted `az`
    /// won over the real one; searching the system locations first means the
    /// planted copy only matters on a machine with no Azure CLI installed.
    /// PATH is still consulted, so non-standard installs keep working.
    fn az_cli_search_paths(path_env: Option<&OsStr>) -> Vec<PathBuf> {
        let mut paths = Vec::new();

        #[cfg(target_os = "macos")]
        for dir in MACOS_AZ_CLI_FALLBACK_DIRS {
            Self::push_unique_path(&mut paths, PathBuf::from(dir));
        }

        if let Some(path_env) = path_env {
            for dir in env::split_paths(path_env) {
                Self::push_unique_path(&mut paths, dir);
            }
        }

        paths
    }

    fn push_unique_path(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
        if candidate.as_os_str().is_empty() {
            return;
        }

        if !paths.iter().any(|existing| existing == &candidate) {
            paths.push(candidate);
        }
    }

    /// Parses the JSON output of `az account get-access-token` into the token
    /// and, when it can be understood, its expiry.
    fn parse_cli_access_token(payload: &[u8]) -> Result<CliToken, String> {
        let body: Value = serde_json::from_slice(payload)
            .map_err(|e| format!("Failed to parse Azure CLI token response: {}", e))?;

        let token = body
            .get("accessToken")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Azure CLI token response did not contain accessToken.".to_string())?;

        Ok(CliToken {
            token,
            expires_at: Self::parse_token_expiry(&body),
        })
    }

    /// Extracts the token expiry from a CLI payload, as UTC.
    ///
    /// Two shapes exist in the wild and both must be handled:
    /// - `expires_on`: a unix timestamp (newer CLI), unambiguous.
    /// - `expiresOn`: a *local*-time string with no timezone, e.g.
    ///   `"2026-09-12 16:04:05.000000"`. Reading it as UTC would shift the
    ///   expiry by the machine's offset -- caching a token for hours past its
    ///   death west of Greenwich.
    ///
    /// Returns `None` when neither parses, which makes the token uncacheable
    /// rather than guessed.
    fn parse_token_expiry(body: &Value) -> Option<DateTime<Utc>> {
        if let Some(epoch) = body.get("expires_on").and_then(Self::value_as_epoch) {
            return Utc.timestamp_opt(epoch, 0).single();
        }

        let raw = body.get("expiresOn").and_then(|v| v.as_str())?;
        Self::parse_local_expiry(raw)
    }

    /// Reads a unix timestamp that the CLI may emit as a number or a string.
    fn value_as_epoch(value: &Value) -> Option<i64> {
        value
            .as_i64()
            .or_else(|| value.as_str().and_then(|s| s.trim().parse::<i64>().ok()))
    }

    /// Parses the legacy `expiresOn` string, which is local wall-clock time.
    ///
    /// An explicit offset (some CLI builds emit RFC 3339) wins when present;
    /// otherwise the naive timestamp is resolved in the local zone. A time that
    /// falls in a DST gap or repeat is rejected rather than guessed.
    fn parse_local_expiry(raw: &str) -> Option<DateTime<Utc>> {
        Self::parse_local_expiry_in(raw, &Local)
    }

    /// `parse_local_expiry` with the zone supplied explicitly.
    ///
    /// The zone is a parameter purely so the timezone handling can be pinned to
    /// a fixed offset in tests: resolving through `Local` makes the conversion
    /// invisible on a UTC machine, which is exactly where it would regress.
    fn parse_local_expiry_in<Tz: TimeZone>(raw: &str, zone: &Tz) -> Option<DateTime<Utc>> {
        let raw = raw.trim();
        if let Ok(parsed) = DateTime::parse_from_rfc3339(raw) {
            return Some(parsed.with_timezone(&Utc));
        }

        let naive = ["%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S%.f"]
            .iter()
            .find_map(|format| NaiveDateTime::parse_from_str(raw, format).ok())?;

        zone.from_local_datetime(&naive)
            .single()
            .map(|local| local.with_timezone(&Utc))
    }

    /// Sanitise a tenant ID to prevent shell injection.
    /// Only allow UUID-like characters (hex digits and hyphens) or the default value.
    /// Validates a tenant before it reaches the `az --tenant` argument.
    ///
    /// Azure accepts either a tenant GUID or a verified domain
    /// (`contoso.onmicrosoft.com`). Anything else is rejected outright rather
    /// than stripped: filtering hostile characters out of an identifier
    /// produces a different, still valid-looking tenant, which silently sends
    /// the request somewhere the user did not ask for.
    fn sanitize_tenant_id(tenant_id: &str) -> String {
        let candidate = tenant_id.trim();
        if candidate == TENANT_DEFAULT
            || Self::is_tenant_guid(candidate)
            || Self::is_tenant_domain(candidate)
        {
            candidate.to_string()
        } else {
            TENANT_DEFAULT.to_string()
        }
    }

    fn is_tenant_guid(value: &str) -> bool {
        let groups: Vec<&str> = value.split('-').collect();
        groups.len() == 5
            && [8usize, 4, 4, 4, 12]
                .iter()
                .zip(&groups)
                .all(|(len, group)| {
                    group.len() == *len && group.chars().all(|c| c.is_ascii_hexdigit())
                })
    }

    fn is_tenant_domain(value: &str) -> bool {
        if value.len() > 253 || !value.contains('.') {
            return false;
        }
        value.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
    }
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    #[test]
    fn cli_resource_scope_is_restricted() {
        assert!(AuthManager::is_allowed_cli_resource(
            "https://management.azure.com/"
        ));
        assert!(AuthManager::is_allowed_cli_resource(
            "https://vault.azure.net"
        ));
        // Graph and arbitrary URLs must be rejected
        assert!(!AuthManager::is_allowed_cli_resource(
            "https://graph.microsoft.com"
        ));
        assert!(!AuthManager::is_allowed_cli_resource(
            "https://evil.example.com"
        ));
    }

    #[test]
    fn parses_cli_access_token_payload() {
        let payload = br#"{"accessToken":"eyJ0eXAi...","expiresOn":"2024-01-01"}"#;
        let token = AuthManager::parse_cli_access_token(payload).expect("should parse");
        assert_eq!(token.token, "eyJ0eXAi...");
        // A date with no time is not a shape the CLI emits: unparsable means
        // uncacheable, not "guess midnight".
        assert!(token.expires_at.is_none());
    }

    #[test]
    fn fails_when_cli_payload_missing_token() {
        let payload = br#"{"expiresOn":"soon"}"#;
        assert!(AuthManager::parse_cli_access_token(payload).is_err());
    }

    #[test]
    fn fails_on_invalid_json_payload() {
        let payload = b"not json at all";
        assert!(AuthManager::parse_cli_access_token(payload).is_err());
    }

    #[test]
    fn az_cli_search_paths_preserve_existing_path_entries() {
        let paths = AuthManager::az_cli_search_paths(Some(OsStr::new("/usr/bin:/custom/bin")));

        // Inherited entries are still searched, in their original relative
        // order -- a non-standard install must keep working.
        let usr = paths.iter().position(|p| p == Path::new("/usr/bin"));
        let custom = paths.iter().position(|p| p == Path::new("/custom/bin"));
        assert!(usr.is_some() && custom.is_some());
        assert!(usr < custom);
    }

    #[test]
    fn known_good_dirs_are_searched_before_inherited_path() {
        // A poisoned PATH must not get to nominate the binary that is executed
        // with `--tenant`.
        let paths = AuthManager::az_cli_search_paths(Some(OsStr::new("/tmp/evil:/usr/bin")));
        let evil = paths
            .iter()
            .position(|p| p == Path::new("/tmp/evil"))
            .expect("inherited entry is still searched");

        #[cfg(target_os = "macos")]
        for dir in MACOS_AZ_CLI_FALLBACK_DIRS {
            let trusted = paths
                .iter()
                .position(|p| p == Path::new(dir))
                .unwrap_or_else(|| panic!("{dir} must be searched"));
            assert!(
                trusted < evil,
                "{dir} must be searched before the inherited PATH entry"
            );
        }

        #[cfg(not(target_os = "macos"))]
        assert_eq!(evil, 0);
    }

    #[test]
    fn a_path_entry_that_duplicates_a_known_good_dir_is_not_searched_twice() {
        let paths = AuthManager::az_cli_search_paths(Some(OsStr::new("/usr/local/bin:/usr/bin")));
        let hits = paths
            .iter()
            .filter(|p| *p == Path::new("/usr/local/bin"))
            .count();
        assert_eq!(hits, 1);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn az_cli_search_paths_include_common_macos_install_dirs() {
        let paths = AuthManager::az_cli_search_paths(Some(OsStr::new("/usr/bin")));

        assert!(paths.contains(&PathBuf::from("/opt/homebrew/bin")));
        assert!(paths.contains(&PathBuf::from("/usr/local/bin")));
    }

    #[test]
    fn fails_on_empty_payload() {
        let payload = b"";
        assert!(AuthManager::parse_cli_access_token(payload).is_err());
    }

    #[test]
    fn sanitizes_tenant_id_removes_injection_chars() {
        // Normal UUID-style tenant ID passes through
        assert_eq!(
            AuthManager::sanitize_tenant_id("12345678-abcd-ef01-2345-6789abcdef01"),
            "12345678-abcd-ef01-2345-6789abcdef01"
        );

        // Injection attempt is rejected outright, not mangled into a
        // different-but-valid-looking tenant
        assert_eq!(
            AuthManager::sanitize_tenant_id("tenant; rm -rf /"),
            TENANT_DEFAULT
        );

        // Default value passes through unchanged
        assert_eq!(
            AuthManager::sanitize_tenant_id("organizations"),
            "organizations"
        );

        // Empty string falls back to default
        assert_eq!(AuthManager::sanitize_tenant_id(""), "organizations");

        // All-special-chars falls back to default
        assert_eq!(AuthManager::sanitize_tenant_id("!!@@##"), "organizations");
    }

    // ── Token cache ──

    fn payload(token: &str, expires_field: &str, expires_value: &str) -> Vec<u8> {
        format!(r#"{{"accessToken":"{token}","{expires_field}":"{expires_value}"}}"#).into_bytes()
    }

    #[test]
    fn parses_legacy_local_expires_on_in_local_time() {
        // Fixed offsets, not `Local`: deriving the expectation through the same
        // zone the implementation uses makes the test pass on a UTC CI runner
        // even when the conversion is dropped entirely.
        let raw = "2030-09-12 16:04:05.000000";

        // 16:04:05 on the US west coast (UTC-7) is 23:04:05 UTC the same day.
        let west = FixedOffset::west_opt(7 * 3600).unwrap();
        assert_eq!(
            AuthManager::parse_local_expiry_in(raw, &west),
            Some(
                DateTime::parse_from_rfc3339("2030-09-12T23:04:05Z")
                    .unwrap()
                    .with_timezone(&Utc)
            ),
            "a naive expiry must be read as wall clock, not as UTC"
        );

        // ...and 16:04:05 in India (UTC+5:30) is 10:34:05 UTC.
        let east = FixedOffset::east_opt(5 * 3600 + 1800).unwrap();
        assert_eq!(
            AuthManager::parse_local_expiry_in(raw, &east),
            Some(
                DateTime::parse_from_rfc3339("2030-09-12T10:34:05Z")
                    .unwrap()
                    .with_timezone(&Utc)
            )
        );

        // An explicit offset in the string still wins over the machine zone.
        assert_eq!(
            AuthManager::parse_local_expiry_in("2030-09-12T16:04:05+02:00", &west),
            Some(
                DateTime::parse_from_rfc3339("2030-09-12T14:04:05Z")
                    .unwrap()
                    .with_timezone(&Utc)
            )
        );
    }

    #[test]
    fn legacy_expires_on_round_trips_through_the_machine_zone() {
        let raw = "2030-09-12 16:04:05.000000";
        let parsed = AuthManager::parse_cli_access_token(&payload("tok", "expiresOn", raw))
            .expect("should parse");
        let expires_at = parsed.expires_at.expect("expiry should parse");

        // The inverse direction: whatever instant was produced must render back
        // to the wall clock the CLI printed.
        let naive =
            NaiveDateTime::parse_from_str(raw, "%Y-%m-%d %H:%M:%S%.f").expect("fixture parses");
        assert_eq!(
            expires_at.with_timezone(&Local).naive_local(),
            naive,
            "the instant must render back to the wall clock the CLI printed"
        );
    }

    #[test]
    fn parses_unix_expires_on_timestamp() {
        let parsed =
            AuthManager::parse_cli_access_token(&payload("tok", "expires_on", "1900000000"))
                .expect("should parse");
        assert_eq!(
            parsed.expires_at,
            Some(Utc.timestamp_opt(1_900_000_000, 0).single().unwrap())
        );
    }

    #[test]
    fn prefers_numeric_expires_on_over_local_string() {
        let raw = br#"{"accessToken":"tok","expiresOn":"2030-09-12 16:04:05.000000","expires_on":1900000000}"#;
        let parsed = AuthManager::parse_cli_access_token(raw).expect("should parse");
        assert_eq!(
            parsed.expires_at,
            Some(Utc.timestamp_opt(1_900_000_000, 0).single().unwrap())
        );
    }

    #[test]
    fn parses_rfc3339_expires_on() {
        let parsed = AuthManager::parse_cli_access_token(&payload(
            "tok",
            "expiresOn",
            "2030-09-12T16:04:05Z",
        ))
        .expect("should parse");
        assert_eq!(
            parsed.expires_at,
            Some(
                DateTime::parse_from_rfc3339("2030-09-12T16:04:05Z")
                    .unwrap()
                    .with_timezone(&Utc)
            )
        );
    }

    #[test]
    fn unparsable_expiry_yields_no_expiry() {
        let parsed = AuthManager::parse_cli_access_token(&payload("tok", "expiresOn", "whenever"))
            .expect("should parse");
        assert!(parsed.expires_at.is_none());
    }

    #[test]
    fn token_is_stale_within_the_skew_window() {
        // Absolute durations, deliberately not expressed in terms of
        // TOKEN_EXPIRY_SKEW_SECS: a test written against the constant stays
        // green if the margin is shrunk to zero.
        assert_eq!(
            TOKEN_EXPIRY_SKEW_SECS, 300,
            "the safety margin is five minutes"
        );

        let now = Utc::now();
        let token = |seconds_left: i64| CachedToken {
            token: "t".to_string(),
            expires_at: now + ChronoDuration::seconds(seconds_left),
        };

        // Comfortably live.
        assert!(token(3600).is_fresh(now));
        assert!(token(301).is_fresh(now), "just outside the 5-minute margin");

        // Inside the margin: still valid to Azure, but too close to hand out.
        assert!(
            !token(300).is_fresh(now),
            "exactly 5 minutes left is already too close"
        );
        assert!(
            !token(299).is_fresh(now),
            "4m59s of life left must not be served from cache"
        );
        assert!(
            !token(120).is_fresh(now),
            "2 minutes of life left must not be served from cache"
        );

        // Already dead.
        assert!(!token(0).is_fresh(now));
        assert!(!token(-1).is_fresh(now));
    }

    #[tokio::test]
    async fn caches_a_live_token_and_serves_it_back() {
        let auth = AuthManager::new();
        let key = (
            "https://vault.azure.net".to_string(),
            "organizations".to_string(),
        );
        auth.store_token(
            key.clone(),
            &CliToken {
                token: "live-token".to_string(),
                expires_at: Some(Utc::now() + ChronoDuration::hours(1)),
            },
        )
        .await;

        assert_eq!(auth.cached_token(&key).await.as_deref(), Some("live-token"));
    }

    #[tokio::test]
    async fn does_not_cache_a_token_without_a_parsable_expiry() {
        let auth = AuthManager::new();
        let key = ("https://vault.azure.net".to_string(), "t".to_string());
        auth.store_token(
            key.clone(),
            &CliToken {
                token: "mystery".to_string(),
                expires_at: None,
            },
        )
        .await;

        assert!(auth.cached_token(&key).await.is_none());
    }

    #[tokio::test]
    async fn does_not_serve_an_expired_token() {
        let auth = AuthManager::new();
        let key = ("https://vault.azure.net".to_string(), "t".to_string());
        auth.token_cache.write().await.insert(
            key.clone(),
            CachedToken {
                token: "stale".to_string(),
                expires_at: Utc::now() - ChronoDuration::minutes(1),
            },
        );

        assert!(auth.cached_token(&key).await.is_none());
    }

    #[tokio::test]
    async fn cache_is_keyed_by_resource_and_tenant() {
        let auth = AuthManager::new();
        let arm = ("https://management.azure.com/".to_string(), "a".to_string());
        let vault = ("https://vault.azure.net".to_string(), "a".to_string());
        let other_tenant = ("https://vault.azure.net".to_string(), "b".to_string());

        auth.store_token(
            arm.clone(),
            &CliToken {
                token: "arm-token".to_string(),
                expires_at: Some(Utc::now() + ChronoDuration::hours(1)),
            },
        )
        .await;

        assert_eq!(auth.cached_token(&arm).await.as_deref(), Some("arm-token"));
        assert!(auth.cached_token(&vault).await.is_none());
        assert!(auth.cached_token(&other_tenant).await.is_none());
    }

    #[tokio::test]
    async fn switching_tenant_drops_cached_tokens() {
        let auth = AuthManager::new();
        let key = (
            "https://vault.azure.net".to_string(),
            "organizations".to_string(),
        );
        auth.store_token(
            key.clone(),
            &CliToken {
                token: "tenant-a-token".to_string(),
                expires_at: Some(Utc::now() + ChronoDuration::hours(1)),
            },
        )
        .await;

        auth.set_tenant("12345678-abcd-ef01-2345-6789abcdef01")
            .await;

        assert!(
            auth.cached_token(&key).await.is_none(),
            "a token minted for the previous tenant must not survive the switch"
        );
    }

    #[tokio::test]
    async fn sign_out_drops_cached_tokens() {
        let auth = AuthManager::new();
        let key = ("https://vault.azure.net".to_string(), "t".to_string());
        auth.store_token(
            key.clone(),
            &CliToken {
                token: "session-token".to_string(),
                expires_at: Some(Utc::now() + ChronoDuration::hours(1)),
            },
        )
        .await;

        auth.sign_out().await;

        assert!(auth.cached_token(&key).await.is_none());
    }

    #[tokio::test]
    async fn one_gate_per_key_and_keys_do_not_block_each_other() {
        let auth = AuthManager::new();
        let key = ("https://vault.azure.net".to_string(), "t".to_string());

        let first = auth.fetch_gate(&key).await;
        let second = auth.fetch_gate(&key).await;
        let other = auth
            .fetch_gate(&("https://management.azure.com/".to_string(), "t".to_string()))
            .await;

        assert!(
            Arc::ptr_eq(&first, &second),
            "same key must serialise on the same gate"
        );
        assert!(
            !Arc::ptr_eq(&first, &other),
            "different resources must not block each other"
        );

        // Holding one key's gate must never block another key's fetch.
        let _held = first.lock().await;
        assert!(other.try_lock().is_ok());
    }

    /// The thundering-herd fix is the *second* cache probe taken inside the
    /// gate: without it, every caller that queued behind the winning fetch goes
    /// on to spawn its own `az` process for a token that is already cached.
    ///
    /// The herd is reproduced by holding the gate while the callers pile up,
    /// publishing the "fetched" token, and then releasing it. Any caller that
    /// re-runs the fetch spawns the real Azure CLI and therefore cannot return
    /// the sentinel token this test planted.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_callers_take_the_winning_fetch_instead_of_re_running_it() {
        const HERD: usize = 8;
        let auth = Arc::new(AuthManager::new());
        let resource = "https://vault.azure.net";
        let tenant = "organizations";
        let key = (resource.to_string(), tenant.to_string());

        // Stand in for the caller that won the race and is running `az`.
        let gate = auth.fetch_gate(&key).await;
        let held = gate.lock_owned().await;

        let mut handles = Vec::with_capacity(HERD);
        for _ in 0..HERD {
            let auth = Arc::clone(&auth);
            handles.push(tokio::spawn(async move {
                auth.token_for(resource, tenant).await
            }));
        }

        // Let the herd pile up on the gate before the fetch "completes".
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        auth.store_token(
            key.clone(),
            &CliToken {
                token: "one-and-only-fetch".to_string(),
                expires_at: Some(Utc::now() + ChronoDuration::hours(1)),
            },
        )
        .await;
        drop(held);

        for handle in handles {
            let token = handle.await.expect("caller task panicked");
            assert_eq!(
                token.as_deref(),
                Ok("one-and-only-fetch"),
                "a queued caller re-ran the fetch instead of taking the cached result"
            );
        }

        // And the cache still holds that one token: nobody overwrote it with
        // the result of a second fetch.
        assert_eq!(
            auth.cached_token(&key).await.as_deref(),
            Some("one-and-only-fetch")
        );
    }

    #[tokio::test]
    async fn debug_output_never_leaks_the_token() {
        let auth = AuthManager::new();
        let key = (
            "https://vault.azure.net".to_string(),
            "12345678-abcd-ef01-2345-6789abcdef01".to_string(),
        );
        let secret = "eyJhbGciOiJSUzI1NiIsSUPER_SECRET_BEARER";
        auth.set_tenant("12345678-abcd-ef01-2345-6789abcdef01")
            .await;
        auth.store_token(
            key.clone(),
            &CliToken {
                token: secret.to_string(),
                expires_at: Some(Utc::now() + ChronoDuration::hours(1)),
            },
        )
        .await;

        let cached = CachedToken {
            token: secret.to_string(),
            expires_at: Utc::now(),
        };
        let cli = CliToken {
            token: secret.to_string(),
            expires_at: None,
        };

        for rendered in [
            format!("{:?}", auth),
            format!("{:#?}", auth),
            format!("{:?}", cached),
            format!("{:?}", cli),
            format!("{:?}", auth.token_cache.read().await),
        ] {
            assert!(
                !rendered.contains(secret),
                "Debug output leaked the bearer token: {rendered}"
            );
        }

        // The tenant is likewise not something to spill into a log line.
        assert!(!format!("{:?}", auth).contains("12345678-abcd"));
    }

    #[tokio::test]
    async fn set_and_get_tenant() {
        let auth = AuthManager::new();
        assert_eq!(auth.get_tenant().await, "organizations");

        auth.set_tenant("12345678-abcd-ef01-2345-6789abcdef01")
            .await;
        assert_eq!(
            auth.get_tenant().await,
            "12345678-abcd-ef01-2345-6789abcdef01"
        );
    }

    #[tokio::test]
    async fn sign_out_resets_tenant() {
        let auth = AuthManager::new();
        auth.set_tenant("contoso.onmicrosoft.com").await;
        assert_ne!(auth.get_tenant().await, "organizations");

        auth.sign_out().await;
        assert_eq!(auth.get_tenant().await, "organizations");
    }

    #[test]
    fn rejects_non_azure_resource_scopes() {
        let unsafe_scopes = [
            "http://management.azure.com/", // HTTP not HTTPS
            "https://storage.azure.com",
            "https://database.windows.net",
            "",
            "not-a-url",
        ];
        for scope in &unsafe_scopes {
            assert!(
                !AuthManager::is_allowed_cli_resource(scope),
                "Should reject: {}",
                scope
            );
        }
    }
}

#[cfg(test)]
mod cli_invocation_tests {
    use super::*;

    const MGMT: &str = "https://management.azure.com/";
    const VAULT: &str = "https://vault.azure.net";

    #[test]
    fn token_args_are_non_interactive_and_json() {
        let args = AuthManager::build_token_args(MGMT, None);
        assert_eq!(
            args,
            vec![
                "account",
                "get-access-token",
                "--resource",
                MGMT,
                "--output",
                "json"
            ]
        );
    }

    #[test]
    fn token_args_append_explicit_tenant() {
        let args = AuthManager::build_token_args(VAULT, Some("abc-123"));
        assert_eq!(args.last(), Some(&"abc-123"));
        let idx = args.iter().position(|a| *a == "--tenant").expect("flag");
        assert_eq!(args[idx + 1], "abc-123");
    }

    #[test]
    fn token_args_omit_tenant_for_default_and_empty() {
        for tenant in [Some(TENANT_DEFAULT), Some(""), None] {
            let args = AuthManager::build_token_args(MGMT, tenant);
            assert!(
                !args.contains(&"--tenant"),
                "tenant {tenant:?} should not produce a --tenant flag"
            );
        }
    }

    #[test]
    fn token_args_never_contain_shell_metacharacters_after_sanitisation() {
        let tenant = AuthManager::sanitize_tenant_id("abc; rm -rf / #");
        let args = AuthManager::build_token_args(MGMT, Some(&tenant));
        for arg in &args {
            assert!(
                !arg.contains(';')
                    && !arg.contains('|')
                    && !arg.contains('&')
                    && !arg.contains('$'),
                "arg {arg} must not carry shell metacharacters"
            );
        }
    }

    /// Reads `cli_path_override()` with `AZURE_CLI_PATH` set to `value`,
    /// restoring whatever the environment had before.
    fn override_with(value: &str) -> Option<PathBuf> {
        let previous = env::var_os("AZURE_CLI_PATH");
        // SAFETY: no other test reads or writes this variable.
        unsafe { env::set_var("AZURE_CLI_PATH", value) };
        let result = AuthManager::cli_path_override();
        match previous {
            Some(value) => unsafe { env::set_var("AZURE_CLI_PATH", value) },
            None => unsafe { env::remove_var("AZURE_CLI_PATH") },
        }
        result
    }

    // Each build mode gets its own hard-coded expectation. Deriving the
    // expectation from `cfg!(debug_assertions)` -- the very flag the
    // implementation branches on -- made the assertion true by construction:
    // deleting either arm of `cli_path_override` left the test green.
    #[cfg(debug_assertions)]
    #[test]
    fn cli_path_override_is_honoured_in_debug_builds() {
        assert_eq!(
            override_with("/tmp/definitely-not-az"),
            Some(PathBuf::from("/tmp/definitely-not-az")),
            "the developer escape hatch must work in debug builds"
        );
        assert_eq!(
            override_with(""),
            None,
            "an empty override must not shadow the real CLI"
        );
    }

    #[cfg(not(debug_assertions))]
    #[test]
    fn cli_path_override_is_compiled_out_of_release_builds() {
        // Anything able to set the app's environment would otherwise get code
        // execution in the app's context -- and the child is handed --tenant.
        assert_eq!(
            override_with("/tmp/definitely-not-az"),
            None,
            "release builds must ignore AZURE_CLI_PATH entirely"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_non_executable_az_does_not_shadow_the_real_cli() {
        use std::os::unix::fs::PermissionsExt;

        let dir = env::temp_dir().join(format!("azvault-az-probe-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let candidate = dir.join("az");
        std::fs::write(&candidate, b"#!/bin/sh\nexit 0\n").unwrap();

        // Mode 0o644: a plain file named `az` that the OS will not run.
        std::fs::set_permissions(&candidate, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(
            !AuthManager::is_executable_file(&candidate),
            "a non-executable file must not be taken for the Azure CLI"
        );

        std::fs::set_permissions(&candidate, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(AuthManager::is_executable_file(&candidate));

        // Owner-only execute still counts.
        std::fs::set_permissions(&candidate, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(AuthManager::is_executable_file(&candidate));

        assert!(
            !AuthManager::is_executable_file(&dir),
            "a directory is not a binary"
        );
        assert!(!AuthManager::is_executable_file(&dir.join("missing")));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn disallowed_resource_is_rejected_before_spawning_the_cli() {
        let auth = AuthManager::new();
        let err = auth
            .get_az_cli_token("https://graph.microsoft.com", None)
            .await
            .expect_err("graph must be rejected");
        assert_eq!(err, "Unsupported Azure CLI resource scope.");
    }

    #[test]
    fn allowed_resource_table() {
        let cases = [
            ("https://management.azure.com/", true),
            ("https://vault.azure.net", true),
            // near-miss variants must all be rejected
            ("https://management.azure.com", false),
            ("https://vault.azure.net/", false),
            ("HTTPS://MANAGEMENT.AZURE.COM/", false),
            ("https://management.azure.com/ ", false),
            ("https://graph.microsoft.com", false),
            ("https://management.azure.com.evil.com/", false),
            ("", false),
        ];
        for (resource, expected) in cases {
            assert_eq!(
                AuthManager::is_allowed_cli_resource(resource),
                expected,
                "resource={resource}"
            );
        }
    }
}

#[cfg(test)]
mod tenant_and_path_tests {
    use super::*;

    #[test]
    fn sanitize_tenant_id_table() {
        let cases = [
            // (input, expected)
            (
                "12345678-abcd-ef01-2345-6789abcdef01",
                "12345678-abcd-ef01-2345-6789abcdef01",
            ),
            ("organizations", "organizations"),
            ("", "organizations"),
            ("!!@@##", "organizations"),
            ("   ", "organizations"),
            ("\n\t", "organizations"),
            // domain-style tenants are valid and must survive intact
            ("contoso.onmicrosoft.com", "contoso.onmicrosoft.com"),
            ("  contoso.onmicrosoft.com  ", "contoso.onmicrosoft.com"),
            // anything that is neither a GUID nor a domain is rejected outright
            ("$(whoami)", "organizations"),
            ("`id`", "organizations"),
            ("--tenant", "organizations"),
            ("../../etc/passwd", "organizations"),
            ("ABCDEF-012345", "organizations"),
            ("12345678-abcd-ef01-2345-6789abcdefzz", "organizations"),
            ("evil.com; rm -rf /", "organizations"),
        ];
        for (input, expected) in cases {
            assert_eq!(
                AuthManager::sanitize_tenant_id(input),
                expected,
                "input={input:?}"
            );
        }
    }

    #[test]
    fn sanitize_tenant_id_output_is_always_shell_safe() {
        let hostile = [
            "a; rm -rf /",
            "a && curl evil.com",
            "a | nc evil 1234",
            "a\nb",
            "a'b\"c",
            "a$(id)",
            "a\0b",
            "-–—",
        ];
        for input in hostile {
            let out = AuthManager::sanitize_tenant_id(input);
            assert!(
                AuthManager::is_tenant_guid(&out)
                    || AuthManager::is_tenant_domain(&out)
                    || out == TENANT_DEFAULT,
                "input={input:?} produced unsafe output {out:?}"
            );
        }
    }

    #[tokio::test]
    async fn set_tenant_sanitises_before_storing() {
        let auth = AuthManager::new();
        auth.set_tenant("abc; rm -rf /").await;
        assert_eq!(auth.get_tenant().await, TENANT_DEFAULT);
    }

    #[tokio::test]
    async fn set_tenant_with_garbage_falls_back_to_default() {
        let auth = AuthManager::new();
        auth.set_tenant("!!!").await;
        assert_eq!(auth.get_tenant().await, TENANT_DEFAULT);
    }

    #[tokio::test]
    async fn set_tenant_is_idempotent_and_overwrites() {
        let auth = AuthManager::new();
        auth.set_tenant("aaaaaaaa-1111-2222-3333-444444444444")
            .await;
        auth.set_tenant("bbbbbbbb-1111-2222-3333-444444444444")
            .await;
        assert_eq!(
            auth.get_tenant().await,
            "bbbbbbbb-1111-2222-3333-444444444444"
        );
    }

    #[tokio::test]
    async fn tenant_state_is_shared_across_concurrent_readers() {
        let auth = std::sync::Arc::new(AuthManager::new());
        auth.set_tenant("abcdabcd-1234-1234-1234-123412341234")
            .await;

        let mut handles = Vec::new();
        for _ in 0..16 {
            let auth = auth.clone();
            handles.push(tokio::spawn(async move { auth.get_tenant().await }));
        }
        for handle in handles {
            assert_eq!(
                handle.await.unwrap(),
                "abcdabcd-1234-1234-1234-123412341234"
            );
        }
    }

    #[tokio::test]
    async fn sign_out_is_idempotent() {
        let auth = AuthManager::new();
        auth.sign_out().await;
        auth.sign_out().await;
        assert_eq!(auth.get_tenant().await, TENANT_DEFAULT);
    }

    // ── PATH resolution ──

    #[test]
    fn az_cli_search_paths_deduplicate_entries() {
        let paths = AuthManager::az_cli_search_paths(Some(OsStr::new("/usr/bin:/usr/bin:/opt/x")));
        let usr_bin = paths
            .iter()
            .filter(|p| *p == &PathBuf::from("/usr/bin"))
            .count();
        assert_eq!(usr_bin, 1, "duplicates should collapse");
    }

    #[test]
    fn az_cli_search_paths_skip_empty_segments() {
        let paths = AuthManager::az_cli_search_paths(Some(OsStr::new("/usr/bin::/opt/x")));
        assert!(!paths.iter().any(|p| p.as_os_str().is_empty()));
    }

    #[test]
    fn az_cli_search_paths_handles_absent_path_var() {
        let paths = AuthManager::az_cli_search_paths(None);
        #[cfg(target_os = "macos")]
        assert!(!paths.is_empty(), "macOS fallbacks should still apply");
        #[cfg(not(target_os = "macos"))]
        assert!(paths.is_empty());
    }

    #[test]
    fn push_unique_path_ignores_empty_candidates() {
        let mut paths = vec![PathBuf::from("/a")];
        AuthManager::push_unique_path(&mut paths, PathBuf::from(""));
        AuthManager::push_unique_path(&mut paths, PathBuf::from("/a"));
        AuthManager::push_unique_path(&mut paths, PathBuf::from("/b"));
        assert_eq!(paths, vec![PathBuf::from("/a"), PathBuf::from("/b")]);
    }

    #[test]
    fn build_command_path_round_trips_through_split_paths() {
        let built = AuthManager::build_command_path(Some(OsStr::new("/usr/bin:/opt/x")));
        let split: Vec<PathBuf> = env::split_paths(&built).collect();
        assert!(split.contains(&PathBuf::from("/usr/bin")));
        assert!(split.contains(&PathBuf::from("/opt/x")));
    }

    #[test]
    fn build_command_path_handles_empty_path_env() {
        let built = AuthManager::build_command_path(Some(OsStr::new("")));
        let split: Vec<PathBuf> = env::split_paths(&built).collect();

        #[cfg(target_os = "macos")]
        {
            // An empty inherited PATH is the GUI-launch case: the known-good
            // install directories must still be searched, or a Finder-launched
            // app can never find `az`.
            assert_eq!(
                split,
                MACOS_AZ_CLI_FALLBACK_DIRS
                    .iter()
                    .map(PathBuf::from)
                    .collect::<Vec<_>>()
            );
            assert!(
                !split.iter().any(|dir| dir.as_os_str().is_empty()),
                "an empty PATH entry means 'the current directory' to exec(3)"
            );
        }

        #[cfg(not(target_os = "macos"))]
        {
            // Nothing to fall back on: an empty PATH must stay empty rather
            // than become a relative lookup.
            assert!(
                split.iter().all(|dir| dir.as_os_str().is_empty()),
                "an empty PATH must not gain entries: {split:?}"
            );
        }
    }
}

#[cfg(test)]
mod token_payload_tests {
    use super::*;

    #[test]
    fn parses_access_token_from_realistic_cli_output() {
        let payload = br#"{
            "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.payload.sig",
            "expiresOn": "2026-01-01 00:00:00.000000",
            "subscription": "sub-id",
            "tenant": "tenant-id",
            "tokenType": "Bearer"
        }"#;
        let token = AuthManager::parse_cli_access_token(payload).expect("parse");
        assert_eq!(
            token.token,
            "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.payload.sig"
        );
        assert!(
            token.expires_at.is_some(),
            "a realistic local-time expiry must be understood, or every token is uncacheable"
        );
    }

    #[test]
    fn rejects_malformed_token_payloads() {
        let cases: Vec<&[u8]> = vec![
            b"",
            b"not json",
            b"{",
            b"null",
            b"[]",
            br#"{"expiresOn":"soon"}"#,
            br#"{"accessToken": null}"#,
            br#"{"accessToken": 12345}"#,
            br#"{"accessToken": {"nested": "x"}}"#,
            br#"{"AccessToken": "wrong-case"}"#,
        ];
        for payload in cases {
            assert!(
                AuthManager::parse_cli_access_token(payload).is_err(),
                "payload {:?} should not yield a token",
                String::from_utf8_lossy(payload)
            );
        }
    }

    #[test]
    fn accepts_empty_string_token_verbatim() {
        // Documented behaviour: emptiness is the CLI's problem, not the parser's.
        let token = AuthManager::parse_cli_access_token(br#"{"accessToken":""}"#).expect("parse");
        assert_eq!(token.token, "");
    }

    #[test]
    fn parse_errors_never_echo_the_raw_payload() {
        // A parse failure must not splice a partially-valid token into the message.
        let payload = br#"{"accessToken": "SUPERSECRETTOKEN""#;
        let err = AuthManager::parse_cli_access_token(payload).expect_err("truncated json");
        assert!(
            !err.contains("SUPERSECRETTOKEN"),
            "error must not leak token material: {err}"
        );
    }

    #[test]
    fn missing_token_error_is_actionable_and_secret_free() {
        let err = AuthManager::parse_cli_access_token(br#"{"expiresOn":"soon"}"#).unwrap_err();
        assert!(err.contains("accessToken"));
        assert!(!err.to_lowercase().contains("bearer"));
    }
}
