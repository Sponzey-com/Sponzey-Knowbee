#!/bin/sh
set -eu
umask 077

REPOSITORY_URL="https://github.com/Sponzey-com/Sponzey-Knowbee"
VERIFIER_SHA256_DARWIN_ARM64="@@VERIFIER_SHA256_DARWIN_ARM64@@"
VERIFIER_SHA256_DARWIN_X64="@@VERIFIER_SHA256_DARWIN_X64@@"
VERIFIER_SHA256_LINUX_X64="@@VERIFIER_SHA256_LINUX_X64@@"

release_version="latest"
non_interactive="false"
with_yeonjang="false"
install_service="true"
start_service="true"
add_path="true"
open_browser="true"
dry_run="false"
json_output="false"
offline_manifest=""
offline_bundle_directory=""
installer_locale="auto"
temporary_directory=""

reject() {
  if [ "$json_output" = "true" ]; then
    printf '{"status":"rejected","reasonCode":"%s"}\n' "$1" >&2
  else
    printf 'Knowbee installer stopped: %s\n' "$1" >&2
  fi
  exit 1
}

usage() {
  printf '%s\n' 'Usage: install.sh [--version VERSION] [--with-yeonjang] [--no-service|--no-start] [--non-interactive] [--add-path|--no-add-path] [--dry-run] [--json] [--manifest PATH --bundle-dir DIR] [--no-browser] [--locale auto|en|ko] [--help]'
}

seen_version="false"
seen_service="false"
seen_start="false"
seen_add_path="false"
seen_manifest="false"
seen_bundle_directory="false"
seen_locale="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      [ "$#" -ge 2 ] || reject "installer_arguments_invalid"
      [ "$seen_version" = "false" ] || reject "installer_option_duplicate"
      seen_version="true"
      release_version="$2"
      shift 2
      ;;
    --with-yeonjang)
      [ "$with_yeonjang" = "false" ] || reject "installer_option_duplicate"
      with_yeonjang="true"
      shift
      ;;
    --no-service)
      [ "$seen_service" = "false" ] && [ "$seen_start" = "false" ] || reject "installer_option_conflict"
      seen_service="true"
      install_service="false"
      start_service="false"
      shift
      ;;
    --no-start)
      [ "$seen_start" = "false" ] && [ "$seen_service" = "false" ] || reject "installer_option_conflict"
      seen_start="true"
      start_service="false"
      shift
      ;;
    --non-interactive)
      [ "$non_interactive" = "false" ] || reject "installer_option_duplicate"
      non_interactive="true"
      shift
      ;;
    --add-path)
      [ "$seen_add_path" = "false" ] || reject "installer_option_conflict"
      seen_add_path="true"
      add_path="true"
      shift
      ;;
    --no-add-path)
      [ "$seen_add_path" = "false" ] || reject "installer_option_conflict"
      seen_add_path="true"
      add_path="false"
      shift
      ;;
    --dry-run) [ "$dry_run" = "false" ] || reject "installer_option_duplicate" ; dry_run="true" ; shift ;;
    --json) [ "$json_output" = "false" ] || reject "installer_option_duplicate" ; json_output="true" ; shift ;;
    --manifest)
      [ "$#" -ge 2 ] && [ "$seen_manifest" = "false" ] || reject "installer_arguments_invalid"
      seen_manifest="true"
      offline_manifest="$2"
      shift 2
      ;;
    --bundle-dir)
      [ "$#" -ge 2 ] && [ "$seen_bundle_directory" = "false" ] || reject "installer_arguments_invalid"
      seen_bundle_directory="true"
      offline_bundle_directory="$2"
      shift 2
      ;;
    --no-browser)
      [ "$open_browser" = "true" ] || reject "installer_option_duplicate"
      open_browser="false"
      shift
      ;;
    --locale)
      [ "$#" -ge 2 ] && [ "$seen_locale" = "false" ] || reject "installer_arguments_invalid"
      seen_locale="true"
      installer_locale="$2"
      shift 2
      ;;
    --help|-h)
      [ "$#" -eq 1 ] || reject "installer_option_conflict"
      usage
      exit 0
      ;;
    *) reject "installer_arguments_invalid" ;;
  esac
done

[ "$seen_manifest" = "$seen_bundle_directory" ] || reject "installer_offline_inputs_incomplete"
case "$installer_locale" in auto|en|ko) ;; *) reject "installer_locale_unsupported" ;; esac
[ "$json_output" = "false" ] || [ "$dry_run" = "true" ] || [ "$non_interactive" = "true" ] || reject "installer_json_requires_non_interactive"

case "$release_version" in
  latest) release_path="latest/download" ;;
  *[!0-9A-Za-z.+-]*|'') reject "installer_version_invalid" ;;
  *) release_path="download/v${release_version#v}" ;;
esac

operating_system=$(uname -s 2>/dev/null) || reject "host_probe_failed"
machine=$(uname -m 2>/dev/null) || reject "host_probe_failed"
case "$operating_system:$machine" in
  Darwin:arm64) target="darwin-arm64" ; verifier_sha256="$VERIFIER_SHA256_DARWIN_ARM64" ;;
  Darwin:x86_64)
    if [ "$(sysctl -in sysctl.proc_translated 2>/dev/null || printf '0')" = "1" ]; then
      target="darwin-arm64"
      verifier_sha256="$VERIFIER_SHA256_DARWIN_ARM64"
    else
      target="darwin-x64"
      verifier_sha256="$VERIFIER_SHA256_DARWIN_X64"
    fi
    ;;
  Linux:x86_64|Linux:amd64) target="linux-x64" ; verifier_sha256="$VERIFIER_SHA256_LINUX_X64" ;;
  *) reject "host_target_unsupported" ;;
esac

if [ "$operating_system" = "Darwin" ]; then
  os_version=$(sw_vers -productVersion 2>/dev/null) || reject "host_os_version_unavailable"
  os_major=${os_version%%.*}
  os_remainder=${os_version#*.}
  os_minor=${os_remainder%%.*}
  case "$os_major:$os_minor" in *[!0-9:]*|:) reject "host_os_version_invalid" ;; esac
  if [ "$os_major" -lt 13 ] || { [ "$os_major" -eq 13 ] && [ "$os_minor" -lt 5 ]; }; then
    reject "host_os_version_unsupported"
  fi
else
  kernel_version=$(uname -r 2>/dev/null) || reject "host_kernel_unavailable"
  kernel_major=${kernel_version%%.*}
  kernel_remainder=${kernel_version#*.}
  kernel_minor=${kernel_remainder%%.*}
  case "$kernel_major:$kernel_minor" in *[!0-9:]*|:) reject "host_kernel_invalid" ;; esac
  if [ "$kernel_major" -lt 4 ] || { [ "$kernel_major" -eq 4 ] && [ "$kernel_minor" -lt 18 ]; }; then
    reject "host_kernel_unsupported"
  fi
  libc_version=$(getconf GNU_LIBC_VERSION 2>/dev/null || true)
  case "$libc_version" in 'glibc '*) libc_version=${libc_version#glibc } ;; *) reject "host_libc_unsupported" ;; esac
  libc_major=${libc_version%%.*}
  libc_minor=${libc_version#*.}
  case "$libc_major:$libc_minor" in *[!0-9:]*|:) reject "host_libc_unsupported" ;; esac
  if [ "$libc_major" -lt 2 ] || { [ "$libc_major" -eq 2 ] && [ "$libc_minor" -lt 28 ]; }; then
    reject "host_libc_unsupported"
  fi
fi

if [ "$json_output" = "true" ] && [ "$dry_run" = "true" ]; then
  printf '{"status":"dry_run","target":"%s","release":"%s","offline":%s,"withYeonjang":%s,"service":%s,"start":%s,"addPath":%s,"browser":%s}\n' \
    "$target" "$release_version" "$seen_manifest" "$with_yeonjang" "$install_service" "$start_service" "$add_path" "$open_browser"
elif [ "$dry_run" = "true" ]; then
  printf 'Knowbee dry run: target=%s release=%s offline=%s yeonjang=%s service=%s start=%s add-path=%s browser=%s\n' \
    "$target" "$release_version" "$seen_manifest" "$with_yeonjang" "$install_service" "$start_service" "$add_path" "$open_browser"
fi
[ "$dry_run" = "true" ] && exit 0

[ "$json_output" = "true" ] || printf 'Knowbee install summary: target=%s release=%s profile=standard\n' "$target" "$release_version"
[ "$json_output" = "true" ] || printf '%s\n' 'Knowbee warning: unsigned_origin_unverified; publisher identity is not cryptographically authenticated.'
if [ "$non_interactive" != "true" ]; then
  [ -r /dev/tty ] || reject "interactive_confirmation_required"
  printf '%s' 'Continue? [y/N] ' >/dev/tty
  IFS= read -r answer </dev/tty || reject "interactive_confirmation_required"
  case "$answer" in y|Y|yes|YES) ;; *) reject "user_cancelled" ;; esac
fi

cleanup() {
  if [ -n "$temporary_directory" ] && [ -d "$temporary_directory" ]; then
    rm -rf -- "$temporary_directory"
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 129' HUP
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM
temporary_directory=$(mktemp -d "/tmp/knowbee-installer.XXXXXXXX") || reject "temporary_directory_failed"

validate_effective_url() {
  case "$1" in
    "$REPOSITORY_URL"/releases/*|https://release-assets.githubusercontent.com/*) return 0 ;;
    *) reject "download_redirect_untrusted" ;;
  esac
}

download_asset() {
  asset_name="$1"
  destination="$2"
  maximum_bytes="$3"
  asset_url="$REPOSITORY_URL/releases/$release_path/$asset_name"
  effective_url=$(curl -fsSL --proto '=https' --proto-redir '=https' \
    --connect-timeout 15 --max-time 300 --max-filesize "$maximum_bytes" --output "$destination" \
    --write-out '%{url_effective}' "$asset_url") || reject "download_failed"
  validate_effective_url "$effective_url"
  [ -s "$destination" ] || reject "download_empty"
  actual_bytes=$(wc -c <"$destination") || reject "download_size_unavailable"
  [ "$actual_bytes" -le "$maximum_bytes" ] || reject "download_oversized"
}

copy_local_asset() {
  source_path="$1"
  destination="$2"
  maximum_bytes="$3"
  [ -f "$source_path" ] && [ ! -L "$source_path" ] || reject "offline_asset_unsafe"
  actual_bytes=$(wc -c <"$source_path") || reject "offline_asset_size_unavailable"
  [ "$actual_bytes" -gt 0 ] && [ "$actual_bytes" -le "$maximum_bytes" ] || reject "offline_asset_oversized"
  cp "$source_path" "$destination" || reject "offline_asset_copy_failed"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    reject "sha256_tool_unavailable"
  fi
}

manifest_path="$temporary_directory/installer-manifest.json"
verifier_path="$temporary_directory/knowbee-installer-verify"
receipt_path="$temporary_directory/verified-receipt"
if [ "$seen_manifest" = "true" ]; then
  [ -d "$offline_bundle_directory" ] && [ ! -L "$offline_bundle_directory" ] || reject "offline_bundle_directory_unsafe"
  offline_manifest_directory=$(dirname -- "$offline_manifest") || reject "offline_manifest_path_invalid"
  copy_local_asset "$offline_manifest" "$manifest_path" 2097152
  copy_local_asset "$offline_bundle_directory/knowbee-installer-verify-$target" "$verifier_path" 67108864
else
  download_asset "installer-manifest.json" "$manifest_path" 2097152
  download_asset "knowbee-installer-verify-$target" "$verifier_path" 67108864
fi

actual_verifier_sha256=$(sha256_file "$verifier_path")
[ "$actual_verifier_sha256" = "$verifier_sha256" ] || reject "verifier_digest_mismatch"
chmod 700 "$verifier_path" || reject "verifier_permission_failed"
"$verifier_path" \
  --manifest "$manifest_path" \
  --target "$target" \
  --output-format shell >"$receipt_path" || reject "manifest_verification_failed"

parse_receipt() {
  receipt_target=""
  receipt_release_version=""
  receipt_name=""
  receipt_sha256=""
  receipt_size_bytes=""
  receipt_entrypoint=""
  receipt_staged_entrypoint=""
  while IFS='=' read -r receipt_key receipt_value; do
    case "$receipt_key" in
      target) [ -z "$receipt_target" ] || reject "verifier_receipt_invalid" ; receipt_target="$receipt_value" ;;
      release_version) [ -z "$receipt_release_version" ] || reject "verifier_receipt_invalid" ; receipt_release_version="$receipt_value" ;;
      name) [ -z "$receipt_name" ] || reject "verifier_receipt_invalid" ; receipt_name="$receipt_value" ;;
      sha256) [ -z "$receipt_sha256" ] || reject "verifier_receipt_invalid" ; receipt_sha256="$receipt_value" ;;
      size_bytes) [ -z "$receipt_size_bytes" ] || reject "verifier_receipt_invalid" ; receipt_size_bytes="$receipt_value" ;;
      entrypoint) [ -z "$receipt_entrypoint" ] || reject "verifier_receipt_invalid" ; receipt_entrypoint="$receipt_value" ;;
      staged_entrypoint) [ -z "$receipt_staged_entrypoint" ] || reject "verifier_receipt_invalid" ; receipt_staged_entrypoint="$receipt_value" ;;
      manifest_sha256|node_version|node_module_abi|archive) ;;
      *) reject "verifier_receipt_invalid" ;;
    esac
  done <"$receipt_path"
  [ "$receipt_target" = "$target" ] || reject "verifier_receipt_target_mismatch"
  [ -n "$receipt_release_version" ] && [ -n "$receipt_name" ] && [ -n "$receipt_sha256" ] && \
    [ -n "$receipt_size_bytes" ] && [ -n "$receipt_entrypoint" ] || reject "verifier_receipt_invalid"
  case "$receipt_name" in [A-Za-z0-9]*[!A-Za-z0-9._-]*|'') reject "verifier_receipt_invalid" ;; esac
  case "$receipt_size_bytes" in *[!0-9]*|'') reject "verifier_receipt_invalid" ;; esac
  case "$receipt_entrypoint" in /*|*\\*|*../*|../*|'') reject "verifier_receipt_invalid" ;; esac
}

parse_receipt
[ "$json_output" = "true" ] || printf 'Knowbee bootstrap verified: target=%s release=%s artifact=%s\n' \
  "$receipt_target" "$receipt_release_version" "$receipt_name"

artifact_path="$temporary_directory/$receipt_name"
stage_path="$temporary_directory/stage"
if [ "$seen_manifest" = "true" ]; then
  copy_local_asset "$offline_bundle_directory/$receipt_name" "$artifact_path" "$receipt_size_bytes"
else
  download_asset "$receipt_name" "$artifact_path" "$receipt_size_bytes"
fi
"$verifier_path" \
  --manifest "$manifest_path" \
  --target "$target" \
  --artifact "$artifact_path" \
  --stage "$stage_path" \
  --output-format shell >"$receipt_path" || reject "artifact_staging_failed"
parse_receipt
[ -n "$receipt_staged_entrypoint" ] || reject "verifier_receipt_invalid"
[ "$receipt_staged_entrypoint" = "$receipt_entrypoint" ] || reject "verifier_receipt_entrypoint_mismatch"
entrypoint_path="$stage_path/$receipt_staged_entrypoint"
[ -f "$entrypoint_path" ] && [ -x "$entrypoint_path" ] || reject "install_entrypoint_invalid"
set -- installer apply \
  --manifest "$manifest_path" \
  --verified-receipt "$receipt_path" \
  --target "$target"
[ "$with_yeonjang" = "true" ] && set -- "$@" --with-yeonjang
[ "$install_service" = "false" ] && set -- "$@" --no-service
[ "$install_service" = "true" ] && [ "$start_service" = "false" ] && set -- "$@" --no-start
[ "$add_path" = "false" ] && set -- "$@" --no-add-path
[ "$open_browser" = "false" ] && set -- "$@" --no-browser
[ "$json_output" = "true" ] && set -- "$@" --json
"$entrypoint_path" "$@" || reject "install_application_failed"
[ "$json_output" = "true" ] || printf 'Knowbee installation completed: target=%s release=%s\n' "$receipt_target" "$receipt_release_version"
