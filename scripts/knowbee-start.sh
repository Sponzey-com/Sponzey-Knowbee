#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS_DIR="$ROOT_DIR/pids"
LOGS_DIR="$ROOT_DIR/logs"

GATEWAY_PID_FILE="$PIDS_DIR/knowbee-gateway.pid"
WEBUI_PID_FILE="$PIDS_DIR/knowbee-webui.pid"

GATEWAY_LOG_FILE="$LOGS_DIR/knowbee-gateway.log"
WEBUI_LOG_FILE="$LOGS_DIR/knowbee-webui.log"

STATE_DIR="${KNOWBEE_STATE_DIR:-${WIZBY_STATE_DIR:-${HOWIE_STATE_DIR:-$HOME/.knowbee}}}"
GATEWAY_HOST="${KNOWBEE_GATEWAY_HOST:-127.0.0.1}"
GATEWAY_PORT="${KNOWBEE_GATEWAY_PORT:-18888}"
WEBUI_HOST="${KNOWBEE_WEBUI_HOST:-127.0.0.1}"
WEBUI_PORT="${KNOWBEE_WEBUI_PORT:-4220}"
ADMIN_UI="${KNOWBEE_ADMIN_UI:-0}"
GATEWAY_STATUS_TIMEOUT_SECONDS="10"
GATEWAY_STARTUP_PERFORMANCE_BUDGET_MS="30000"
WEBUI_STARTUP_TIMEOUT_SECONDS="60"
RESTART_LOCAL="0"
LIVE_ACCEPTANCE="0"
readonly LIVE_TELEGRAM_CHAT_ID_SNAPSHOT="${KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID:-}"
readonly LIVE_TELEGRAM_USER_ID_SNAPSHOT="${KNOWBEE_CHANNEL_SMOKE_TELEGRAM_USER_ID:-}"
readonly LIVE_TELEGRAM_THREAD_ID_SNAPSHOT="${KNOWBEE_CHANNEL_SMOKE_TELEGRAM_THREAD_ID:-}"
readonly LIVE_SLACK_CHANNEL_ID_SNAPSHOT="${KNOWBEE_CHANNEL_SMOKE_SLACK_CHANNEL_ID:-}"
readonly LIVE_SLACK_USER_ID_SNAPSHOT="${KNOWBEE_CHANNEL_SMOKE_SLACK_USER_ID:-}"
readonly LIVE_SLACK_THREAD_TS_SNAPSHOT="${KNOWBEE_CHANNEL_SMOKE_SLACK_THREAD_TS:-}"
LABEL_SUFFIX="$(printf '%s' "$ROOT_DIR" | cksum | awk '{print $1}')"
GATEWAY_LAUNCHD_LABEL="com.sponzey.knowbee.${LABEL_SUFFIX}.gateway"
WEBUI_LAUNCHD_LABEL="com.sponzey.knowbee.${LABEL_SUFFIX}.webui"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin|--admin-ui)
      ADMIN_UI="1"
      shift
      ;;
    --restart)
      RESTART_LOCAL="1"
      shift
      ;;
    --live-acceptance)
      LIVE_ACCEPTANCE="1"
      shift
      ;;
    *)
      echo "알 수 없는 옵션: $1"
      echo "사용법: bash scripts/knowbee-start.sh [--admin-ui] [--restart] [--live-acceptance]"
      exit 1
      ;;
  esac
done

mkdir -p "$PIDS_DIR" "$LOGS_DIR"

NODE_RUNTIME_PATH="$(node -p 'process.execPath')"
if [[ -z "$NODE_RUNTIME_PATH" || ! -x "$NODE_RUNTIME_PATH" ]]; then
  echo "실제 Node 실행 파일을 확인하지 못했습니다."
  exit 1
fi
readonly NODE_RUNTIME_PATH

read_pid() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && cat "$pid_file" 2>/dev/null || true
}

pid_alive() {
  local pid="$1"
  local state
  [[ -z "$pid" ]] && return 1
  state="$(ps -p "$pid" -o stat= 2>/dev/null | tr -d '[:space:]')"
  [[ -z "$state" || "$state" == Z* ]] && return 1
  kill -0 "$pid" >/dev/null 2>&1
}

pid_command() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null || true
}

pid_cwd() {
  local pid="$1"
  local cwd=""
  if command -v lsof >/dev/null 2>&1; then
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)"
  fi
  printf '%s' "$cwd"
}

pid_belongs_to_repo() {
  local pid="$1"
  local cmd cwd
  cmd="$(pid_command "$pid")"
  cwd="$(pid_cwd "$pid")"

  [[ "$cwd" == "$ROOT_DIR"* ]] && return 0
  [[ "$cmd" == *"$ROOT_DIR"* ]] && return 0
  [[ "$cmd" == *"@knowbee/cli"* || "$cmd" == *"packages/core/dist/runtime/serve-bundle.js"* || "$cmd" == *"packages/cli/dist/serve-entry.js"* || "$cmd" == *"packages/cli/dist/index.js serve"* || "$cmd" == *"@knowbee/webui"* ]] && [[ "$cwd" == "$ROOT_DIR"* ]] && return 0
  return 1
}

can_use_launchctl() {
  [[ "${KNOWBEE_DISABLE_LAUNCHCTL:-0}" != "1" ]] \
    && [[ "$(uname -s 2>/dev/null || true)" == "Darwin" ]] \
    && command -v launchctl >/dev/null 2>&1
}

live_targets_configured() {
  [[ -n "$LIVE_TELEGRAM_CHAT_ID_SNAPSHOT" ]] \
    || [[ -n "$LIVE_TELEGRAM_USER_ID_SNAPSHOT" ]] \
    || [[ -n "$LIVE_TELEGRAM_THREAD_ID_SNAPSHOT" ]] \
    || [[ -n "$LIVE_SLACK_CHANNEL_ID_SNAPSHOT" ]] \
    || [[ -n "$LIVE_SLACK_USER_ID_SNAPSHOT" ]] \
    || [[ -n "$LIVE_SLACK_THREAD_TS_SNAPSHOT" ]]
}

can_use_gateway_launchctl() {
  can_use_launchctl || return 1
  [[ "$LIVE_ACCEPTANCE" != "1" ]] || ! live_targets_configured
}

launchctl_job_pid() {
  local label="$1"
  launchctl print "gui/$(id -u)/$label" 2>/dev/null | awk '/pid = / { print $3; exit }' || true
}

remove_launchctl_job() {
  local label="$1"
  can_use_launchctl || return 0
  launchctl remove "$label" >/dev/null 2>&1 || true
}

wait_launchctl_pid() {
  local name="$1"
  local label="$2"
  local pid_file="$3"

  for _ in $(seq 1 30); do
    local pid
    pid="$(launchctl_job_pid "$label")"
    if [[ -n "$pid" ]]; then
      echo "$pid" > "$pid_file"
      return 0
    fi
    sleep 0.2
  done

  echo "$name launchctl 작업 PID를 확인하지 못했습니다. label=$label"
  return 1
}

pids_for_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u || true
  fi
}

wait_port_release() {
  local name="$1"
  local port="$2"

  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi

  for _ in $(seq 1 20); do
    if [[ -z "$(pids_for_port "$port")" ]]; then
      return 0
    fi
    sleep 0.5
  done

  echo "$name 포트가 아직 점유 중입니다: port=$port"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    describe_pid "$pid"
  done <<< "$(pids_for_port "$port")"
  return 1
}

describe_pid() {
  local pid="$1"
  local cwd cmd
  cwd="$(pid_cwd "$pid")"
  cmd="$(pid_command "$pid")"
  echo "  PID=$pid"
  echo "    cwd=${cwd:-unknown}"
  echo "    cmd=${cmd:-unknown}"
}

cleanup_stale_pid() {
  local name="$1"
  local pid_file="$2"
  if [[ ! -f "$pid_file" ]]; then
    return
  fi

  local pid
  pid="$(read_pid "$pid_file")"
  if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ ]]; then
    rm -f "$pid_file"
    echo "$name 잘못된 PID 파일을 정리했습니다: ${pid:-empty}"
    return
  fi

  if ! pid_alive "$pid"; then
    rm -f "$pid_file"
    echo "$name stale PID 파일을 정리했습니다: ${pid:-empty}"
    return
  fi

  if ! pid_belongs_to_repo "$pid"; then
    rm -f "$pid_file"
    echo "$name PID 파일이 현재 repo가 아닌 프로세스를 가리켜 stale로 정리했습니다: $pid"
    describe_pid "$pid"
    return
  fi
}

is_running() {
  local name="$1"
  local pid_file="$2"
  cleanup_stale_pid "$name" "$pid_file"
  local pid
  pid="$(read_pid "$pid_file")"
  pid_alive "$pid"
}

assert_port_available() {
  local name="$1"
  local port="$2"
  local expected_pid_file="${3:-}"
  local expected_pid=""
  [[ -n "$expected_pid_file" ]] && expected_pid="$(read_pid "$expected_pid_file")"

  local pids
  pids="$(pids_for_port "$port")"
  [[ -z "$pids" ]] && return 0

  local conflict=0
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if [[ -n "$expected_pid" && "$pid" == "$expected_pid" ]]; then
      continue
    fi
    conflict=1
  done <<< "$pids"

  [[ "$conflict" -eq 0 ]] && return 0

  echo "$name 포트가 이미 점유되어 start를 중단합니다: port=$port"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if pid_belongs_to_repo "$pid"; then
      echo "현재 repo의 orphan 프로세스일 가능성이 있습니다. 먼저 scripts/stop-local.sh 또는 kill 후 재시도하세요."
    else
      echo "다른 프로세스가 포트를 점유하고 있습니다. 포트 또는 해당 프로세스를 확인하세요."
    fi
    describe_pid "$pid"
  done <<< "$pids"
  exit 1
}

has_repo_owned_port_conflict() {
  local port="$1"
  local expected_pid_file="${2:-}"
  local expected_pid=""
  [[ -n "$expected_pid_file" ]] && expected_pid="$(read_pid "$expected_pid_file")"

  local pids
  pids="$(pids_for_port "$port")"
  [[ -z "$pids" ]] && return 1

  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    [[ -n "$expected_pid" && "$pid" == "$expected_pid" ]] && continue
    if pid_belongs_to_repo "$pid"; then
      return 0
    fi
  done <<< "$pids"

  return 1
}

truncate_logs() {
  : > "$GATEWAY_LOG_FILE"
  : > "$WEBUI_LOG_FILE"
}

build_workspace() {
  echo "Gateway 실행 파일을 빌드합니다..."
  (
    cd "$ROOT_DIR"
    pnpm --filter @knowbee/core build
    pnpm --filter @knowbee/cli build
    pnpm run gateway:bundle
  )
}

installed_pnpm_store_dir() {
  local modules_file="$ROOT_DIR/node_modules/.modules.yaml"
  [[ -f "$modules_file" ]] || return 0
  sed -n 's/^storeDir:[[:space:]]*//p' "$modules_file" | head -n 1
}

pnpm_rebuild_package() {
  local package_name="$1"
  local store_dir
  store_dir="$(installed_pnpm_store_dir)"
  (
    cd "$ROOT_DIR"
    if [[ -n "$store_dir" ]]; then
      pnpm --store-dir "$store_dir" --filter @knowbee/core rebuild "$package_name"
    else
      pnpm --filter @knowbee/core rebuild "$package_name"
    fi
  )
}

verify_core_native_dependencies() {
  (
    cd "$ROOT_DIR/packages/core"
    node -e 'const Database = require("better-sqlite3"); const db = new Database(":memory:"); db.close();' >/dev/null 2>&1
  )
}

ensure_core_native_dependencies() {
  if verify_core_native_dependencies; then
    return 0
  fi

  echo "better-sqlite3 native binding이 없어 복구 빌드를 실행합니다..."
  pnpm_rebuild_package better-sqlite3

  if verify_core_native_dependencies; then
    echo "better-sqlite3 native binding 확인 완료."
    return 0
  fi

  echo "better-sqlite3 native binding을 준비하지 못했습니다."
  echo "다음 명령을 실행한 뒤 다시 시작하세요:"
  echo "  pnpm install --config.ignore-scripts=false"
  echo "  pnpm rebuild better-sqlite3"
  echo
  echo "macOS에서 계속 실패하면 Xcode Command Line Tools가 필요할 수 있습니다:"
  echo "  xcode-select --install"
  return 1
}

extract_status_field() {
  local field="$1"
  local raw="$2"
  node -e '
    const field = process.argv[1]
    const raw = process.argv[2] ?? ""
    try {
      const data = JSON.parse(raw)
      const value = field.split(".").reduce((current, key) => current?.[key], data)
      if (value === undefined || value === null) process.exit(2)
      process.stdout.write(String(value))
    } catch {
      process.exit(1)
    }
  ' "$field" "$raw"
}

summarize_status_body() {
  local raw="$1"
  node -e '
    const raw = process.argv[1] ?? ""
    try {
      const data = JSON.parse(raw)
      const keys = Object.keys(data).slice(0, 20).join(", ")
      const runtimeKeys = data.runtime && typeof data.runtime === "object"
        ? Object.keys(data.runtime).slice(0, 20).join(", ")
        : "none"
      process.stdout.write(`keys=[${keys}] runtimeKeys=[${runtimeKeys}]`)
    } catch {
      const compact = raw.replace(/\s+/g, " ").slice(0, 300)
      process.stdout.write(`non-json body=${compact}`)
    }
  ' "$raw"
}

port_has_pid() {
  local port="$1"
  local expected_pid="$2"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    [[ "$pid" == "$expected_pid" ]] && return 0
  done <<< "$(pids_for_port "$port")"
  return 1
}

first_repo_owned_port_pid() {
  local port="$1"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if pid_belongs_to_repo "$pid"; then
      printf '%s' "$pid"
      return 0
    fi
  done <<< "$(pids_for_port "$port")"
  return 1
}

is_redacted_internal_path() {
  [[ "$1" == "[internal-path-redacted]" ]]
}

GATEWAY_HEALTH_DIAGNOSTIC_PRINTED="0"

verify_gateway_health() {
  local expected_pid="$1"
  local body pid cwd listener_pid
  body="$(curl -fsS --max-time 2 "http://$GATEWAY_HOST:$GATEWAY_PORT/api/health" 2>/dev/null || true)"
  [[ -z "$body" ]] && return 1

  pid="$(extract_status_field runtime.pid "$body" || true)"
  if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ ]]; then
    echo "Gateway health 응답에서 runtime.pid를 확인하지 못했습니다."
    return 1
  fi

  listener_pid="$(first_repo_owned_port_pid "$GATEWAY_PORT" || true)"
  if [[ -z "$listener_pid" || "$listener_pid" != "$pid" ]]; then
    echo "Gateway health PID와 실제 listener PID가 다릅니다. health=$pid listener=${listener_pid:-unknown}"
    return 1
  fi
  if ! pid_alive "$pid" || ! pid_belongs_to_repo "$pid" || ! port_has_pid "$GATEWAY_PORT" "$pid"; then
    echo "Gateway health PID가 현재 repo의 활성 listener가 아닙니다. pid=$pid"
    return 1
  fi

  cwd="$(pid_cwd "$pid")"
  if [[ "$cwd" != "$ROOT_DIR"* ]]; then
    echo "Gateway cwd가 현재 repo가 아닙니다. expected=$ROOT_DIR actual=${cwd:-unknown}"
    return 1
  fi

  if [[ "$pid" != "$expected_pid" ]]; then
    echo "$pid" > "$GATEWAY_PID_FILE"
    echo "Gateway health 응답 PID를 실제 listener PID로 갱신했습니다. launcher=$expected_pid runtime=$pid"
  fi
  echo "Gateway liveness 확인 완료: pid=$pid"
}

verify_gateway_status() {
  local expected_pid="$1"
  local body pid state_dir cwd display_version prompt_checksum listener_pid
  local pid_from_listener="0"
  body="$(curl --max-time "$GATEWAY_STATUS_TIMEOUT_SECONDS" -fsS "http://$GATEWAY_HOST:$GATEWAY_PORT/api/status" 2>/dev/null || true)"
  [[ -z "$body" ]] && return 1

  pid="$(extract_status_field runtime.pid "$body" || true)"
  state_dir="$(extract_status_field paths.stateDir "$body" || true)"
  cwd="$(extract_status_field runtime.cwd "$body" || true)"
  display_version="$(extract_status_field displayVersion "$body" || true)"
  prompt_checksum="$(extract_status_field promptSources.checksum "$body" || true)"

  if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ ]]; then
    listener_pid="$(first_repo_owned_port_pid "$GATEWAY_PORT" || true)"
    if [[ -n "$listener_pid" && "$state_dir" == "$STATE_DIR" ]]; then
      echo "$listener_pid" > "$GATEWAY_PID_FILE"
      echo "Gateway health 응답에 runtime.pid가 없어 실제 listener PID로 갱신했습니다. runtime=$listener_pid"
      pid="$listener_pid"
      pid_from_listener="1"
      [[ -z "$cwd" ]] && cwd="$(pid_cwd "$pid")"
    else
      echo "Gateway health 응답에서 runtime.pid를 확인하지 못했습니다."
      if [[ "$GATEWAY_HEALTH_DIAGNOSTIC_PRINTED" != "1" ]]; then
        echo "Gateway health 응답 요약: $(summarize_status_body "$body")"
        GATEWAY_HEALTH_DIAGNOSTIC_PRINTED="1"
      fi
      return 1
    fi
  fi

  if [[ "$pid_from_listener" != "1" && "$pid" != "$expected_pid" ]]; then
    if pid_alive "$pid" && pid_belongs_to_repo "$pid" && port_has_pid "$GATEWAY_PORT" "$pid"; then
      echo "$pid" > "$GATEWAY_PID_FILE"
      echo "Gateway health 응답 PID를 실제 listener PID로 갱신했습니다. launcher=$expected_pid runtime=$pid"
    else
      echo "Gateway health 응답 PID가 새 프로세스와 다릅니다. expected=$expected_pid actual=$pid"
      return 1
    fi
  fi
  if ! is_redacted_internal_path "$state_dir" && [[ "$state_dir" != "$STATE_DIR" ]]; then
    echo "Gateway stateDir가 예상과 다릅니다. expected=$STATE_DIR actual=${state_dir:-unknown}"
    return 1
  fi
  if is_redacted_internal_path "$cwd"; then
    cwd="$(pid_cwd "$pid")"
  fi
  if [[ "$cwd" != "$ROOT_DIR"* ]]; then
    echo "Gateway cwd가 현재 repo가 아닙니다. expected=$ROOT_DIR actual=${cwd:-unknown}"
    return 1
  fi

  echo "Gateway health 확인 완료: pid=$pid version=${display_version:-unknown} stateDir=$state_dir promptChecksum=${prompt_checksum:-none}"
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local pid_file="$3"
  local timeout_seconds="$4"
  local verify_gateway="${5:-false}"

  if [[ ! "$timeout_seconds" =~ ^[0-9]+$ ]] || [[ "$timeout_seconds" -lt 1 ]]; then
    echo "$name 준비 대기 제한이 올바르지 않습니다."
    return 1
  fi

  if ! command -v curl >/dev/null 2>&1; then
    sleep 3
    return 0
  fi

  local pid deadline
  pid="$(read_pid "$pid_file")"
  deadline=$((SECONDS + timeout_seconds))

  while [[ "$SECONDS" -lt "$deadline" ]]; do
    if curl --max-time 2 -fsS "$url" >/dev/null 2>&1; then
      if ! pid_alive "$pid"; then
        echo "$name 프로세스가 시작 중 종료되었습니다. 기존 프로세스나 포트 점유 상태를 확인해 주세요."
        return 1
      fi
      if [[ "$verify_gateway" == "true" ]]; then
        verify_gateway_health "$pid" && return 0
      else
        return 0
      fi
    fi

    if ! pid_alive "$pid"; then
      echo "$name 프로세스가 시작 중 종료되었습니다."
      return 1
    fi

    sleep 1
  done

  echo "$name 준비 대기 시간이 초과되었습니다: $url"
  return 1
}

cleanup_terminal_gateway_startup() {
  local expected_pid="$1"
  local current_job_pid=""

  if can_use_launchctl; then
    current_job_pid="$(launchctl_job_pid "$GATEWAY_LAUNCHD_LABEL")"
    if [[ "$current_job_pid" == "$expected_pid" ]]; then
      remove_launchctl_job "$GATEWAY_LAUNCHD_LABEL"
    fi
  fi

  if pid_alive "$expected_pid" && pid_belongs_to_repo "$expected_pid"; then
    kill "$expected_pid" >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do
      pid_alive "$expected_pid" || break
      sleep 0.25
    done
    if pid_alive "$expected_pid" && pid_belongs_to_repo "$expected_pid"; then
      kill -9 "$expected_pid" >/dev/null 2>&1 || true
    fi
  fi

  if [[ "$(read_pid "$GATEWAY_PID_FILE")" == "$expected_pid" ]]; then
    rm -f "$GATEWAY_PID_FILE"
  fi
  echo "Gateway terminal startup 대상을 정리했습니다: pid=$expected_pid"
}

wait_for_gateway_startup() {
  local expected_pid="$1"
  local minimum_started_at="$2"
  local last_progress=""
  local observer_result observer_status observer_state elapsed_ms performance reason_code progress

  while true; do
    observer_result="$("$NODE_RUNTIME_PATH" "$ROOT_DIR/scripts/observe-gateway-startup.mjs" \
      --evidence "$STATE_DIR/gateway-startup.json" \
      --pid "$expected_pid" \
      --minimum-started-at "$minimum_started_at" \
      --performance-budget-ms "$GATEWAY_STARTUP_PERFORMANCE_BUDGET_MS" \
      --repo "$ROOT_DIR" \
      --port "$GATEWAY_PORT")"
    observer_status="$(extract_status_field status "$observer_result" || true)"
    elapsed_ms="$(extract_status_field elapsedMs "$observer_result" || true)"

    case "$observer_status" in
      ready)
        if verify_gateway_health "$expected_pid"; then
          return 0
        fi
        observer_state="verifying_health"
        ;;
      failed|cancelled)
        reason_code="$(extract_status_field reasonCode "$observer_result" || true)"
        echo "Gateway 시작이 종료되었습니다: status=$observer_status reason=${reason_code:-unknown}"
        cleanup_terminal_gateway_startup "$expected_pid"
        return 1
        ;;
      still_starting)
        observer_state="$(extract_status_field state "$observer_result" || true)"
        performance="$(extract_status_field performance "$observer_result" || true)"
        ;;
      *)
        echo "Gateway 시작 관찰 결과가 올바르지 않습니다."
        return 1
        ;;
    esac

    progress="${observer_state:-unknown}:${performance:-within_budget}"
    if [[ "$progress" != "$last_progress" ]]; then
      echo "Gateway 시작 단계: ${observer_state:-unknown} elapsedMs=${elapsed_ms:-unknown} performance=${performance:-within_budget}"
      last_progress="$progress"
    fi
    sleep 1
  done
}

start_gateway_nohup() {
  (
    cd "$ROOT_DIR"
    export KNOWBEE_STATE_DIR="$STATE_DIR"
    export KNOWBEE_LOG_LEVEL="${KNOWBEE_LOG_LEVEL:-info}"
    export KNOWBEE_ADMIN_UI="$ADMIN_UI"
    export KNOWBEE_ADMIN_UI_SOURCE="local-script"
    export KNOWBEE_LIVE_ACCEPTANCE="$LIVE_ACCEPTANCE"
    export KNOWBEE_CHANNEL_SMOKE_LIVE="$LIVE_ACCEPTANCE"
    export KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID="$LIVE_TELEGRAM_CHAT_ID_SNAPSHOT"
    export KNOWBEE_CHANNEL_SMOKE_TELEGRAM_USER_ID="$LIVE_TELEGRAM_USER_ID_SNAPSHOT"
    export KNOWBEE_CHANNEL_SMOKE_TELEGRAM_THREAD_ID="$LIVE_TELEGRAM_THREAD_ID_SNAPSHOT"
    export KNOWBEE_CHANNEL_SMOKE_SLACK_CHANNEL_ID="$LIVE_SLACK_CHANNEL_ID_SNAPSHOT"
    export KNOWBEE_CHANNEL_SMOKE_SLACK_USER_ID="$LIVE_SLACK_USER_ID_SNAPSHOT"
    export KNOWBEE_CHANNEL_SMOKE_SLACK_THREAD_TS="$LIVE_SLACK_THREAD_TS_SNAPSHOT"
    exec nohup "$NODE_RUNTIME_PATH" packages/core/dist/runtime/serve-bundle.js </dev/null
  ) >>"$GATEWAY_LOG_FILE" 2>&1 &
  echo "$!" > "$GATEWAY_PID_FILE"
}

start_gateway() {
  if is_running "Gateway" "$GATEWAY_PID_FILE"; then
    echo "Gateway는 이미 실행 중입니다. PID=$(cat "$GATEWAY_PID_FILE")"
    return 0
  fi

  assert_port_available "Gateway" "$GATEWAY_PORT"
  build_workspace
  ensure_core_native_dependencies

  local gateway_started_at_ms
  gateway_started_at_ms="$("$NODE_RUNTIME_PATH" -e 'process.stdout.write(String(Date.now()))')"
  echo "Gateway를 시작합니다..."
  if can_use_gateway_launchctl; then
    remove_launchctl_job "$GATEWAY_LAUNCHD_LABEL"
    local command
    printf -v command 'cd %q && export KNOWBEE_STATE_DIR=%q KNOWBEE_LOG_LEVEL=%q KNOWBEE_ADMIN_UI=%q KNOWBEE_ADMIN_UI_SOURCE=%q KNOWBEE_LIVE_ACCEPTANCE=%q KNOWBEE_CHANNEL_SMOKE_LIVE=%q PATH=%q && exec %q packages/core/dist/runtime/serve-bundle.js >>%q 2>&1' \
      "$ROOT_DIR" "$STATE_DIR" "${KNOWBEE_LOG_LEVEL:-info}" "$ADMIN_UI" "local-script" "$LIVE_ACCEPTANCE" "$LIVE_ACCEPTANCE" "$PATH" "$NODE_RUNTIME_PATH" "$GATEWAY_LOG_FILE"
    if launchctl submit -l "$GATEWAY_LAUNCHD_LABEL" -- /bin/bash -lc "$command"; then
      if ! wait_launchctl_pid "Gateway" "$GATEWAY_LAUNCHD_LABEL" "$GATEWAY_PID_FILE"; then
        echo "Gateway launchctl PID 확인에 실패해 nohup 방식으로 전환합니다."
        remove_launchctl_job "$GATEWAY_LAUNCHD_LABEL"
        start_gateway_nohup
      fi
    else
      echo "Gateway launchctl 시작에 실패해 nohup 방식으로 전환합니다."
      remove_launchctl_job "$GATEWAY_LAUNCHD_LABEL"
      start_gateway_nohup
    fi
  else
    start_gateway_nohup
  fi

  local launched_pid
  launched_pid="$(read_pid "$GATEWAY_PID_FILE")"
  if ! wait_for_gateway_startup "$launched_pid" "$gateway_started_at_ms"; then
    echo "Gateway 로그:"
    tail -n 100 "$GATEWAY_LOG_FILE" || true
    return 1
  fi

  local runtime_pid
  runtime_pid="$(read_pid "$GATEWAY_PID_FILE")"
  if ! verify_gateway_status "$runtime_pid"; then
    echo "Gateway 상세 상태 조회를 건너뜁니다. liveness와 repo 소유권은 확인되었습니다."
  fi
}

start_webui_nohup() {
  (
    cd "$ROOT_DIR"
    export KNOWBEE_LOG_LEVEL="${KNOWBEE_LOG_LEVEL:-info}"
    exec nohup pnpm --filter @knowbee/webui exec vite --host "$WEBUI_HOST" --port "$WEBUI_PORT" --strictPort </dev/null
  ) >>"$WEBUI_LOG_FILE" 2>&1 &
  echo "$!" > "$WEBUI_PID_FILE"
}

start_webui() {
  if is_running "WebUI" "$WEBUI_PID_FILE"; then
    echo "WebUI는 이미 실행 중입니다. PID=$(cat "$WEBUI_PID_FILE")"
    return 0
  fi

  assert_port_available "WebUI" "$WEBUI_PORT"

  echo "WebUI를 시작합니다..."
  if can_use_launchctl; then
    remove_launchctl_job "$WEBUI_LAUNCHD_LABEL"
    local command
    printf -v command 'cd %q && export KNOWBEE_LOG_LEVEL=%q PATH=%q && exec pnpm --filter @knowbee/webui exec vite --host %q --port %q --strictPort >>%q 2>&1' \
      "$ROOT_DIR" "${KNOWBEE_LOG_LEVEL:-info}" "$PATH" "$WEBUI_HOST" "$WEBUI_PORT" "$WEBUI_LOG_FILE"
    if launchctl submit -l "$WEBUI_LAUNCHD_LABEL" -- /bin/bash -lc "$command"; then
      if ! wait_launchctl_pid "WebUI" "$WEBUI_LAUNCHD_LABEL" "$WEBUI_PID_FILE"; then
        echo "WebUI launchctl PID 확인에 실패해 nohup 방식으로 전환합니다."
        remove_launchctl_job "$WEBUI_LAUNCHD_LABEL"
        start_webui_nohup
      fi
    else
      echo "WebUI launchctl 시작에 실패해 nohup 방식으로 전환합니다."
      remove_launchctl_job "$WEBUI_LAUNCHD_LABEL"
      start_webui_nohup
    fi
  else
    start_webui_nohup
  fi

  if ! wait_for_http "WebUI" "http://$WEBUI_HOST:$WEBUI_PORT" "$WEBUI_PID_FILE" "$WEBUI_STARTUP_TIMEOUT_SECONDS" false; then
    echo "WebUI 로그:"
    tail -n 100 "$WEBUI_LOG_FILE" || true
    return 1
  fi
}

verify_live_acceptance_readiness() {
  [[ "$LIVE_ACCEPTANCE" == "1" ]] || return 0
  echo "Live acceptance 준비 상태를 확인합니다..."
  if ! (
    cd "$ROOT_DIR"
    node packages/cli/dist/index.js smoke acceptance --check --json
  ); then
    echo "Live acceptance executor가 준비되지 않았습니다. Gateway는 실행 상태를 유지합니다."
    return 1
  fi
}

cleanup_stale_pid "Gateway" "$GATEWAY_PID_FILE"
cleanup_stale_pid "WebUI" "$WEBUI_PID_FILE"

if [[ "$RESTART_LOCAL" == "1" ]]; then
  echo "스폰지 노비 · Sponzey Knowbee 로컬 서비스를 재시작합니다."
  bash "$ROOT_DIR/scripts/stop-local.sh"
  wait_port_release "Gateway" "$GATEWAY_PORT"
  wait_port_release "WebUI" "$WEBUI_PORT"
elif is_running "Gateway" "$GATEWAY_PID_FILE" || is_running "WebUI" "$WEBUI_PID_FILE"; then
  echo "기존 스폰지 노비 · Sponzey Knowbee 프로세스를 정리하고 다시 시작합니다..."
  bash "$ROOT_DIR/scripts/stop-local.sh"
  wait_port_release "Gateway" "$GATEWAY_PORT"
  wait_port_release "WebUI" "$WEBUI_PORT"
elif has_repo_owned_port_conflict "$GATEWAY_PORT" "$GATEWAY_PID_FILE" || has_repo_owned_port_conflict "$WEBUI_PORT" "$WEBUI_PID_FILE"; then
  echo "현재 repo의 orphan 포트 점유 프로세스를 정리하고 다시 시작합니다..."
  bash "$ROOT_DIR/scripts/stop-local.sh"
  wait_port_release "Gateway" "$GATEWAY_PORT"
  wait_port_release "WebUI" "$WEBUI_PORT"
fi

assert_port_available "Gateway" "$GATEWAY_PORT"
assert_port_available "WebUI" "$WEBUI_PORT"
truncate_logs

start_gateway
start_webui

LIVE_ACCEPTANCE_READINESS="disabled"
if [[ "$LIVE_ACCEPTANCE" == "1" ]]; then
  if verify_live_acceptance_readiness; then
    LIVE_ACCEPTANCE_READINESS="ready"
  else
    LIVE_ACCEPTANCE_READINESS="unavailable"
  fi
fi

echo
echo "스폰지 노비 · Sponzey Knowbee 로컬 실행이 완료되었습니다."
echo "  Gateway : http://$GATEWAY_HOST:$GATEWAY_PORT"
echo "  WebUI   : http://$WEBUI_HOST:$WEBUI_PORT"
echo "  Admin UI: $([[ "$ADMIN_UI" == "1" ]] && echo enabled || echo disabled)"
echo "  Live acceptance: $LIVE_ACCEPTANCE_READINESS"
echo "  State   : $STATE_DIR"
echo "  Logs    : $GATEWAY_LOG_FILE / $WEBUI_LOG_FILE"
echo "  Status  : bash scripts/status-local.sh"
echo "  Restart : bash scripts/knowbee-start.sh --restart"
echo "  Stop    : bash scripts/stop-local.sh"

[[ "$LIVE_ACCEPTANCE_READINESS" != "unavailable" ]]
