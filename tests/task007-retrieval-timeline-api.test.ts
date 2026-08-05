import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerRunsRoute } from "../packages/core/src/api/routes/runs.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { recordControlEvent } from "../packages/core/src/control-plane/timeline.js"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; json(): any }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempConfig(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task007-retrieval-api-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir, configText: `{
    ai: { connection: { provider: "ollama", endpoint: "http://127.0.0.1:11434", model: "llama3.2" } },
    webui: { enabled: true, host: "127.0.0.1", port: 18181, auth: { enabled: false } },
    security: { approvalMode: "off" },
    memory: { searchMode: "fts", sessionRetentionDays: 30 },
    scheduler: { enabled: false, timezone: "Asia/Seoul" }
  }` })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function createRun() {
  insertSession({
    id: "session-task007",
    source: "telegram",
    source_id: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    summary: null,
  })
  return createRootRun({
    id: "run-task007-retrieval",
    sessionId: "session-task007",
    requestGroupId: "group-task007-retrieval",
    prompt: "나스닥 지수 알려줘",
    source: "telegram",
  })
}

beforeEach(() => {
  useTempConfig()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task007 retrieval timeline API", () => {
  it("returns sanitized provenance, LLM diagnosis, and delivery events", async () => {
    const run = createRun()
    recordControlEvent({ eventType: "web_retrieval.session.created", component: "web_retrieval", runId: run.id, requestGroupId: run.requestGroupId, summary: "session created" })
    recordControlEvent({ eventType: "tool.dispatched", component: "tool", runId: run.id, requestGroupId: run.requestGroupId, summary: "web_search dispatched", detail: { toolName: "web_search", paramsHash: "nasdaq" } })
    recordControlEvent({ eventType: "web_retrieval.attempt.recorded", component: "web_retrieval", runId: run.id, requestGroupId: run.requestGroupId, summary: "fast_text_search attempt succeeded", detail: { method: "fast_text_search", sourceDomain: "finance.example" } })
    recordControlEvent({ eventType: "web_retrieval.source.checked", component: "web_retrieval", runId: run.id, requestGroupId: run.requestGroupId, summary: "source checked", detail: { sourceEvidenceId: "source-1", sourceEvidence: { sourceUrl: "https://finance.example/ixic", sourceDomain: "finance.example" }, rawBody: "Bearer sk-secret-token-value" } })
    recordControlEvent({ eventType: "web_retrieval.result_diagnosis.completed", component: "web_retrieval", runId: run.id, requestGroupId: run.requestGroupId, summary: "LLM result diagnosis completed", detail: { resultDiagnosis: { status: "complete", contextFingerprint: `sha256:${"a".repeat(64)}` } } })
    recordControlEvent({ eventType: "delivery.completed", component: "channel:telegram", runId: run.id, requestGroupId: run.requestGroupId, summary: "answer delivered", detail: { deliveryKey: "telegram:answer:1" } })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerRunsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: `/api/runs/${run.id}/retrieval-timeline?limit=50` })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.timeline.summary).toEqual(expect.objectContaining({ attempts: 2, diagnoses: 1, deliveryEvents: 1, finalDeliveryStatus: "completed" }))
      expect(body.timeline.events.map((event: { kind: string }) => event.kind)).toEqual(expect.arrayContaining(["session", "attempt", "source", "diagnosis", "delivery"]))
      expect(JSON.stringify(body)).not.toMatch(/canAnswer|acceptedValue|evidenceSufficiency/u)
      expect(JSON.stringify(body)).not.toContain("sk-secret-token-value")
      expect(JSON.stringify(body)).not.toContain("Bearer sk")
    } finally {
      await app.close()
    }
  })
})
