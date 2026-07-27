import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createApiServerRuntimeContext } from "../packages/core/src/api/server-runtime-context.ts"
import { loadConfigSnapshot } from "../packages/core/src/config/index.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { buildRuntimeManifest } from "../packages/core/src/runtime/manifest.ts"
import { createStartupProcessContext } from "../packages/core/src/runtime/startup-process-context.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const repoRoot = process.cwd()
const tempDirs: string[] = []

function createTempDir(name: string): string {
  const path = mkdtempSync(join(tmpdir(), `knowbee-task1166-${name}-`))
  tempDirs.push(path)
  return path
}

afterEach(() => {
  closeDb()
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe("task1166 startup configuration and process context", () => {
  it("clones and freezes startup environment, argv, and cwd", () => {
    const env: Record<string, string | undefined> = {
      KNOWBEE_ADMIN_UI: "1",
      KNOWBEE_UPDATE_REPOSITORY: "startup-repository",
    }
    const argv = ["node", "knowbee", "--admin-ui"]
    const context = createStartupProcessContext({ env, argv, cwd: "/startup/workspace" })

    env.KNOWBEE_ADMIN_UI = "0"
    env.KNOWBEE_UPDATE_REPOSITORY = "changed-repository"
    argv.push("--changed")

    expect(context.cwd).toBe("/startup/workspace")
    expect(context.env.KNOWBEE_ADMIN_UI).toBe("1")
    expect(context.env.KNOWBEE_UPDATE_REPOSITORY).toBe("startup-repository")
    expect(context.argv).toEqual(["node", "knowbee", "--admin-ui"])
    expect(Object.isFrozen(context)).toBe(true)
    expect(Object.isFrozen(context.env)).toBe(true)
    expect(Object.isFrozen(context.argv)).toBe(true)
  })

  it("derives API feature inputs only from the supplied startup context", () => {
    const startup = createStartupProcessContext({
      cwd: "/startup/workspace",
      argv: ["node", "knowbee", "--admin-ui"],
      env: {
        KNOWBEE_ADMIN_UI: "1",
        KNOWBEE_ENTERPRISE_TOPOLOGY_BUILDER_UI: "true",
        KNOWBEE_CHANNEL_SMOKE_LIVE: "1",
        KNOWBEE_LIVE_ACCEPTANCE: "1",
        KNOWBEE_UPDATE_REPOSITORY: "startup-repository",
      },
    })

    const runtime = createApiServerRuntimeContext(startup)

    expect(runtime.argv).toEqual(startup.argv)
    expect(runtime.uiModeEnv.KNOWBEE_ADMIN_UI).toBe("1")
    expect(runtime.enterpriseTopologyBuilderUi).toBe("true")
    expect(runtime.channelSmokeLiveEnabled).toBe(true)
    expect(runtime.liveAcceptanceEnabled).toBe(true)
    expect(runtime.updateEnv.KNOWBEE_UPDATE_REPOSITORY).toBe("startup-repository")
    expect(Object.isFrozen(runtime)).toBe(true)
  })

  it("loads config only from the explicit startup environment and paths", () => {
    const startupRoot = createTempDir("config-startup")
    const changedRoot = createTempDir("config-changed")
    const startupState = join(startupRoot, "state")
    mkdirSync(startupState)
    writeFileSync(join(startupRoot, ".env"), "KNOWBEE_MQTT_HOST=startup-host\n", "utf8")
    writeFileSync(join(changedRoot, ".env"), "KNOWBEE_MQTT_HOST=changed-host\n", "utf8")
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: startupState },
      { homeDir: startupRoot, exists: () => false },
    )

    const config = loadConfigSnapshot({ baseEnv: {}, cwd: startupRoot, paths })

    expect(config.mqtt.host).toBe("startup-host")
    expect(config.mqtt.host).not.toBe("changed-host")
  })

  it("fails malformed explicit config without switching to another root", () => {
    const root = createTempDir("config-malformed")
    const stateDir = join(root, "state")
    mkdirSync(stateDir)
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: stateDir },
      { homeDir: root, exists: () => false },
    )
    writeFileSync(paths.configFile, "{ invalid: [", "utf8")

    expect(() => loadConfigSnapshot({ baseEnv: {}, cwd: root, paths })).toThrow()
  })

  it("records the supplied startup cwd in the runtime manifest", () => {
    const root = createTempDir("manifest")
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: join(root, "state") },
      { homeDir: root, exists: () => false },
    )
    const config = structuredClone(DEFAULT_CONFIG)
    config.profile.workspace = repoRoot
    initializeTestDbRuntime(paths.stateDir)

    const manifest = buildRuntimeManifest({
      config,
      paths,
      processCwd: "/startup/manifest-workspace",
      includeEnvironment: false,
      includeReleasePackage: false,
    })

    expect(manifest.process.cwd).toBe("/startup/manifest-workspace")
  })

  it("keeps config, API, MCP, and manifest modules free of runtime cwd fallback", () => {
    const source = (relativePath: string) => readFileSync(join(repoRoot, relativePath), "utf8")
    const config = source("packages/core/src/config/index.ts")
    const server = source("packages/core/src/api/server.ts")
    const mcp = source("packages/core/src/mcp/client.ts")
    const manifest = source("packages/core/src/runtime/manifest.ts")

    expect(config).not.toContain("baseEnv: EnvSnapshot = process.env")
    expect(config).not.toContain("locations.cwd ?? process.cwd()")
    expect(config).not.toContain("locations.stateDir ?? PATHS.stateDir")
    expect(config).not.toContain("process.env")
    expect(config).not.toContain("process.cwd()")
    expect(config).not.toContain("captureLegacyConfigSnapshotInput")
    expect(config).not.toMatch(/export function (?:loadConfig|getConfig|reloadConfig)\(/u)
    expect(server).not.toContain("API_SERVER_RUNTIME_ENV")
    expect(server).not.toContain("process.env[")
    expect(server).not.toContain("process.argv")
    expect(mcp).not.toContain("this.config.cwd || process.cwd()")
    expect(manifest).not.toContain("cwd: process.cwd()")
  })

  it("captures process state only in the startup composition adapter", () => {
    const startup = readFileSync(
      join(repoRoot, "packages/core/src/runtime/startup-process-context.ts"),
      "utf8",
    )
    const composition = readFileSync(
      join(repoRoot, "packages/core/src/runtime/bootstrap.ts"),
      "utf8",
    )

    expect(startup).toContain("process.env")
    expect(startup).toContain("process.argv")
    expect(startup).toContain("process.cwd()")
    expect(composition).toContain("resolveBootstrapProcessContext()")
    expect(composition).toContain("processCwd: processContext.cwd")
    expect(composition).toContain("mcpStartup.prepare(")
    expect(composition).toContain("{ ...processContext.env }")
    expect(composition).toContain("startMcpConnectionsInBackground(mcpStartup)")
    expect(composition).not.toContain("mcpRegistry.loadFromConfig")
  })

  it("keeps the three log purposes behind one startup environment snapshot", () => {
    const logger = readFileSync(join(repoRoot, "packages/core/src/logger/index.ts"), "utf8")

    expect(logger).toContain('export type LogPurpose = "product" | "debug" | "development"')
    expect(logger).toContain("const LOGGER_RUNTIME_ENV: LoggerRuntimeEnvSnapshot = Object.freeze({")
    expect(logger).toContain("const LOG_POLICY = {")
  })
})
