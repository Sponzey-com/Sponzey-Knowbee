import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerChannelSmokeRoute } from "../packages/core/src/api/routes/channel-smoke.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createDryRunChannelSmokeExecutor } from "../packages/core/src/channels/smoke-runner.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  type TestRuntimeConfigFixture,
  createTestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: {
  logger: boolean
}) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{
    statusCode: number
    json(): Record<string, unknown>
  }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-channel-smoke-route-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("channel smoke route", () => {
  it("starts a dry-run smoke run, lists it, and exposes sanitized step detail", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerChannelSmokeRoute(app)
    await app.ready()
    try {
      const started = await app.inject({
        method: "POST",
        url: "/api/channel-smoke/runs",
        payload: { mode: "dry-run", channel: "webui" },
      })
      expect(started.statusCode).toBe(200)
      const startedBody = started.json()
      expect(startedBody.ok).toBe(true)
      expect(startedBody.counts.total).toBe(5)
      expect(startedBody.runId).toBeTruthy()

      const list = await app.inject({ method: "GET", url: "/api/channel-smoke/runs?limit=10" })
      expect(list.statusCode).toBe(200)
      expect(list.json().runs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: startedBody.runId, mode: "dry-run", status: "passed" }),
        ]),
      )

      const detail = await app.inject({
        method: "GET",
        url: `/api/channel-smoke/runs/${startedBody.runId}`,
      })
      expect(detail.statusCode).toBe(200)
      const detailBody = detail.json()
      expect(detailBody.steps).toHaveLength(5)
      expect(detailBody.steps[0].trace.requestFlow).toEqual(
        expect.objectContaining({
          requestGroupMatchesRunId: true,
          decisionTracePresent: true,
          topologyRunCreated: true,
          providerDirectUsed: false,
        }),
      )
      expect(JSON.stringify(detailBody)).not.toMatch(/Bearer\s+|xox[abpr]-|\/Users\//u)
    } finally {
      await app.close()
    }
  })

  it("rejects live-run smoke unless explicitly enabled", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerChannelSmokeRoute(app, { liveSmokeEnabled: false })
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/channel-smoke/runs",
        payload: { mode: "live-run", channel: "webui" },
      })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual(
        expect.objectContaining({
          error: "live channel smoke requires KNOWBEE_CHANNEL_SMOKE_LIVE=1",
        }),
      )
    } finally {
      await app.close()
    }
  })

  it("runs an enabled live smoke through the injected executor port", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerChannelSmokeRoute(app, {
      liveSmokeEnabled: true,
      liveExecutor: createDryRunChannelSmokeExecutor(),
    })
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/channel-smoke/runs",
        payload: { mode: "live-run", channel: "webui" },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        ok: true,
        mode: "live-run",
        status: "passed",
        counts: { total: 5, passed: 5, failed: 0 },
      })
    } finally {
      await app.close()
    }
  })

  it("rejects enabled live smoke before persistence when no executor is available", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerChannelSmokeRoute(app, { liveSmokeEnabled: true })
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/channel-smoke/runs",
        payload: { mode: "live-run", channel: "webui" },
      })
      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({ error: "live_channel_smoke_executor_unavailable" })
      const runs = await app.inject({ method: "GET", url: "/api/channel-smoke/runs" })
      expect(runs.json().runs).toEqual([])
    } finally {
      await app.close()
    }
  })

  it("persists and returns only redacted executor failures", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerChannelSmokeRoute(app, {
      liveSmokeEnabled: true,
      liveExecutor: async () => {
        throw new Error("Bearer secret-token at /Users/private/channel")
      },
    })
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/channel-smoke/runs",
        payload: { mode: "live-run", channel: "webui" },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ ok: false, status: "failed" })
      expect(JSON.stringify(response.json())).not.toMatch(/secret-token|\/Users\/private/)
    } finally {
      await app.close()
    }
  })

  it("rejects unknown scenario ids without creating an ambiguous run", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerChannelSmokeRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/channel-smoke/runs",
        payload: { mode: "dry-run", scenarioIds: ["missing.scenario"] },
      })
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toContain("unknown smoke scenario")
    } finally {
      await app.close()
    }
  })

  it("reuses an active run for the same idempotency key instead of dispatching duplicate scenarios", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    let releaseFirstScenario: (() => void) | undefined
    let executionCount = 0
    const firstScenarioStarted = new Promise<void>((resolve) => {
      releaseFirstScenario = resolve
    })
    let notifyFirstScenarioStarted: (() => void) | undefined
    const firstScenarioObserved = new Promise<void>((resolve) => {
      notifyFirstScenarioStarted = resolve
    })
    const dryRunExecutor = createDryRunChannelSmokeExecutor()
    registerChannelSmokeRoute(app, {
      liveSmokeEnabled: true,
      liveExecutor: async (scenario) => {
        executionCount += 1
        if (executionCount === 1) {
          notifyFirstScenarioStarted?.()
          await firstScenarioStarted
        }
        return dryRunExecutor(scenario)
      },
    })
    await app.ready()
    try {
      const first = app.inject({
        method: "POST",
        url: "/api/channel-smoke/runs",
        payload: {
          mode: "live-run",
          channel: "webui",
          idempotencyKey: "acceptance:webui:stable-key",
        },
      })
      await firstScenarioObserved

      const duplicate = await app.inject({
        method: "POST",
        url: "/api/channel-smoke/runs",
        payload: {
          mode: "live-run",
          channel: "webui",
          idempotencyKey: "acceptance:webui:stable-key",
        },
      })
      expect(duplicate.statusCode).toBe(200)
      expect(duplicate.json()).toMatchObject({
        ok: true,
        reused: true,
        mode: "live-run",
        status: "running",
      })
      expect(duplicate.json().runId).toEqual(expect.any(String))

      releaseFirstScenario?.()
      const completed = await first
      expect(completed.statusCode).toBe(200)
      expect(executionCount).toBe(5)
      expect(completed.json().runId).toBe(duplicate.json().runId)
      const listed = await app.inject({
        method: "GET",
        url: "/api/channel-smoke/runs?limit=10",
      })
      expect(JSON.stringify(listed.json())).not.toMatch(
        /acceptance:webui:stable-key|idempotencyHash|requestFingerprint/u,
      )
    } finally {
      releaseFirstScenario?.()
      await app.close()
    }
  })
})
