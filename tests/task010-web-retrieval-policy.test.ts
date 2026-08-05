import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createArtifactStorageContext } from "../packages/core/src/artifacts/lifecycle.ts"
import {
  closeDb,
  getDb,
  insertSession,
  listControlEvents,
  listMessageLedgerEvents,
} from "../packages/core/src/db/index.js"
import { createRootRun } from "../packages/core/src/runs/store.js"
import {
  buildWebRetrievalPolicyDecision,
  recordBrowserSearchEvidence,
} from "../packages/core/src/runs/web-retrieval-policy.js"
import { createWebFetchTool } from "../packages/core/src/tools/builtin/web-fetch.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.js"
import type { ToolContext } from "../packages/core/src/tools/types.js"
import {
  type TestRuntimeConfigFixture,
  createTestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const originalFetch = globalThis.fetch
const publicResolver = async () => ["93.184.216.34"]
const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempConfig(prefix = "knowbee-task010-web-"): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: `{
    ai: { connection: { provider: "ollama", endpoint: "http://127.0.0.1:11434", model: "llama3.2" } },
    webui: { enabled: true, host: "127.0.0.1", port: 18181, auth: { enabled: false } },
    security: { approvalMode: "off" },
    memory: { searchMode: "fts", sessionRetentionDays: 30 },
    scheduler: { enabled: false, timezone: "Asia/Seoul" }
  }`,
  })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function createTestRun(id = "run-web-policy-1") {
  insertSession({
    id: "session-web-policy",
    source: "telegram",
    source_id: "chat-1",
    created_at: Date.now(),
    updated_at: Date.now(),
    summary: null,
  })
  return createRootRun({
    id,
    sessionId: "session-web-policy",
    requestGroupId: "request-web-policy",
    prompt: "지금 동천동 날씨 어때?",
    source: "telegram",
  })
}

function buildToolContext(
  run: ReturnType<typeof createTestRun>,
  userMessage = "지금 동천동 날씨 어때?",
): ToolContext {
  return {
    sessionId: run.sessionId,
    runId: run.id,
    requestGroupId: run.requestGroupId,
    workDir: process.cwd(),
    userMessage,
    source: "telegram",
    allowWebAccess: true,
    onProgress: () => undefined,
    signal: new AbortController().signal,
  }
}

beforeEach(() => {
  useTempConfig()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task010 web retrieval policy", () => {
  it("dedupes equivalent web_fetch URLs and records skipped ledger/control events", async () => {
    const run = createTestRun("run-web-dedupe")
    const dispatcher = new ToolDispatcher({ config: runtimeFixture.config })
    let executionCount = 0
    dispatcher.register({
      name: "web_fetch",
      description: "test fetch",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute() {
        executionCount += 1
        return { success: true, output: `fetch-${executionCount}` }
      },
    })
    const ctx = buildToolContext(run)
    const first = await dispatcher.dispatch(
      "web_fetch",
      { url: "https://example.com/weather?b=2&utm_source=x&a=1#top" },
      ctx,
    )
    const duplicate = await dispatcher.dispatch(
      "web_fetch",
      { url: "https://EXAMPLE.com/weather?a=1&b=2&utm_medium=y" },
      ctx,
    )
    const ledgerEvents = listMessageLedgerEvents({ requestGroupId: run.requestGroupId })
    const controlEvents = listControlEvents({ requestGroupId: run.requestGroupId })

    expect(first.output).toBe("fetch-1")
    expect(duplicate.success).toBe(true)
    expect(duplicate.output).toContain("중복 호출을 생략")
    expect(duplicate.output).toContain("dedupeKey=web:fetch:")
    expect(executionCount).toBe(1)
    expect(
      ledgerEvents.some(
        (event) => event.event_kind === "tool_skipped" && event.status === "skipped",
      ),
    ).toBe(true)
    expect(controlEvents.some((event) => event.event_type === "tool.skipped")).toBe(true)
  })

  it("normalizes web_search transport metadata without a semantic answer directive", () => {
    const policy = buildWebRetrievalPolicyDecision({
      toolName: "web_search",
      params: { query: "오늘 코스피 지수 얼마야?", maxResults: 5 },
      userMessage: "오늘 코스피 지수 얼마야?",
      now: new Date("2026-04-17T05:34:32.000Z"),
    })
    expect(policy?.freshnessPolicy).toBe("latest_approximate")
    expect(policy).not.toHaveProperty("answerDirective")
  })

  it("stores browser search evidence as an artifact and diagnostic event without raw stack text", () => {
    const source = readFileSync("packages/core/src/runs/web-retrieval-policy.ts", "utf-8")
    const secret = "sk-task0646-secret-1234567890"
    const localPath = "/Users/example/private/file.js"
    const result = recordBrowserSearchEvidence({
      artifactStorage: createArtifactStorageContext(runtimeFixture.paths),
      query: "동천동 날씨",
      url: "https://lite.duckduckgo.com/lite/?q=%EB%8F%99%EC%B2%9C%EB%8F%99%20%EB%82%A0%EC%94%A8",
      extractedText: "partial html text",
      timeoutReason: "timeout",
      error: new Error(`Selenium timeout token=${secret}\n    at secretStack (${localPath}:1:1)`),
      runId: "run-browser-evidence",
      requestGroupId: "request-browser-evidence",
    })

    const payload = readFileSync(result.artifactPath, "utf-8")
    const diagnostic = getDb()
      .prepare<[], { kind: string; summary: string }>(
        "SELECT kind, summary FROM diagnostic_events ORDER BY created_at DESC LIMIT 1",
      )
      .get()

    expect(existsSync(result.artifactPath)).toBe(true)
    expect(result.artifactId).toEqual(expect.any(String))
    expect(result.diagnosticEventId).toEqual(expect.any(String))
    expect(source).toContain(
      "function browserSearchEvidenceErrorMessage(error: unknown): string | null",
    )
    expect(source).toContain("const safeError = browserSearchEvidenceErrorMessage(input.error)")
    expect(source).not.toContain(
      "sanitizeUserFacingError(input.error instanceof Error ? input.error.message : String(input.error)).userMessage",
    )
    expect(payload).toContain("browser_search_evidence")
    expect(payload).not.toContain("secretStack")
    expect(payload).not.toContain(secret)
    expect(payload).not.toContain(localPath)
    expect(diagnostic?.kind).toBe("browser_search_evidence")
  })

  it("adds source timestamps to web_fetch provenance without a semantic guard", async () => {
    const run = createTestRun("run-web-fetch-ready")
    const html = `<!doctype html><html><head><meta property="article:published_time" content="2026-04-17T09:30:00+09:00"></head><body><article><h1>동천동 날씨</h1><p>현재 20도입니다.</p></article></body></html>`
    globalThis.fetch = vi.fn(
      async () => new Response(html, {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "text/html" },
      }),
    ) as unknown as typeof fetch

    const result = await createWebFetchTool({ resolver: publicResolver }).execute(
      { url: "https://weather.example/current" },
      buildToolContext(run),
    )
    const details = result.details as {
      sourceEvidence: { sourceTimestamp: string | null }
    }

    expect(result.success).toBe(true)
    expect(result.output).toContain("- Source timestamp: 2026-04-17T09:30:00+09:00")
    expect(details).not.toHaveProperty("sourceGuard")
    expect(details.sourceEvidence.sourceTimestamp).toBe("2026-04-17T09:30:00+09:00")
  })

  it("returns missing source timestamp as provenance for LLM diagnosis", async () => {
    const run = createTestRun("run-web-fetch-limited")
    const html =
      "<!doctype html><html><body><main><h1>Current page</h1><p>Current data page.</p></main></body></html>"
    globalThis.fetch = vi.fn(
      async () => new Response(html, {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "text/html" },
      }),
    ) as unknown as typeof fetch

    const result = await createWebFetchTool({ resolver: publicResolver }).execute(
      { url: "https://example.com/current", freshnessPolicy: "strict_timestamp" },
      buildToolContext(run, "현재 값을 확인해줘"),
    )
    const details = result.details as { sourceEvidence: { sourceTimestamp: string | null } }

    expect(result.success).toBe(true)
    expect(result.output).toContain("- Source timestamp: unknown")
    expect(result.output).toContain("- Freshness: unknown")
    expect(result.output).not.toContain("[확정성:")
    expect(details.sourceEvidence.sourceTimestamp).toBeNull()
    expect(details).not.toHaveProperty("sourceGuard")
  })
})
