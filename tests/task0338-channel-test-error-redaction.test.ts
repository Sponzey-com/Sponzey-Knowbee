import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { registerSetupRoute } from "../packages/core/src/api/routes/setup.js"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

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

function createRuntimeFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0338-channel-"))
  tempDirs.push(rootDir)
  return createTestRuntimeConfigFixture({ rootDir })
}

afterEach(() => {
  vi.unstubAllGlobals()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0338 channel setup test error redaction", () => {
  it("routes setup channel test exceptions through a redacted helper", () => {
    const source = readFileSync("packages/core/src/api/routes/setup.ts", "utf-8")

    expect(source).toContain("function setupChannelTestExceptionMessage")
    expect(source).toContain("return redactChannelTestError(rawMessage, secrets, fallback)")
    expect(source).toContain('message: setupChannelTestExceptionMessage(error, [token], "Telegram API 연결에 실패했습니다.")')
    expect(source).toContain('message: setupChannelTestExceptionMessage(error, [botToken, appToken], "Slack 연결 테스트에 실패했습니다.")')
    expect(source).not.toContain("error instanceof Error ? error.message : String(error),\n          [token]")
    expect(source).not.toContain("error instanceof Error ? error.message : String(error),\n          [botToken, appToken]")
  })

  it("does not echo Telegram bot tokens from provider error descriptions", async () => {
    const token = "123456:telegram-task0338-secret-token"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      description: `Unauthorized for token ${token}`,
    }), { status: 401, headers: { "content-type": "application/json" } })))

    const runtimeFixture = createRuntimeFixture()
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerSetupRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/setup/test-telegram",
        payload: { botToken: token },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain("Unauthorized")
      expect(JSON.stringify(response.json())).not.toContain(token)
      expect(response.json().message).toContain("***")
    } finally {
      await app.close()
    }
  })

  it("does not echo Slack bot or app tokens from provider error strings", async () => {
    const botToken = "xoxb-task0338-slack-bot-token"
    const appToken = "xapp-task0338-slack-app-token"
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        user: "knowbee-test",
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        error: `socket denied for ${appToken} and ${botToken}`,
      }), { status: 403, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const runtimeFixture = createRuntimeFixture()
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerSetupRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/setup/test-slack",
        payload: { botToken, appToken },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain("socket denied")
      expect(JSON.stringify(response.json())).not.toContain(botToken)
      expect(JSON.stringify(response.json())).not.toContain(appToken)
      expect(response.json().message).toContain("***")
    } finally {
      await app.close()
    }
  })
})
