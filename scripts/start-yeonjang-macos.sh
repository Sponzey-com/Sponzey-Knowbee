#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS_DIR="$ROOT_DIR/pids"
LOGS_DIR="$ROOT_DIR/logs"
PID_FILE="$PIDS_DIR/yeonjang-macos.pid"
LOG_FILE="$LOGS_DIR/yeonjang-macos.log"
PROFILE="${YEONJANG_PROFILE:-release}"
TARGET_TRIPLE="${YEONJANG_TARGET_TRIPLE:-}"
BINARY_NAME="knowbee-yeonjang"
APP_NAME="Yeonjang"
RESTART_YEONJANG="0"
BUILD_YEONJANG="0"

while (($# > 0)); do
  case "$1" in
    --restart)
      RESTART_YEONJANG="1"
      ;;
    --build)
      BUILD_YEONJANG="1"
      ;;
    *)
      echo "사용법: bash scripts/start-yeonjang-macos.sh [--restart] [--build]"
      exit 1
      ;;
  esac
  shift
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "이 스크립트는 macOS 전용입니다."
  exit 1
fi

mkdir -p "$PIDS_DIR" "$LOGS_DIR"

cleanup_stale_pid() {
  if [[ ! -f "$PID_FILE" ]]; then
    return
  fi

  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$PID_FILE"
  fi
}

find_running_pid() {
  local match="${1:-}"
  if [[ -z "$match" ]]; then
    return 1
  fi

  local pid
  pid="$(pgrep -f "$match" | tail -n 1 || true)"
  if [[ -z "$pid" ]]; then
    return 1
  fi

  echo "$pid"
}

stop_existing() {
  cleanup_stale_pid
  local pid=""
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE")"
  else
    # A prior app launch can outlive a stale/missing PID file. Stop only the
    # app bundle belonging to this repository before replacing that bundle.
    local existing_bundle
    existing_bundle="$(resolve_app_bundle_path)"
    if [[ -n "$existing_bundle" ]]; then
      pid="$(find_running_pid "$existing_bundle/Contents/MacOS/$APP_NAME" || true)"
    fi
  fi
  [[ -z "$pid" ]] && return
  echo "기존 Yeonjang GUI를 종료합니다. PID=$pid"
  kill "$pid" >/dev/null 2>&1 || true

  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$PID_FILE"
      return
    fi
    sleep 0.25
  done

  echo "기존 Yeonjang GUI가 남아 있어 강제 종료합니다."
  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$PID_FILE"
}

resolve_app_bundle_path() {
  local base_dir="$ROOT_DIR/Yeonjang/target"
  if [[ -n "$TARGET_TRIPLE" ]]; then
    local app_bundle="$base_dir/$TARGET_TRIPLE/$PROFILE/$APP_NAME.app"
    if [[ -d "$app_bundle" ]]; then
      echo "$app_bundle"
      return
    fi
  else
    local app_bundle="$base_dir/$PROFILE/$APP_NAME.app"
    if [[ -d "$app_bundle" ]]; then
      echo "$app_bundle"
      return
    fi
  fi

  echo ""
}

resolve_binary_path() {
  local base_dir="$ROOT_DIR/Yeonjang/target"
  if [[ -n "$TARGET_TRIPLE" ]]; then
    echo "$base_dir/$TARGET_TRIPLE/$PROFILE/$BINARY_NAME"
  else
    echo "$base_dir/$PROFILE/$BINARY_NAME"
  fi
}

validate_app_bundle() {
  local app_bundle="${1:-}"
  [[ -n "$app_bundle" ]] || return 1
  [[ -x "$app_bundle/Contents/MacOS/$APP_NAME" ]] || return 1
  command -v codesign >/dev/null 2>&1 || return 1
  codesign --verify --deep --strict "$app_bundle" >/dev/null 2>&1
}

if [[ "$RESTART_YEONJANG" == "1" ]]; then
  echo "Yeonjang macOS GUI를 재시작합니다..."
fi

APP_BUNDLE_PATH="$(resolve_app_bundle_path)"
if [[ "$BUILD_YEONJANG" == "1" || -z "$APP_BUNDLE_PATH" ]]; then
  if [[ "$BUILD_YEONJANG" == "1" ]]; then
    echo "명시적으로 요청된 Yeonjang macOS GUI 빌드를 실행합니다..."
  else
    echo "Yeonjang 앱 번들이 없어 최초 빌드를 실행합니다..."
  fi

  # The build script replaces the entire .app bundle. Terminate the owned app
  # before that replacement so no running binary is left detached from its bundle.
  stop_existing
  bash "$ROOT_DIR/scripts/build-yeonjang-macos.sh"
  APP_BUNDLE_PATH="$(resolve_app_bundle_path)"
else
  if ! validate_app_bundle "$APP_BUNDLE_PATH"; then
    echo "기존 Yeonjang 앱 번들 검증에 실패했습니다. --build 로 다시 빌드하세요."
    exit 1
  fi
  echo "검증된 기존 Yeonjang 앱 번들을 재사용합니다."
  stop_existing
fi

BINARY_PATH="$(resolve_binary_path)"
if [[ -z "$APP_BUNDLE_PATH" && ! -x "$BINARY_PATH" ]]; then
  echo "Yeonjang 실행 파일을 찾을 수 없습니다: $BINARY_PATH"
  exit 1
fi
if [[ -n "$APP_BUNDLE_PATH" ]] && ! validate_app_bundle "$APP_BUNDLE_PATH"; then
  echo "Yeonjang 앱 번들 서명 검증에 실패했습니다: $APP_BUNDLE_PATH"
  exit 1
fi

: > "$LOG_FILE"

echo "Yeonjang GUI를 시작합니다..."
if [[ -n "$APP_BUNDLE_PATH" ]]; then
  open -na "$APP_BUNDLE_PATH" >>"$LOG_FILE" 2>&1
else
  (
    cd "$ROOT_DIR"
    exec "$BINARY_PATH" </dev/null
  ) >>"$LOG_FILE" 2>&1 &
fi

STARTED_PID=""
MATCH_PATH="$BINARY_PATH"
if [[ -n "$APP_BUNDLE_PATH" ]]; then
  MATCH_PATH="$APP_BUNDLE_PATH/Contents/MacOS/$APP_NAME"
fi

for _ in $(seq 1 40); do
  STARTED_PID="$(find_running_pid "$MATCH_PATH" || true)"
  if [[ -n "$STARTED_PID" ]] && kill -0 "$STARTED_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if [[ -z "$STARTED_PID" ]] || ! kill -0 "$STARTED_PID" >/dev/null 2>&1; then
  echo "Yeonjang GUI가 시작 중 종료되었습니다."
  echo "로그:"
  tail -n 80 "$LOG_FILE" || true
  rm -f "$PID_FILE"
  exit 1
fi

echo "$STARTED_PID" > "$PID_FILE"

echo "Yeonjang GUI 실행 완료"
echo "  PID  : $(cat "$PID_FILE")"
echo "  Log  : $LOG_FILE"
echo "  Mode : tray-first (startup hidden, close hides to tray)"
echo "  Stop : bash scripts/stop-yeonjang-macos.sh"
echo "  Restart : bash scripts/start-yeonjang-macos.sh --restart"
