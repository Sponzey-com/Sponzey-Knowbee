import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { Database } from "better-sqlite3"
import { closeDb } from "../packages/core/src/db/index.js"
import { exportRetrievalEvidenceTimeline, recordControlEvent } from "../packages/core/src/control-plane/timeline.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture
let db: Database

function useTempConfig(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task007-export-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: `{
    ai: { connection: { provider: "ollama", endpoint: "http://127.0.0.1:11434", model: "llama3.2" } },
    webui: { enabled: true, host: "127.0.0.1", port: 18181, auth: { enabled: false } },
    security: { approvalMode: "off" },
    scheduler: { enabled: false, timezone: "Asia/Seoul" }
  }`,
  })
  db = initializeTestDbRuntime(runtimeFixture.paths.stateDir)
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

describe("task007 retrieval evidence sanitized export", () => {
  it("redacts raw HTML, tokens, local paths, and audits the export", () => {
    recordControlEvent({
      eventType: "web_retrieval.attempt.recorded",
      component: "web_retrieval",
      requestGroupId: "group-task007-export",
      correlationId: "retrieval-session-export",
      severity: "warning",
      summary: "fetch returned <html><body>403 forbidden</body></html>",
      detail: {
        method: "direct_fetch",
        sourceUrl: "https://finance.example/ixic",
        localPath: "/Users/dongwooshin/.knowbee/raw/browser.html",
        authorization: "Bearer sk-secret-token-value",
        providerRawResponse: "<!doctype html><html><script>token</script><body>blocked</body></html>",
        resultDiagnosis: {
          status: "followup",
          contextFingerprint: `sha256:${"a".repeat(64)}`,
          evidenceRefs: [`tool-result:tool:${"b".repeat(64)}`],
        },
      },
    })

    const userExport = exportRetrievalEvidenceTimeline({ requestGroupId: "group-task007-export", audience: "user", format: "json" })
    const developerExport = exportRetrievalEvidenceTimeline({ requestGroupId: "group-task007-export", audience: "developer", format: "markdown" })
    const serialized = JSON.stringify(userExport)
    const auditRows = db
      .prepare<[], { tool_name: string }>("SELECT tool_name FROM audit_logs WHERE source = 'control-plane' ORDER BY timestamp ASC")
      .all()
      .map((row) => row.tool_name)

    expect(serialized).not.toContain("/Users/dongwooshin")
    expect(serialized).not.toContain("sk-secret-token-value")
    expect(serialized).not.toContain("<html")
    expect(serialized).toContain("[internal-llm-data-hidden]")
    expect(developerExport.content).toContain("Retrieval Evidence Timeline")
    expect(auditRows).toEqual(expect.arrayContaining(["retrieval_evidence_user_export", "retrieval_evidence_developer_export"]))
  })
})
