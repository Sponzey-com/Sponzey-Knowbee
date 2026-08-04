import { execFileSync } from "node:child_process"
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const tempDirs: string[] = []

function writeExecutable(filePath: string, source: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, source, "utf8")
  chmodSync(filePath, 0o755)
}

function createStartFixture(): {
  rootDir: string
  startScript: string
  buildMarker: string
  environment: NodeJS.ProcessEnv
} {
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-macos-start-"))
  tempDirs.push(rootDir)
  const scriptsDir = join(rootDir, "scripts")
  const fakeBinDir = join(rootDir, "fake-bin")
  const startScript = join(scriptsDir, "start-yeonjang-macos.sh")
  const buildMarker = join(rootDir, "build-called")
  const pgrepState = join(rootDir, "pgrep-state")
  const appExecutable = join(
    rootDir,
    "Yeonjang",
    "target",
    "release",
    "Yeonjang.app",
    "Contents",
    "MacOS",
    "Yeonjang",
  )

  mkdirSync(scriptsDir, { recursive: true })
  cpSync("scripts/start-yeonjang-macos.sh", startScript)
  chmodSync(startScript, 0o755)
  writeExecutable(appExecutable, "#!/usr/bin/env bash\nexit 0\n")
  writeExecutable(
    join(scriptsDir, "build-yeonjang-macos.sh"),
    `#!/usr/bin/env bash\n: > "${buildMarker}"\n`,
  )
  writeExecutable(join(fakeBinDir, "uname"), "#!/usr/bin/env bash\necho Darwin\n")
  writeExecutable(join(fakeBinDir, "open"), "#!/usr/bin/env bash\nexit 0\n")
  writeExecutable(join(fakeBinDir, "codesign"), "#!/usr/bin/env bash\nexit 0\n")
  writeExecutable(
    join(fakeBinDir, "pgrep"),
    `#!/usr/bin/env bash
count=0
if [[ -f "${pgrepState}" ]]; then
  count="$(<"${pgrepState}")"
fi
count=$((count + 1))
echo "$count" > "${pgrepState}"
if [[ "$count" -ge 2 ]]; then
  echo "$KNOWBEE_TEST_LIVE_PID"
fi
`,
  )

  return {
    rootDir,
    startScript,
    buildMarker,
    environment: {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
      KNOWBEE_TEST_LIVE_PID: String(process.pid),
    },
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  }
})

describe("Yeonjang macOS startup identity contract", () => {
  it("routes packaged headless managed startup through the bounded Tokio composition", () => {
    const main = readFileSync("Yeonjang/src/main.rs", "utf8")

    expect(main).toContain("MqttV2ProductionConfig::from_resolved_settings")
    expect(main).toContain("MqttV2ProductionDependencies")
    expect(main).toContain("TokioRuntimeHost::acquire")
    expect(main).toContain("start_production_mqtt_v2")
    expect(main).not.toContain("start_runtime_with_admission_and_transport")
  })

  it("routes GUI MQTT startup through the shared Iced Tokio composition", () => {
    const gui = readFileSync("Yeonjang/src/gui.rs", "utf8")

    expect(gui).toContain("MqttV2ProductionConfig::from_resolved_settings")
    expect(gui).toContain("MqttV2ProductionDependencies")
    expect(gui).toContain("start_production_mqtt_v2")
    expect(gui).toContain("runtime_snapshot")
    expect(gui).toContain("confirm_permission_review")
    expect(gui).not.toContain("start_runtime_with_admission")
    expect(gui).not.toContain("MqttRuntimeHandle")
    expect(gui.match(/\bload_settings\(/gu)).toHaveLength(1)
    expect(gui).toContain("let bootstrap_settings = match load_settings()")
  })

  it("keeps only the bounded MQTT request dispatcher path", () => {
    const mqtt = readFileSync("Yeonjang/src/mqtt.rs", "utf8")
    const library = readFileSync("Yeonjang/src/lib.rs", "utf8")

    expect(mqtt).not.toContain("Option<TokioRequestDispatcher>")
    expect(mqtt).not.toContain("SharedProcessedRequests")
    expect(mqtt.match(/thread::spawn/g) ?? []).toHaveLength(0)
    expect(mqtt).not.toContain("recv_timeout")
    expect(mqtt).toContain("AsyncClient")
    expect(mqtt).toContain("build_mqtt_client_id")
    expect(mqtt).not.toContain('format!("{}-mqtt", settings.node_id.trim())')
    expect(library).not.toContain("start_runtime_with_admission")
    expect(library).not.toMatch(/\bstart_runtime,\s/u)

    const sharedPlatform = readFileSync("Yeonjang/src/platform/shared.rs", "utf8")
    expect(sharedPlatform).not.toContain("detect_command_policy_violation")
    expect(sharedPlatform).toContain("MAX_COMMAND_OUTPUT_BYTES")
    expect(sharedPlatform).toContain("terminate_command_process_tree")
  })

  it("restarts an existing app bundle without rebuilding or resigning it", () => {
    const fixture = createStartFixture()

    execFileSync("bash", [fixture.startScript, "--restart"], {
      cwd: fixture.rootDir,
      env: fixture.environment,
      stdio: "pipe",
    })

    expect(existsSync(fixture.buildMarker)).toBe(false)
  })

  it("builds only when explicitly requested", () => {
    const fixture = createStartFixture()

    execFileSync("bash", [fixture.startScript, "--build"], {
      cwd: fixture.rootDir,
      env: fixture.environment,
      stdio: "pipe",
    })

    expect(existsSync(fixture.buildMarker)).toBe(true)
  })

  it("fails closed when helper or app signing verification fails", () => {
    const build = readFileSync("scripts/build-yeonjang-macos.sh", "utf8")
    const helperSign = build.indexOf('codesign --force --sign "$SIGNING_IDENTITY" "$CAMERA_HELPER_BINARY_PATH"')
    const appSign = build.indexOf(
      'codesign --force --sign "$SIGNING_IDENTITY" --entitlements "$MACOS_ENTITLEMENTS" "$APP_BUNDLE_PATH"',
    )
    const strictVerification = build.indexOf("codesign --verify --deep --strict")

    expect(build).toContain('PREFERRED_LOCAL_SIGNING_IDENTITY="Sponzey RemoCom Local Code Signing"')
    expect(build).toContain('security find-identity -v -p codesigning')
    expect(build).toContain('SIGNING_IDENTITY="$PREFERRED_LOCAL_SIGNING_IDENTITY"')
    expect(build).toContain('SIGNING_IDENTITY="-"')
    expect(helperSign).toBeGreaterThan(-1)
    expect(appSign).toBeGreaterThan(helperSign)
    expect(strictVerification).toBeGreaterThan(appSign)
    expect(build).not.toMatch(/codesign[^\n]*\|\|\s*true/u)
  })
})
