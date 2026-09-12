#!/bin/sh
# AzVault installer.
#
#   curl -fsSL https://raw.githubusercontent.com/TarasKovalenko/AzVault/main/install.sh | sh
#
# Flags:
#   -h, --help              Show this help and exit
#   --version <tag>         Install a specific release tag (default: latest)
#   --install-dir <dir>     Install into this directory instead of the default
#   --deb                   On Linux, install the .deb package instead of the AppImage
#   --skip-checksum         Continue even if the release has no SHA256SUMS asset
#   --uninstall             Remove the installed AzVault app/binary and exit
#
# Environment:
#   AZVAULT_VERSION             Same as --version
#   AZVAULT_REPO                GitHub "owner/repo" to install from (default: TarasKovalenko/AzVault)
#   AZVAULT_INSTALL_DIR         Same as --install-dir
#   AZVAULT_VERIFY_PROVENANCE   auto (default): verify with `gh attestation verify` when the
#                                GitHub CLI is present and the release has an attestation, ask
#                                before continuing otherwise. 1: require verification (installs
#                                the `gh` CLI dependency). 0: never verify.
#   AZVAULT_SKIP_CHECKSUM       1 is the same as --skip-checksum
#   NO_COLOR                    Disable colored output
set -eu

REPO="${AZVAULT_REPO:-TarasKovalenko/AzVault}"
APP="AzVault"

# ---- output helpers --------------------------------------------------------
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then
  c_red=''; c_yel=''; c_bold=''; c_dim=''; c_off=''
else
  c_red='\033[31m'; c_yel='\033[33m'; c_bold='\033[1m'; c_dim='\033[2m'; c_off='\033[0m'
fi
red()  { printf '%b%s%b\n' "$c_red" "$*" "$c_off" >&2; }
warn() { printf '%b%s%b\n' "$c_yel" "warning: $*" "$c_off" >&2; }
bold() { printf '%b%s%b\n' "$c_bold" "$*" "$c_off"; }
dim()  { printf '%b%s%b\n' "$c_dim" "$*" "$c_off"; }
die()  { red "error: $*"; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not installed"; }

show_help() {
  cat <<'HLP'
AzVault installer

Usage: install.sh [options]

Options:
  -h, --help              Show this help and exit
  --version <tag>         Install a specific release tag (default: latest)
  --install-dir <dir>     Install into this directory instead of the default
  --deb                   On Linux, install the .deb package instead of the AppImage
  --skip-checksum         Continue even if the release has no SHA256SUMS asset
  --uninstall             Remove the installed AzVault app/binary and exit

Environment variables:
  AZVAULT_VERSION             Same as --version
  AZVAULT_REPO                GitHub "owner/repo" to install from (default: TarasKovalenko/AzVault)
  AZVAULT_INSTALL_DIR         Same as --install-dir
  AZVAULT_VERIFY_PROVENANCE   auto (default), 1 (require), or 0 (skip) gh attestation verification
  AZVAULT_SKIP_CHECKSUM       1 is the same as --skip-checksum
  NO_COLOR                    Disable colored output

Examples:
  curl -fsSL https://raw.githubusercontent.com/TarasKovalenko/AzVault/main/install.sh | sh
  curl -fsSL https://raw.githubusercontent.com/TarasKovalenko/AzVault/main/install.sh | sh -s -- --version v1.2.3
  ./install.sh --uninstall
HLP
}

# ---- argument parsing -------------------------------------------------------
version="${AZVAULT_VERSION:-}"
install_dir="${AZVAULT_INSTALL_DIR:-}"
skip_checksum="${AZVAULT_SKIP_CHECKSUM:-0}"
uninstall=0
want_deb=0

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) show_help; exit 0 ;;
    --version) [ $# -ge 2 ] || die "--version requires an argument"; version="$2"; shift 2 ;;
    --version=*) version="${1#*=}"; shift ;;
    --install-dir) [ $# -ge 2 ] || die "--install-dir requires an argument"; install_dir="$2"; shift 2 ;;
    --install-dir=*) install_dir="${1#*=}"; shift ;;
    --deb) want_deb=1; shift ;;
    --skip-checksum) skip_checksum=1; shift ;;
    --uninstall) uninstall=1; shift ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

# ---- platform detection -----------------------------------------------------
need uname
os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Darwin) platform=macos ;;
  Linux) platform=linux ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    die "this script does not support Windows. Download AzVault-*.msi or AzVault-*.exe from https://github.com/$REPO/releases/latest" ;;
  *) die "unsupported operating system: $os" ;;
esac

case "$arch" in
  x86_64|amd64) arch_part=x86_64 ;;
  arm64|aarch64) arch_part=aarch64 ;;
  *) die "unsupported architecture: $arch" ;;
esac

# ---- uninstall mode ----------------------------------------------------------
do_uninstall() {
  removed=0
  case "$platform" in
    macos)
      for d in "$install_dir" /Applications "$HOME/Applications"; do
        [ -n "$d" ] || continue
        if [ -d "$d/$APP.app" ]; then
          dim "  removing $d/$APP.app"
          rm -rf "$d/$APP.app"
          removed=1
        fi
      done
      [ "$removed" = "1" ] || warn "$APP.app was not found in /Applications or ~/Applications"
      ;;
    linux)
      for d in "$install_dir" "$HOME/.local/bin" /usr/local/bin; do
        [ -n "$d" ] || continue
        if [ -f "$d/$APP.AppImage" ]; then
          dim "  removing $d/$APP.AppImage"
          rm -f "$d/$APP.AppImage"
          removed=1
        fi
      done
      if command -v dpkg >/dev/null 2>&1 && dpkg -s azvault >/dev/null 2>&1; then
        dim "  removing the azvault deb package"
        if [ "$(id -u)" = "0" ]; then
          dpkg -r azvault
        elif command -v sudo >/dev/null 2>&1; then
          sudo dpkg -r azvault
        else
          warn "azvault is installed via dpkg but this script has no permission to remove it; run: sudo dpkg -r azvault"
        fi
        removed=1
      fi
      [ "$removed" = "1" ] || warn "no installed $APP AppImage or deb package was found"
      ;;
  esac
  bold "Uninstall complete"
}

if [ "$uninstall" = "1" ]; then
  do_uninstall
  exit 0
fi

# ---- dependencies ------------------------------------------------------------
if command -v curl >/dev/null 2>&1; then
  download() { curl -fsSL --proto '=https' --tlsv1.2 -o "$2" "$1"; }
  # $1=url $2=output-file-for-body; prints the HTTP status code (or 000 if the
  # request never reached the server) so callers can tell "not found" apart
  # from a real network failure.
  fetch_with_status() {
    curl -sS -o "$2" -w '%{http_code}' "$1" 2>/dev/null || printf '000'
  }
elif command -v wget >/dev/null 2>&1; then
  download() { wget -qO "$2" "$1"; }
  fetch_with_status() {
    hdr="$(mktemp)"
    # Under `set -e` an unguarded wget would abort the script on any non-200,
    # skipping the diagnostics the caller prints from the status code.
    wget -q -S -O "$2" "$1" 2>"$hdr" || true
    code="$(awk '/^  HTTP\// {c=$2} END {print c}' "$hdr")"
    rm -f "$hdr"
    [ -n "$code" ] && printf '%s' "$code" || printf '000'
  }
else
  die "either curl or wget is required"
fi
[ "$platform" != "macos" ] || need unzip

# ---- work dir ---------------------------------------------------------------
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

# ---- version resolution -------------------------------------------------------
if [ -n "$version" ]; then
  api_url="https://api.github.com/repos/$REPO/releases/tags/$version"
else
  api_url="https://api.github.com/repos/$REPO/releases/latest"
fi

release_body="$tmp/release.json"
http_status="$(fetch_with_status "$api_url" "$release_body")"
release_json="$(cat "$release_body" 2>/dev/null || true)"

if [ "$http_status" != "200" ] && [ -z "$version" ] \
   && [ "$http_status" != "403" ] && [ "$http_status" != "429" ] \
   && command -v curl >/dev/null 2>&1; then
  # api.github.com may be briefly unavailable; the plain releases redirect
  # lives on a different host and bucket, and often still resolves the
  # latest tag.
  fallback_url="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" 2>/dev/null || true)"
  case "$fallback_url" in
    */releases/tag/*)
      version="${fallback_url##*/releases/tag/}"
      api_url="https://api.github.com/repos/$REPO/releases/tags/$version"
      http_status="$(fetch_with_status "$api_url" "$release_body")"
      release_json="$(cat "$release_body" 2>/dev/null || true)"
      ;;
  esac
fi

if [ "$http_status" != "200" ]; then
  case "$http_status" in
    404)
      if [ -n "$version" ]; then
        die "release $version was not found in $REPO. Check https://github.com/$REPO/releases for available tags."
      else
        die "no releases were found for $REPO. Check https://github.com/$REPO/releases."
      fi
      ;;
    403|429)
      die "GitHub API rate limit exceeded while looking up $REPO releases. Wait a while and retry, or authenticate with a GitHub token to raise the limit."
      ;;
    *)
      die "could not reach the GitHub API for $REPO releases (network issue, HTTP status: ${http_status:-unknown}). Check your network connection and retry later."
      ;;
  esac
fi

tag_name="$(printf '%s\n' "$release_json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
[ -n "$tag_name" ] || die "unexpected response from the GitHub API for $REPO (no tag_name found); see https://github.com/$REPO/releases"
version="$tag_name"

# ---- asset discovery -----------------------------------------------------
# GitHub's API prints each asset's "name" immediately before its
# "browser_download_url" within the same object, so a single pass pairs them
# without needing jq.
assets="$(printf '%s\n' "$release_json" | awk '
  /"assets"[[:space:]]*:/ { in_assets=1 }
  in_assets && /"name"[[:space:]]*:/ {
    line=$0
    sub(/^[^:]*:[[:space:]]*"/,"",line)
    sub(/",?[[:space:]]*$/,"",line)
    name=line
    next
  }
  in_assets && /"browser_download_url"[[:space:]]*:/ {
    line=$0
    sub(/^[^:]*:[[:space:]]*"/,"",line)
    sub(/",?[[:space:]]*$/,"",line)
    print name "@@" line
  }
')"
[ -n "$assets" ] || die "release $version has no downloadable assets at all. This looks like a release that was published without any build artifacts attached; see https://github.com/$REPO/releases/tag/$version (or https://github.com/$REPO/releases for another version)."

find_asset_exact() {
  printf '%s\n' "$assets" | awk -F'@@' -v n="$1" '$1 == n {print; exit}'
}
find_asset() {
  printf '%s\n' "$assets" | awk -F'@@' -v pat="$1" '$1 ~ pat {print; exit}'
}

sums_entry="$(find_asset_exact "SHA256SUMS")"
[ -n "$sums_entry" ] || sums_entry="$(find_asset_exact "AzVault-${version}-SHA256SUMS")"

# ---- checksum verification ---------------------------------------------------
sums_file=""
verify_checksum() {
  file="$1"
  name="$2"

  if [ -z "$sums_entry" ]; then
    if [ "$skip_checksum" = "1" ]; then
      warn "no SHA256SUMS asset in release $version; skipping checksum verification"
      return 0
    fi
    die "no SHA256SUMS asset in release $version; re-run with --skip-checksum (or AZVAULT_SKIP_CHECKSUM=1) to install without verifying checksums"
  fi

  if [ -z "$sums_file" ]; then
    sums_name="${sums_entry%%@@*}"
    sums_url="${sums_entry#*@@}"
    dim "  downloading $sums_name"
    download "$sums_url" "$tmp/$sums_name"
    sums_file="$tmp/$sums_name"
  fi

  expected="$(awk -v f="$name" '$2 == f || $2 == ("*" f) {print $1; exit}' "$sums_file")"
  [ -n "$expected" ] || die "no checksum entry for $name in $(basename "$sums_file")"

  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$file" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  else
    die "sha256sum or shasum is required to verify checksums (or pass --skip-checksum)"
  fi

  [ "$actual" = "$expected" ] || die "checksum mismatch for $name (expected $expected, got $actual)"
  dim "  checksum verified"
}

# ---- build provenance verification -------------------------------------------
verify_provenance() {
  gh attestation verify "$1" --repo "$REPO" \
    --signer-workflow "$REPO/.github/workflows/release.yml" \
    --source-ref "refs/tags/$version" --deny-self-hosted-runners 2>"$tmp/gh.err"
}
unsigned_release() {
  grep -qiE 'HTTP 404|no attestations found' "$tmp/gh.err" 2>/dev/null
}
cannot_verify() {
  unsigned_release || grep -qiE \
    'gh auth login|authentication|not logged|HTTP 401|HTTP 403|dial tcp|no such host|connection refused|timeout|i/o timeout' \
    "$tmp/gh.err" 2>/dev/null
}
reason_cannot_verify() {
  if unsigned_release; then
    echo "$version has no build provenance attestation to check"
  else
    echo "cannot reach GitHub to check this release's build provenance"
  fi
}
has_tty() { { true </dev/tty; } 2>/dev/null; }
confirm() {
  printf '%b%s [y/N] %b' "$c_bold" "$1" "$c_off" >/dev/tty
  read -r reply </dev/tty || return 1
  case "$reply" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}
unverified_provenance() {
  warn "$1"
  warn "only the SHA-256 checksum vouches for this download"
  if has_tty; then
    confirm "Install $APP $version without verified build provenance?" || die "cancelled"
    dim "  continuing without provenance verification"
  else
    warn "no terminal to ask on; continuing with the checksum alone"
    dim "  set AZVAULT_VERIFY_PROVENANCE=1 to make this fatal instead"
  fi
}
check_provenance() {
  file="$1"
  case "${AZVAULT_VERIFY_PROVENANCE:-auto}" in
    auto)
      if ! command -v gh >/dev/null 2>&1; then
        unverified_provenance "cannot verify build provenance: the GitHub CLI (gh) is not installed"
      elif verify_provenance "$file"; then
        dim "  signed build provenance verified"
      elif cannot_verify; then
        unverified_provenance "$(reason_cannot_verify)"
      else
        cat "$tmp/gh.err" >&2
        die "release provenance verification failed; nothing installed"
      fi
      ;;
    1)
      need gh
      verify_provenance "$file" || { cat "$tmp/gh.err" >&2; die "release provenance verification failed; nothing installed"; }
      dim "  signed build provenance verified"
      ;;
    0) dim "  provenance verification disabled (AZVAULT_VERIFY_PROVENANCE=0)" ;;
    *) die "AZVAULT_VERIFY_PROVENANCE must be auto, 1, or 0" ;;
  esac
}

# ---- platform installers ------------------------------------------------------
install_macos() {
  file="$1"
  extract_dir="$tmp/extracted"
  mkdir -p "$extract_dir"
  dim "  unzipping $(basename "$file")"
  unzip -q "$file" -d "$extract_dir"
  app_path="$(find "$extract_dir" -maxdepth 1 -type d -name '*.app' | head -n1)"
  [ -n "$app_path" ] || die "downloaded archive did not contain an .app bundle"

  target_dir="$install_dir"
  if [ -z "$target_dir" ]; then
    if [ -w /Applications ] || [ "$(id -u)" = "0" ]; then
      target_dir=/Applications
    else
      target_dir="$HOME/Applications"
    fi
  fi
  mkdir -p "$target_dir" 2>/dev/null || true
  if [ ! -w "$target_dir" ]; then
    warn "$target_dir is not writable; installing into $HOME/Applications instead"
    target_dir="$HOME/Applications"
    mkdir -p "$target_dir"
  fi

  dest="$target_dir/$APP.app"
  if [ -d "$dest" ]; then
    dim "  removing previous install at $dest"
    rm -rf "$dest"
  fi
  cp -R "$app_path" "$dest"

  dim "  removing the quarantine attribute (build is ad-hoc signed, not notarized)"
  xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true

  bold "Installed $dest"
  cat <<NOTE

$APP is ad-hoc signed, not notarized, so Gatekeeper may still flag it on the
very first launch. If it does: right-click $APP.app in Finder, choose Open,
then Open again to confirm. After that it launches normally.
NOTE
}

install_linux_appimage() {
  file="$1"
  target_dir="$install_dir"
  if [ -z "$target_dir" ]; then
    if [ "$(id -u)" = "0" ]; then
      target_dir=/usr/local/bin
    else
      target_dir="$HOME/.local/bin"
    fi
  fi
  mkdir -p "$target_dir"
  dest="$target_dir/$APP.AppImage"
  cp "$file" "$dest"
  chmod +x "$dest"
  bold "Installed $dest"
  case ":$PATH:" in
    *":$target_dir:"*) dim "  run: $APP.AppImage" ;;
    *)
      printf '\n'
      warn "$target_dir is not on your PATH"
      dim "  add this to your shell profile:"
      # shellcheck disable=SC2016 # $PATH must stay literal in the printed line
      printf '\n    export PATH="%s:$PATH"\n\n' "$target_dir"
      ;;
  esac
}

install_linux_deb() {
  file="$1"
  if [ "$(id -u)" = "0" ] && command -v dpkg >/dev/null 2>&1; then
    dpkg -i "$file" || { command -v apt-get >/dev/null 2>&1 && apt-get -f install -y; }
    bold "Installed $APP (deb package)"
  elif command -v sudo >/dev/null 2>&1 && command -v dpkg >/dev/null 2>&1; then
    sudo dpkg -i "$file" || { command -v apt-get >/dev/null 2>&1 && sudo apt-get -f install -y; }
    bold "Installed $APP (deb package)"
  else
    dest_dir="${install_dir:-$HOME/Downloads}"
    mkdir -p "$dest_dir"
    dest="$dest_dir/$(basename "$file")"
    cp "$file" "$dest"
    bold "Saved $dest"
    dim "  install it with: sudo dpkg -i \"$dest\""
  fi
}

# ---- select asset and install -------------------------------------------------
case "$platform" in
  macos)
    zip_entry="$(find_asset_exact "AzVault-macos-${arch_part}.app.zip")"
    [ -n "$zip_entry" ] || die "release $version has no downloadable asset for macOS ($arch_part): expected AzVault-macos-${arch_part}.app.zip. See https://github.com/$REPO/releases/tag/$version for what this release does include, or https://github.com/$REPO/releases for another version."
    asset_name="${zip_entry%%@@*}"
    asset_url="${zip_entry#*@@}"
    bold "$APP $version for macOS ($arch_part)"
    dim "  downloading $asset_name"
    download "$asset_url" "$tmp/$asset_name"
    verify_checksum "$tmp/$asset_name" "$asset_name"
    check_provenance "$tmp/$asset_name"
    install_macos "$tmp/$asset_name"
    ;;
  linux)
    [ "$arch_part" = "x86_64" ] || die "AzVault does not currently publish a Linux $arch_part build; only x86_64 .deb/.AppImage assets are available. Open an issue at https://github.com/$REPO/issues if you need $arch_part support."

    appimage_entry="$(find_asset '\.AppImage$')"
    deb_entry="$(find_asset '\.deb$')"

    use_deb="$want_deb"
    if [ "$use_deb" = "0" ] && [ -z "$appimage_entry" ]; then
      warn "no .AppImage asset in release $version; falling back to the .deb package"
      use_deb=1
    fi

    if [ "$use_deb" = "1" ]; then
      [ -n "$deb_entry" ] || die "release $version has no downloadable .deb or .AppImage asset for Linux. See https://github.com/$REPO/releases/tag/$version for what this release does include, or https://github.com/$REPO/releases for another version."
      asset_name="${deb_entry%%@@*}"
      asset_url="${deb_entry#*@@}"
      bold "$APP $version for Linux ($arch_part, .deb)"
      dim "  downloading $asset_name"
      download "$asset_url" "$tmp/$asset_name"
      verify_checksum "$tmp/$asset_name" "$asset_name"
      check_provenance "$tmp/$asset_name"
      install_linux_deb "$tmp/$asset_name"
    else
      asset_name="${appimage_entry%%@@*}"
      asset_url="${appimage_entry#*@@}"
      bold "$APP $version for Linux ($arch_part, AppImage)"
      dim "  downloading $asset_name"
      download "$asset_url" "$tmp/$asset_name"
      verify_checksum "$tmp/$asset_name" "$asset_name"
      check_provenance "$tmp/$asset_name"
      install_linux_appimage "$tmp/$asset_name"
    fi
    ;;
esac
