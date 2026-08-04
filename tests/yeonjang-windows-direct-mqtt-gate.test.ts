import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = (path: string) => readFileSync(path, "utf8")

describe("Windows direct MQTT release gate", () => {
  it("owns a native x64 package profile and targeted graceful shutdown", () => {
    const entry = source("Yeonjang/tests/packaged_windows_live_mqtt.rs")
    const sharedGate = source("Yeonjang/tests/support/packaged_desktop_live_mqtt.rs")
    const managedRoot = source("Yeonjang/src/main.rs")

    expect(entry).toContain('package_target: "win32-x64"')
    expect(entry).toContain('target_arch: "x86_64"')
    expect(sharedGate).toContain("CREATE_NEW_PROCESS_GROUP")
    expect(sharedGate).toContain("GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT")
    expect(managedRoot).toContain("wait_for_managed_shutdown_signal()")
  })

  it("keeps the first exact build output instead of selecting a stale fallback", () => {
    const build = source("scripts/build-yeonjang-windows.bat")

    expect(build).toContain("setlocal EnableExtensions EnableDelayedExpansion")
    expect(build).toContain('if "!BINARY_PATH!"=="" if exist')
    expect(build).not.toContain('if "%BINARY_PATH%"=="" if exist')
  })

  it("selects an exact native x64 or ARM64 Windows package test", () => {
    const gate = source("scripts/self/run-yeonjang-independent-mqtt-gate.sh")
    const runbook = source("docs/release-runbook.md")

    expect(gate).toContain("Get-CimInstance Win32_Processor")
    expect(gate).toContain("9)")
    expect(gate).toContain("12)")
    expect(gate).not.toContain("RuntimeInformation]::OSArchitecture")
    expect(gate).toContain('WINDOWS_BUILD_LAUNCHER="$WORK_DIR/windows-build-live-gate.cmd"')
    expect(gate).toContain('pushd "$WINDOWS_ROOT_DIR" || exit /b 1')
    expect(gate).toContain('call scripts\\build-yeonjang-windows.bat')
    expect(gate).toContain('MSYS_NO_PATHCONV=1 cmd.exe /d /c "$WINDOWS_BUILD_LAUNCHER_NATIVE"')
    expect(gate).toContain('LIVE_PACKAGE_TARGET="win32-x64"')
    expect(gate).toContain('LIVE_PACKAGE_TARGET="win32-arm64"')
    expect(gate).toContain('LIVE_TEST_NAME="packaged_windows_live_mqtt"')
    expect(gate).toContain('LIVE_TEST_NAME="packaged_windows_arm64_live_mqtt"')
    expect(gate).toContain('WINDOWS_LLVM_BIN="/c/Program Files/LLVM/bin"')
    expect(gate).toContain('PATH="$WINDOWS_LLVM_BIN:$PATH"')
    expect(gate).toContain(
      'LIVE_TEST_FUNCTION="packaged_windows_captures_camera_and_screen_over_direct_mqtt"',
    )
    expect(gate).toContain(
      'LIVE_TEST_FUNCTION="packaged_windows_arm64_captures_camera_and_screen_over_direct_mqtt"',
    )
    expect(runbook).toContain("YEONJANG_LIVE_WINDOWS_CAMERA_DEVICE_ID")
  })

  it("uses an exact script-owned native broker when Docker is unavailable", () => {
    const gate = source("scripts/self/run-yeonjang-independent-mqtt-gate.sh")
    const sharedGate = source("Yeonjang/tests/support/packaged_desktop_live_mqtt.rs")

    expect(gate).toContain('BROKER_BACKEND="native-windows"')
    expect(gate).toContain("mosquitto.exe")
    expect(gate).toContain("restart-mqtt-broker.cmd")
    expect(gate).toContain("YEONJANG_TEST_MQTT_BROKER_RESTART_COMMAND")
    expect(gate).toContain('MSYS2_ARG_CONV_EXCL="/CN=" openssl req')
    expect(gate).toContain('export OPENSSL_CONF="${OPENSSL_CONF:-NUL}"')
    expect(gate).toContain('BROKER_READINESS_HOST="127.0.0.1"')
    expect(gate).toContain("native-broker-supervisor.pid")
    expect(gate).toContain("Start-Process -FilePath")
    expect(gate).toContain("basicConstraints=critical,CA:TRUE")
    expect(sharedGate).toContain("YEONJANG_TEST_MQTT_BROKER_RESTART_COMMAND")
    expect(sharedGate).toContain("BrokerRestart")
  })
})
