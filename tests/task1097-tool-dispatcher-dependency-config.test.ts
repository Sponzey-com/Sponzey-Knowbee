import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb } from "../packages/core/src/db/index.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task1097-"))

beforeAll(() => {
  closeDb()
  initializeTestDbRuntime(stateDir)
})

afterAll(() => {
  closeDb()
  rmSync(stateDir, { recursive: true, force: true })
})

describe("task1097 tool dispatcher dependency config", () => {
  it("requires one captured config and isolates the runtime composition root", () => {
    const dispatcherSource = readFileSync("packages/core/src/tools/dispatcher.ts", "utf-8")

    expect(dispatcherSource).toContain("export interface ToolDispatcherDependencies")
    expect(dispatcherSource).toContain("function buildRuntimeToolContext(input: {")
    expect(dispatcherSource).toContain("ctx: ToolContext")
    expect(dispatcherSource).toContain("config: ToolRuntimeConfigSnapshot")
    expect(dispatcherSource).toContain("constructor(dependencies: ToolDispatcherDependencies)")
    expect(dispatcherSource).toContain("this.config = dependencies.config")
    expect(dispatcherSource).not.toContain("getConfig")
  })

  it("uses ToolContext fragments ahead of the captured config", async () => {
    const config = DEFAULT_CONFIG
    const dispatcher = new ToolDispatcher({ config })

    dispatcher.register({
      name: "config_fragment_probe",
      description: "returns ok",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute(_params, ctx) {
        return {
          success: Boolean(ctx.securityConfig && ctx.mqttConfig && ctx.searchConfig && ctx.memoryConfig),
          output: "ok",
        }
      },
    })

    const result = await dispatcher.dispatch("config_fragment_probe", {}, {
      sessionId: "session-task1097",
      runId: "run-task1097",
      requestGroupId: "request-group-task1097",
      workDir: process.cwd(),
      userMessage: "probe",
      source: "webui",
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
      mqttConfig: config.mqtt,
      securityConfig: config.security,
      searchConfig: config.search,
      memoryConfig: config.memory,
    })

    expect(result.success).toBe(true)
  })
})
