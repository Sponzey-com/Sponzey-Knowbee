#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
YEONJANG_DIR="$ROOT_DIR/Yeonjang"
BROKER_IMAGE="eclipse-mosquitto:2.0.22"
HOST_KERNEL="$(uname -s)"
WINDOWS_BASH=0
case "$HOST_KERNEL" in
  MINGW*|MSYS*|CYGWIN*) WINDOWS_BASH=1 ;;
esac
if [[ "$WINDOWS_BASH" == "1" ]]; then
  # Strawberry/OpenSSL can carry a build-machine config path. The gate uses
  # only explicit command options, so the Windows null config is deterministic.
  export OPENSSL_CONF="${OPENSSL_CONF:-NUL}"
  # The independent broker contract is compiled before the platform release
  # build script runs. Select the same installed LLVM toolchain at gate
  # bootstrap so native ARM64 dependencies such as ring do not depend on a
  # caller-specific interactive PATH.
  WINDOWS_LLVM_BIN="/c/Program Files/LLVM/bin"
  if [[ -x "$WINDOWS_LLVM_BIN/clang.exe" ]]; then
    PATH="$WINDOWS_LLVM_BIN:$PATH"
    export PATH
  fi
fi

runtime_path() {
  if [[ "$WINDOWS_BASH" == "1" ]]; then
    cygpath -m "$1"
  else
    printf '%s\n' "$1"
  fi
}
WORK_DIR="$(mktemp -d /tmp/knowbee-yeonjang-mtls.XXXXXX)"
WORK_DIR="$(cd "$WORK_DIR" && pwd -P)"
CONTAINER_NAME="knowbee-yeonjang-mtls-$$"
LIVE_INSTANCE_ID="live-instance-$$"
LIVE_SESSION_ID="live-session"
LIVE_REQUESTER_ID="live-requester"
LIVE_CONFIG_ROOT="$WORK_DIR/live-config"
NATIVE_BROKER_PID_FILE="$WORK_DIR/native-broker.pid"
NATIVE_BROKER_SUPERVISOR_PID_FILE="$WORK_DIR/native-broker-supervisor.pid"
NATIVE_BROKER_LOG="$WORK_DIR/native-broker.log"
BROKER_BACKEND="docker"
BROKER_READINESS_HOST="localhost"
if ! command -v docker >/dev/null 2>&1; then
  if [[ "$WINDOWS_BASH" == "1" ]] && command -v mosquitto.exe >/dev/null 2>&1; then
    BROKER_BACKEND="native-windows"
    BROKER_READINESS_HOST="127.0.0.1"
  else
    echo "independent MQTT gate requires Docker or native Windows mosquitto.exe" >&2
    exit 1
  fi
fi

cleanup() {
  if [[ "$BROKER_BACKEND" == "docker" ]]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  else
    for pid_file in "$NATIVE_BROKER_SUPERVISOR_PID_FILE" "$NATIVE_BROKER_PID_FILE"; do
      if [[ -f "$pid_file" ]]; then
        NATIVE_PROCESS_PID="$(tr -d '\r\n ' <"$pid_file")"
        if [[ "$NATIVE_PROCESS_PID" =~ ^[0-9]+$ ]]; then
          MSYS_NO_PATHCONV=1 taskkill.exe /PID "$NATIVE_PROCESS_PID" /T /F \
            >/dev/null 2>&1 || true
        fi
      fi
    done
  fi
  if command -v trash >/dev/null 2>&1; then
    trash "$WORK_DIR" >/dev/null 2>&1 || true
  else
    rm -r -- "$WORK_DIR" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

broker_logs() {
  if [[ "$BROKER_BACKEND" == "docker" ]]; then
    docker logs --tail 80 "$CONTAINER_NAME" >&2 || true
  elif [[ -f "$NATIVE_BROKER_LOG" ]]; then
    tail -n 80 "$NATIVE_BROKER_LOG" >&2 || true
  fi
}

GATE_PREREQUISITES=(openssl cargo)
if [[ "$WINDOWS_BASH" == "1" ]]; then
  GATE_PREREQUISITES+=(node cygpath powershell.exe cmd.exe taskkill.exe)
fi
for command_name in "${GATE_PREREQUISITES[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "independent MQTT gate prerequisite unavailable: $command_name" >&2
    exit 1
  fi
done

ROLLBACK_GATE="${YEONJANG_ROLLBACK_GATE:-0}"
ROLLBACK_TEST_BINARY=""
ROLLBACK_TEST_MANIFEST=""
if [[ "$ROLLBACK_GATE" == "1" ]]; then
  if [[ "${YEONJANG_LIVE_DEVICE_GATE:-0}" != "1" ]]; then
    echo "rollback gate requires YEONJANG_LIVE_DEVICE_GATE=1" >&2
    exit 1
  fi
  if [[ -z "${YEONJANG_ROLLBACK_BINARY:-}" \
    || ! -f "$YEONJANG_ROLLBACK_BINARY" \
    || ! -x "$YEONJANG_ROLLBACK_BINARY" \
    || -L "$YEONJANG_ROLLBACK_BINARY" ]]; then
    echo "rollback gate requires an executable previous package binary" >&2
    exit 1
  fi
  if [[ -z "${YEONJANG_ROLLBACK_PACKAGE_MANIFEST:-}" \
    || ! -f "$YEONJANG_ROLLBACK_PACKAGE_MANIFEST" \
    || -L "$YEONJANG_ROLLBACK_PACKAGE_MANIFEST" ]]; then
    echo "rollback gate requires a previous package identity manifest" >&2
    exit 1
  fi
  case "$YEONJANG_ROLLBACK_BINARY:$YEONJANG_ROLLBACK_PACKAGE_MANIFEST" in
    /*:/*) ;;
    *)
      echo "rollback gate requires absolute package input paths" >&2
      exit 1
      ;;
  esac
  ROLLBACK_TEST_BINARY="$(runtime_path "$YEONJANG_ROLLBACK_BINARY")"
  ROLLBACK_TEST_MANIFEST="$(runtime_path "$YEONJANG_ROLLBACK_PACKAGE_MANIFEST")"
elif [[ -n "${YEONJANG_ROLLBACK_BINARY:-}" \
  || -n "${YEONJANG_ROLLBACK_PACKAGE_MANIFEST:-}" ]]; then
  echo "rollback package inputs require YEONJANG_ROLLBACK_GATE=1" >&2
  exit 1
fi

# Cargo may place artifacts outside `Yeonjang/target` when the caller supplies
# `CARGO_TARGET_DIR`. Capture the executable reported by this exact build so
# the gate can never run a stale binary discovered in a different cache.
build_test_binary() {
  local test_name="$1"
  local build_output
  local executable
  build_output="$(
    cd "$YEONJANG_DIR"
    cargo test --test "$test_name" --no-run --message-format=json-render-diagnostics
  )"
  if [[ "$WINDOWS_BASH" == "1" ]]; then
    executable="$(
      printf '%s\n' "$build_output" | node -e '
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { input += chunk; });
        process.stdin.on("end", () => {
          const name = process.argv[1];
          const artifacts = input.split(/\r?\n/)
            .filter(Boolean)
            .flatMap((line) => {
              try { return [JSON.parse(line)]; } catch { return []; }
            })
            .filter((row) =>
              row.reason === "compiler-artifact"
              && row.target?.name === name
              && row.target?.kind?.includes("test")
              && typeof row.executable === "string"
            );
          process.stdout.write(artifacts.at(-1)?.executable ?? "");
        });
      ' "$test_name"
    )"
    executable="$(cygpath -u "$executable")"
  else
    executable="$(
      printf '%s\n' "$build_output" \
        | awk -v target="\"name\":\"$test_name\"" \
            'index($0, "\"kind\":[\"test\"]") && index($0, target)' \
        | sed -n 's/.*"executable":"\([^"]*\)".*/\1/p' \
        | tail -n 1
    )"
  fi
  if [[ -z "$executable" || ! -x "$executable" ]]; then
    echo "built test executable unavailable: $test_name" >&2
    return 1
  fi
  printf '%s\n' "$executable"
}

issue_ca() {
  local prefix="$1"
  local common_name="$2"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out "$WORK_DIR/$prefix.key" >/dev/null 2>&1
  MSYS2_ARG_CONV_EXCL="/CN=" openssl req -x509 -new -sha256 -days 1 \
    -key "$WORK_DIR/$prefix.key" \
    -subj "/CN=$common_name" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash" \
    -out "$WORK_DIR/$prefix.crt" >/dev/null 2>&1
}

issue_certificate() {
  local prefix="$1"
  local common_name="$2"
  local ca_prefix="$3"
  local extension_file="$4"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out "$WORK_DIR/$prefix.key" >/dev/null 2>&1
  MSYS2_ARG_CONV_EXCL="/CN=" openssl req -new -sha256 \
    -key "$WORK_DIR/$prefix.key" \
    -subj "/CN=$common_name" \
    -out "$WORK_DIR/$prefix.csr" >/dev/null 2>&1
  openssl x509 -req -sha256 -days 1 \
    -in "$WORK_DIR/$prefix.csr" \
    -CA "$WORK_DIR/$ca_prefix.crt" \
    -CAkey "$WORK_DIR/$ca_prefix.key" \
    -CAcreateserial \
    -extfile "$extension_file" \
    -out "$WORK_DIR/$prefix.crt" >/dev/null 2>&1
}

cat >"$WORK_DIR/server.ext" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost
EOF

cat >"$WORK_DIR/client.ext" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=clientAuth
EOF

issue_ca "ca" "knowbee-independent-mqtt-ca"
issue_ca "untrusted-ca" "knowbee-untrusted-mqtt-ca"
issue_certificate "server" "localhost" "ca" "$WORK_DIR/server.ext"
issue_certificate "yeonjang" "yeonjang-client" "ca" "$WORK_DIR/client.ext"
issue_certificate "requester" "requester-client" "ca" "$WORK_DIR/client.ext"
issue_certificate "probe" "probe-client" "ca" "$WORK_DIR/client.ext"
issue_certificate "untrusted" "untrusted-client" "untrusted-ca" "$WORK_DIR/client.ext"

cat >"$WORK_DIR/acl" <<EOF
user yeonjang-client
topic read yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command
topic read yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control
topic read yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/admin
topic read yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/artifact/+/ack
topic write yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/response
topic write yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/event
topic write yeonjang/v2/instances/instance-a/sessions/session-a/status
topic write yeonjang/v2/instances/instance-a/sessions/session-a/capabilities
topic write yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/artifact/+/chunk

user requester-client
topic write yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command
topic write yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control
topic write yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/admin
topic write yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/artifact/+/ack
topic read yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/response
topic read yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/event
topic read yeonjang/v2/instances/instance-a/sessions/session-a/status
topic read yeonjang/v2/instances/instance-a/sessions/session-a/capabilities
topic read yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/artifact/+/chunk

user probe-client
topic write yeonjang/v2/instances/instance-b/sessions/session-a/requesters/requester-a/response

user yeonjang-client
topic read yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/command
topic read yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/control
topic read yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/admin
topic read yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/artifact/+/ack
topic write yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/response
topic write yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/event
topic write yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/status
topic write yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/capabilities
topic write yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/artifact/+/chunk

user requester-client
topic write yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/command
topic write yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/control
topic write yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/admin
topic write yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/artifact/+/ack
topic read yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/response
topic read yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/event
topic read yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/status
topic read yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/capabilities
topic read yeonjang/v2/instances/$LIVE_INSTANCE_ID/sessions/$LIVE_SESSION_ID/requesters/$LIVE_REQUESTER_ID/artifact/+/chunk
EOF

cat >"$WORK_DIR/mosquitto.conf" <<'EOF'
per_listener_settings true
listener 8883 0.0.0.0
cafile /mosquitto/config/ca.crt
certfile /mosquitto/config/server.crt
keyfile /mosquitto/config/server.key
tls_version tlsv1.2
require_certificate true
use_identity_as_username true
allow_anonymous false
acl_file /mosquitto/config/acl
persistence false
log_dest stdout
log_type all
EOF

cat >"$WORK_DIR/mosquitto-supervisor.sh" <<'EOF'
#!/bin/sh
child=""

restart_broker() {
  if [ -n "$child" ]; then
    kill -TERM "$child" 2>/dev/null || true
  fi
}

stop_supervisor() {
  restart_broker
  exit 0
}

trap restart_broker USR1
trap stop_supervisor TERM INT

while true; do
  mosquitto -c /mosquitto/config/mosquitto.conf &
  child="$!"
  wait "$child" || true
  while kill -0 "$child" 2>/dev/null; do
    sleep 0.05
  done
  child=""
done
EOF

chmod 0700 \
  "$WORK_DIR/acl" \
  "$WORK_DIR/mosquitto.conf" \
  "$WORK_DIR/mosquitto-supervisor.sh"

BROKER_PORT=""
BROKER_CONTAINER_INPUT=""
BROKER_RESTART_COMMAND_INPUT=""
if [[ "$BROKER_BACKEND" == "native-windows" ]]; then
  mkdir -p "$LIVE_CONFIG_ROOT"
  BROKER_PORT="$(
    powershell.exe -NoProfile -NonInteractive -Command \
      '$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0); $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop(); $port' \
      | tr -d '\r\n '
  )"
  if [[ ! "$BROKER_PORT" =~ ^[0-9]+$ ]]; then
    echo "native Windows broker port allocation failed" >&2
    exit 1
  fi
  WINDOWS_WORK_DIR_MIXED="$(cygpath -m "$WORK_DIR")"
  cat >"$WORK_DIR/mosquitto-native.conf" <<EOF
per_listener_settings true
listener $BROKER_PORT 127.0.0.1
cafile $WINDOWS_WORK_DIR_MIXED/ca.crt
certfile $WINDOWS_WORK_DIR_MIXED/server.crt
keyfile $WINDOWS_WORK_DIR_MIXED/server.key
tls_version tlsv1.2
require_certificate true
use_identity_as_username true
allow_anonymous false
acl_file $WINDOWS_WORK_DIR_MIXED/acl
persistence false
log_dest file $WINDOWS_WORK_DIR_MIXED/native-broker.log
log_type all
EOF
  cat >"$WORK_DIR/mosquitto-native-supervisor.ps1" <<'EOF'
param(
  [Parameter(Mandatory = $true)][string]$BrokerExecutable,
  [Parameter(Mandatory = $true)][string]$BrokerConfig,
  [Parameter(Mandatory = $true)][string]$BrokerPidFile,
  [Parameter(Mandatory = $true)][string]$SupervisorPidFile
)
$ErrorActionPreference = 'Stop'
[IO.File]::WriteAllText($SupervisorPidFile, "$PID`n")
while ($true) {
  $process = Start-Process -FilePath $BrokerExecutable `
    -ArgumentList @('-c', "`"$BrokerConfig`"") `
    -PassThru `
    -WindowStyle Hidden
  [IO.File]::WriteAllText($BrokerPidFile, "$($process.Id)`n")
  $process.WaitForExit()
  Start-Sleep -Milliseconds 50
}
EOF
  NATIVE_BROKER_EXECUTABLE="$(command -v mosquitto.exe)"
  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass \
    -File "$(cygpath -w "$WORK_DIR/mosquitto-native-supervisor.ps1")" \
    -BrokerExecutable "$(cygpath -w "$NATIVE_BROKER_EXECUTABLE")" \
    -BrokerConfig "$(cygpath -w "$WORK_DIR/mosquitto-native.conf")" \
    -BrokerPidFile "$(cygpath -w "$NATIVE_BROKER_PID_FILE")" \
    -SupervisorPidFile "$(cygpath -w "$NATIVE_BROKER_SUPERVISOR_PID_FILE")" \
    >"$WORK_DIR/native-broker-supervisor.log" 2>&1 &

  WINDOWS_BROKER_PID_FILE="$(cygpath -w "$NATIVE_BROKER_PID_FILE")"
  cat >"$LIVE_CONFIG_ROOT/restart-mqtt-broker.cmd" <<EOF
@echo off
setlocal EnableExtensions
set "BROKER_PID="
set /p BROKER_PID=<"$WINDOWS_BROKER_PID_FILE"
if not defined BROKER_PID exit /b 1
taskkill.exe /PID %BROKER_PID% /T /F >nul 2>&1
exit /b %ERRORLEVEL%
EOF
  BROKER_RESTART_COMMAND_INPUT="$(runtime_path "$LIVE_CONFIG_ROOT/restart-mqtt-broker.cmd")"
elif [[ "$WINDOWS_BASH" == "1" ]]; then
  WINDOWS_WORK_DIR="$(cygpath -w "$WORK_DIR")"
  MSYS_NO_PATHCONV=1 docker run --detach \
    --name "$CONTAINER_NAME" \
    --publish "127.0.0.1::8883" \
    --volume "$WINDOWS_WORK_DIR:/mosquitto/config:ro" \
    "$BROKER_IMAGE" \
    sh /mosquitto/config/mosquitto-supervisor.sh >/dev/null
  BROKER_CONTAINER_INPUT="$CONTAINER_NAME"
else
  docker run --detach \
    --name "$CONTAINER_NAME" \
    --user "$(id -u):$(id -g)" \
    --publish "127.0.0.1::8883" \
    --volume "$WORK_DIR:/mosquitto/config:ro" \
    "$BROKER_IMAGE" \
    sh /mosquitto/config/mosquitto-supervisor.sh >/dev/null
  BROKER_CONTAINER_INPUT="$CONTAINER_NAME"
fi

if [[ "$BROKER_BACKEND" == "docker" ]]; then
  for _ in $(seq 1 100); do
    BROKER_PORT="$(docker port "$CONTAINER_NAME" 8883/tcp 2>/dev/null | awk -F: 'NR == 1 { print $NF }')"
    if [[ -n "$BROKER_PORT" ]] && docker inspect "$CONTAINER_NAME" \
      --format '{{.State.Running}}' 2>/dev/null | grep -qx 'true'; then
      break
    fi
    sleep 0.05
  done
fi
if [[ -z "$BROKER_PORT" ]]; then
  echo "independent MQTT broker did not become ready" >&2
  exit 1
fi

# A published Docker port only proves that the forwarding socket exists. Wait
# for a real, authenticated TLS handshake so the gate does not race Mosquitto's
# certificate/listener initialization.
BROKER_TLS_READY=0
for _ in $(seq 1 40); do
  if openssl s_client \
    -connect "$BROKER_READINESS_HOST:$BROKER_PORT" \
    -servername localhost \
    -CAfile "$WORK_DIR/ca.crt" \
    -cert "$WORK_DIR/requester.crt" \
    -key "$WORK_DIR/requester.key" \
    -verify_return_error </dev/null >/dev/null 2>&1; then
    BROKER_TLS_READY=1
    break
  fi
  sleep 0.25
done
if [[ "$BROKER_TLS_READY" != "1" ]]; then
  echo "independent MQTT broker did not complete an authenticated TLS handshake" >&2
  broker_logs
  exit 1
fi

TEST_BINARY="$(build_test_binary independent_mqtt_v2_broker)"
if [[ "$HOST_KERNEL" == "Darwin" ]]; then
  xattr -d com.apple.provenance "$TEST_BINARY" >/dev/null 2>&1 || true
fi

if ! YEONJANG_TEST_MQTT_PORT="$BROKER_PORT" \
  YEONJANG_TEST_MQTT_CA="$(runtime_path "$WORK_DIR/ca.crt")" \
  YEONJANG_TEST_MQTT_YEONJANG_CERT="$(runtime_path "$WORK_DIR/yeonjang.crt")" \
  YEONJANG_TEST_MQTT_YEONJANG_KEY="$(runtime_path "$WORK_DIR/yeonjang.key")" \
  YEONJANG_TEST_MQTT_REQUESTER_CERT="$(runtime_path "$WORK_DIR/requester.crt")" \
  YEONJANG_TEST_MQTT_REQUESTER_KEY="$(runtime_path "$WORK_DIR/requester.key")" \
  YEONJANG_TEST_MQTT_PROBE_CERT="$(runtime_path "$WORK_DIR/probe.crt")" \
  YEONJANG_TEST_MQTT_PROBE_KEY="$(runtime_path "$WORK_DIR/probe.key")" \
  YEONJANG_TEST_MQTT_UNTRUSTED_CERT="$(runtime_path "$WORK_DIR/untrusted.crt")" \
  YEONJANG_TEST_MQTT_UNTRUSTED_KEY="$(runtime_path "$WORK_DIR/untrusted.key")" \
  "$TEST_BINARY" \
    --ignored \
    --exact independent_mtls_broker_enforces_identity_hostname_and_exact_topic_acl \
    --nocapture \
    --test-threads=1; then
  broker_logs
  exit 1
fi

echo "Independent Yeonjang MQTT mTLS/ACL gate passed."

if [[ "${YEONJANG_LIVE_DEVICE_GATE:-0}" != "1" ]]; then
  exit 0
fi
for command_name in node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "live Yeonjang device gate prerequisite unavailable: $command_name" >&2
    exit 1
  fi
done

LIVE_PLATFORM="$HOST_KERNEL"
LIVE_ARCH="$(uname -m)"
case "$LIVE_PLATFORM:$LIVE_ARCH" in
  Darwin:arm64)
    if ! command -v codesign >/dev/null 2>&1; then
      echo "live Yeonjang device gate prerequisite unavailable: codesign" >&2
      exit 1
    fi
    LIVE_APP="$YEONJANG_DIR/target/release/Yeonjang.app"
    LIVE_BINARY="$LIVE_APP/Contents/MacOS/Yeonjang"
    LIVE_PACKAGE_TARGET="darwin-arm64"
    LIVE_TEST_NAME="packaged_macos_live_mqtt"
    LIVE_TEST_FUNCTION="signed_package_captures_camera_and_screen_over_direct_mqtt"
    LIVE_ALIAS="live-macos"
    if [[ ! -x "$LIVE_BINARY" ]]; then
      echo "signed macOS Yeonjang app is unavailable; run scripts/build-yeonjang-macos.sh" >&2
      exit 1
    fi
    codesign --verify --deep --strict "$LIVE_APP"
    ;;
  Linux:x86_64)
    if ! compgen -G '/dev/video*' >/dev/null; then
      echo "Linux live gate requires an observed /dev/video* camera device" >&2
      exit 1
    fi
    if ! command -v ffmpeg >/dev/null 2>&1 && ! command -v fswebcam >/dev/null 2>&1; then
      echo "Linux live gate requires ffmpeg or fswebcam" >&2
      exit 1
    fi
    case "${XDG_SESSION_TYPE:-}" in
      wayland)
        if ! command -v grim >/dev/null 2>&1 \
          && ! command -v gnome-screenshot >/dev/null 2>&1; then
          echo "Wayland live gate requires grim or gnome-screenshot" >&2
          exit 1
        fi
        ;;
      x11)
        if ! command -v gnome-screenshot >/dev/null 2>&1 \
          && ! command -v scrot >/dev/null 2>&1 \
          && ! command -v import >/dev/null 2>&1; then
          echo "X11 live gate requires gnome-screenshot, scrot, or import" >&2
          exit 1
        fi
        ;;
      *)
        echo "Linux live gate requires exact XDG_SESSION_TYPE=wayland or x11" >&2
        exit 1
        ;;
    esac
    bash "$ROOT_DIR/scripts/build-yeonjang-linux.sh"
    LIVE_BINARY="$YEONJANG_DIR/target/release/knowbee-yeonjang"
    LIVE_PACKAGE_TARGET="linux-x64"
    LIVE_TEST_NAME="packaged_linux_live_mqtt"
    LIVE_TEST_FUNCTION="packaged_linux_captures_camera_and_screen_over_direct_mqtt"
    LIVE_ALIAS="live-linux-${XDG_SESSION_TYPE}"
    ;;
  MINGW*:*|MSYS*:*|CYGWIN*:*)
    # Windows PowerShell launched from an x64 Git Bash process reports the
    # emulated process architecture through RuntimeInformation. CIM's numeric
    # processor contract identifies the physical host architecture instead:
    # 9 = x64, 12 = ARM64.
    WINDOWS_NATIVE_ARCH_CODE="$(
      powershell.exe -NoProfile -NonInteractive -Command \
        '(Get-CimInstance Win32_Processor | Select-Object -First 1).Architecture' \
        | tr -d '\r\n '
    )"
    case "$WINDOWS_NATIVE_ARCH_CODE" in
      9)
        LIVE_PACKAGE_TARGET="win32-x64"
        LIVE_TEST_NAME="packaged_windows_live_mqtt"
        LIVE_TEST_FUNCTION="packaged_windows_captures_camera_and_screen_over_direct_mqtt"
        ;;
      12)
        LIVE_PACKAGE_TARGET="win32-arm64"
        LIVE_TEST_NAME="packaged_windows_arm64_live_mqtt"
        LIVE_TEST_FUNCTION="packaged_windows_arm64_captures_camera_and_screen_over_direct_mqtt"
        ;;
      *)
        echo "Windows live gate requires native Windows 11 x64 or ARM64; observed processor architecture code $WINDOWS_NATIVE_ARCH_CODE" >&2
        exit 1
        ;;
    esac
    WINDOWS_SESSION_ID="$(
      powershell.exe -NoProfile -NonInteractive -Command \
        '[System.Diagnostics.Process]::GetCurrentProcess().SessionId' \
        | tr -d '\r\n '
    )"
    if [[ -z "$WINDOWS_SESSION_ID" || "$WINDOWS_SESSION_ID" == "0" ]]; then
      echo "Windows live gate requires an interactive camera/display session" >&2
      exit 1
    fi
    if [[ -n "${YEONJANG_TARGET_TRIPLE:-}" ]]; then
      echo "Windows live gate rejects target override; use the native x64 toolchain" >&2
      exit 1
    fi
    if [[ -z "${YEONJANG_LIVE_WINDOWS_CAMERA_DEVICE_ID:-}" ]]; then
      echo "Windows live gate requires YEONJANG_LIVE_WINDOWS_CAMERA_DEVICE_ID" >&2
      exit 1
    fi
    WINDOWS_TARGET_DIR="$(cygpath -w "$WORK_DIR/windows-target")"
    WINDOWS_ROOT_DIR="$(cygpath -w "$ROOT_DIR")"
    WINDOWS_BUILD_LAUNCHER="$WORK_DIR/windows-build-live-gate.cmd"
    WINDOWS_BUILD_LAUNCHER_NATIVE="$(cygpath -w "$WINDOWS_BUILD_LAUNCHER")"
    cat >"$WINDOWS_BUILD_LAUNCHER" <<EOF
@echo off
setlocal
pushd "$WINDOWS_ROOT_DIR" || exit /b 1
call scripts\build-yeonjang-windows.bat
set "BUILD_EXIT=%ERRORLEVEL%"
popd
exit /b %BUILD_EXIT%
EOF
    YEONJANG_TARGET_DIR="$WINDOWS_TARGET_DIR" \
      MSYS_NO_PATHCONV=1 cmd.exe /d /c "$WINDOWS_BUILD_LAUNCHER_NATIVE"
    LIVE_BINARY="$WORK_DIR/windows-target/release/knowbee-yeonjang.exe"
    if [[ ! -x "$LIVE_BINARY" ]]; then
      echo "native Windows Yeonjang release binary is unavailable" >&2
      exit 1
    fi
    LIVE_ALIAS="live-windows"
    ;;
  *)
    echo "live Yeonjang device gate requires macOS arm64, Windows 11 x64, or Linux x86_64" >&2
    exit 1
    ;;
esac

LIVE_PACKAGE_ROOT="$WORK_DIR/package"
node "$ROOT_DIR/scripts/package-yeonjang-platform.mjs" \
  --target "$LIVE_PACKAGE_TARGET" \
  --binary "$LIVE_BINARY" \
  --output-dir "$LIVE_PACKAGE_ROOT" >/dev/null
LIVE_PACKAGE_MANIFEST="$LIVE_PACKAGE_ROOT/yeonjang-$LIVE_PACKAGE_TARGET/release-identity.json"

LIVE_SETTINGS_DIR="$LIVE_CONFIG_ROOT"
LIVE_ARTIFACT_ROOT="$WORK_DIR/live-artifacts"
LIVE_LOG="$WORK_DIR/live-runtime.log"
mkdir -p "$LIVE_SETTINGS_DIR" "$LIVE_ARTIFACT_ROOT"
LIVE_ARTIFACT_CONFIG_PATH="$(runtime_path "$LIVE_ARTIFACT_ROOT")"
cat >"$LIVE_SETTINGS_DIR/settings.json" <<EOF
{
  "schema_version": 1,
  "permission_review_required": false,
  "instance_id": "$LIVE_INSTANCE_ID",
  "instance_alias": "$LIVE_ALIAS",
  "node_id": "live-node",
  "display_name": "Yeonjang Live Gate",
  "support_profile": "desktop_interactive",
  "workspace_scope_id": "workspace-live",
  "host_fingerprint": "live-host-fingerprint",
  "install_fingerprint": "live-install-fingerprint",
  "connection": {
    "host": "localhost",
    "port": $BROKER_PORT,
    "username": "yeonjang-client",
    "auto_connect": true,
    "launch_on_system_start": false
  },
  "mqtt_v2": {
    "session_id": "$LIVE_SESSION_ID",
    "requester_id": "$LIVE_REQUESTER_ID"
  },
  "permissions": {
    "allow_camera_access": true,
    "allow_screen_capture": true
  },
  "capture_artifact_root": "$LIVE_ARTIFACT_CONFIG_PATH"
}
EOF
chmod 0600 "$LIVE_SETTINGS_DIR/settings.json"

LIVE_TEST_BINARY="$(build_test_binary "$LIVE_TEST_NAME")"
if [[ "$LIVE_PLATFORM" == "Darwin" ]]; then
  xattr -d com.apple.provenance "$LIVE_TEST_BINARY" >/dev/null 2>&1 || true
fi

if ! YEONJANG_TEST_MQTT_PORT="$BROKER_PORT" \
  YEONJANG_TEST_MQTT_CA="$(runtime_path "$WORK_DIR/ca.crt")" \
  YEONJANG_TEST_MQTT_YEONJANG_CERT="$(runtime_path "$WORK_DIR/yeonjang.crt")" \
  YEONJANG_TEST_MQTT_YEONJANG_KEY="$(runtime_path "$WORK_DIR/yeonjang.key")" \
  YEONJANG_TEST_MQTT_REQUESTER_CERT="$(runtime_path "$WORK_DIR/requester.crt")" \
  YEONJANG_TEST_MQTT_REQUESTER_KEY="$(runtime_path "$WORK_DIR/requester.key")" \
  YEONJANG_TEST_MQTT_BROKER_CONTAINER="$BROKER_CONTAINER_INPUT" \
  YEONJANG_TEST_MQTT_BROKER_RESTART_COMMAND="$BROKER_RESTART_COMMAND_INPUT" \
  YEONJANG_TEST_LIVE_INSTANCE="$LIVE_INSTANCE_ID" \
  YEONJANG_TEST_LIVE_SESSION="$LIVE_SESSION_ID" \
  YEONJANG_TEST_LIVE_REQUESTER="$LIVE_REQUESTER_ID" \
  YEONJANG_TEST_LIVE_HOST_FINGERPRINT="live-host-fingerprint" \
  YEONJANG_TEST_LIVE_INSTALL_FINGERPRINT="live-install-fingerprint" \
  YEONJANG_TEST_LIVE_BINARY="$(runtime_path "$LIVE_BINARY")" \
  YEONJANG_TEST_LIVE_PACKAGE_MANIFEST="$(runtime_path "$LIVE_PACKAGE_MANIFEST")" \
  YEONJANG_TEST_LIVE_CONFIG_ROOT="$(runtime_path "$LIVE_CONFIG_ROOT")" \
  YEONJANG_TEST_LIVE_ARTIFACT_ROOT="$(runtime_path "$LIVE_ARTIFACT_ROOT")" \
  YEONJANG_TEST_LIVE_LOG="$(runtime_path "$LIVE_LOG")" \
  YEONJANG_TEST_LIVE_CAMERA_DEVICE_ID="${YEONJANG_LIVE_WINDOWS_CAMERA_DEVICE_ID:-}" \
  YEONJANG_TEST_ROLLBACK_BINARY="$ROLLBACK_TEST_BINARY" \
  YEONJANG_TEST_ROLLBACK_PACKAGE_MANIFEST="$ROLLBACK_TEST_MANIFEST" \
  "$LIVE_TEST_BINARY" \
    --ignored \
    --exact "$LIVE_TEST_FUNCTION" \
    --nocapture \
    --test-threads=1; then
  if [[ -f "$LIVE_LOG" ]]; then
    tail -n 80 "$LIVE_LOG" >&2 || true
  fi
  broker_logs
  exit 1
fi

echo "$LIVE_PACKAGE_TARGET Yeonjang camera/screen MQTT device gate passed."
if [[ "$ROLLBACK_GATE" == "1" ]]; then
  echo "$LIVE_PACKAGE_TARGET Yeonjang previous-package rollback gate passed."
fi
