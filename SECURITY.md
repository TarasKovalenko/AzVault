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

## Supported Versions

Only the latest mainline version is currently supported for security fixes.
