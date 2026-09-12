# Security Policy

## Reporting a Vulnerability

Please do **not** open public issues for security vulnerabilities.

Report vulnerabilities privately to project maintainers with:
- Impact summary
- Reproduction steps
- Affected version/commit
- Suggested mitigation (if known)

We will acknowledge receipt and aim to provide remediation guidance promptly.

## Security Guarantees (Current)

- Secret values are never auto-fetched.
- Secret-related audit data is sanitized/redacted.
- Backend validates vault URI host and secret names.
- Backend blocks outbound calls to non-Azure hosts.
- Authentication uses Azure CLI external session (`az login`).
- Audit entries for sensitive actions are redacted at the storage boundary, not
  only on export, and the audit file is created with `0600` permissions.
- Audit entries for mutations and value reads are written to disk before the
  operation reports success; read-only listings are coalesced and flushed on exit.
- Tenant identifiers are validated as a GUID or verified domain before reaching
  the `az` command line; anything else falls back to `organizations`.
- CSV exports neutralise spreadsheet formula triggers (`=`, `+`, `-`, `@`).
- Pagination follows only links on the origin the request started from, so a
  vault response cannot redirect an access token to another host.
- The production CSP allows no inline scripts (`script-src 'self'`).
- Release assets are published with a `SHA256SUMS` manifest; `install.sh`
  verifies it and refuses to install on mismatch.

## Supported Versions

Only the latest mainline version is currently supported for security fixes.
