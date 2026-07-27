import { createRequire } from "node:module"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { registerChannelsRoute } from "../packages/core/src/api/routes/channels.js"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.js"
import { closeDb } from "../packages/core/src/db/index.js"
import { setSlackRuntimeError, stopActiveSlackChannel } from "../packages/core/src/channels/slack/runtime.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{
    statusCode: number
    json(): any
  }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

const slackBotToken = "xoxb-task0341-slack-bot-token"
const slackAppToken = "xapp-task0341-slack-app-token"

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0341-state-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: JSON.stringify({
      slack: {
        enabled: true,
        botToken: slackBotToken,
        appToken: slackAppToken,
      },
    }, null, 2),
  })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempState()
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    ok: false,
    error: `socket restart rejected for ${slackAppToken} and ${slackBotToken}`,
  }), { status: 403, headers: { "content-type": "application/json" } })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  stopActiveSlackChannel()
  setSlackRuntimeError(null)
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0341 channel restart error redaction", () => {
  it("routes channel restart exceptions through a redacted helper", () => {
    const source = readFileSync("packages/core/src/api/routes/channels.ts", "utf-8")

    expect(source).toContain("function channelRouteRuntimeErrorMessage(error: unknown")
    expect(source).toContain("return redactChannelErrorMessage(config, paths, rawMessage, fallback)")
    expect(source).toContain("const message = channelRouteRuntimeErrorMessage(error, cfg, paths)")
    expect(source).toContain("error: channelRouteRuntimeErrorMessage(error, config, paths)")
    expect(source).not.toContain("redactChannelErrorMessage(error instanceof Error ? error.message : String(error))")
  })

  it("masks Slack tokens in restart failures and subsequent health", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerChannelsRoute(app)
    await app.ready()
    try {
      const restart = await app.inject({
        method: "POST",
        url: "/api/channels/slack:primary/restart",
        payload: {},
      })

      expect(restart.statusCode).toBe(500)
      expect(restart.json().error).toContain("socket restart rejected")
      expect(restart.json().error).toContain("***")
      expect(JSON.stringify(restart.json())).not.toContain(slackBotToken)
      expect(JSON.stringify(restart.json())).not.toContain(slackAppToken)

      const health = await app.inject({ method: "GET", url: "/api/channels/slack:primary/health" })
      expect(health.statusCode).toBe(200)
      expect(JSON.stringify(health.json())).not.toContain(slackBotToken)
      expect(JSON.stringify(health.json())).not.toContain(slackAppToken)
      expect(health.json().runtime.lastError).toContain("***")
    } finally {
      await app.close()
    }
  })
})
