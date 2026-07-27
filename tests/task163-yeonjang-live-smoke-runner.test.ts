import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, insertAuditLog, listAuditLogsForRun } from "../packages/core/src/db/index.js"
import { produceYeonjangLiveAcceptanceEvidence } from "../packages/core/src/release/yeonjang-live-acceptance-evidence.ts"
import {
  YeonjangLiveSmokeRunnerError,
  type YeonjangLiveSmokeSelection,
  runYeonjangLiveSmokeScenario,
} from "../packages/core/src/runs/yeonjang-live-smoke-runner.ts"
import { createYeonjangLiveTransportAdapter } from "../packages/core/src/runs/yeonjang-live-transport-adapter.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const NOW = Date.parse("2026-07-17T16:00:00.000Z")
const RUN_ID = "yeonjang-run:163"
const EVIDENCE_REF = `tool-result:yeonjang:${"b".repeat(64)}`
const tempDirs: string[] = []

function selection(
  overrides: Partial<YeonjangLiveSmokeSelection> = {},
): YeonjangLiveSmokeSelection {
  return {
    scenario: {
      id: "office-mac-system-info",
      expectedInstanceId: "instance:office-mac",
      expectedSessionId: "session:office-mac:7",
      expectedMethod: "system.info",
      readOnly: true,
    },
    instance: {
      instanceId: "instance:office-mac",
      publicName: "Office Mac",
      sessionId: "session:office-mac:7",
      status: "connected",
      observedAt: NOW - 500,
      duplicateActiveIdentityCount: 0,
      trustState: "trusted",
      runnableTarget: true,
    },
    ...overrides,
  }
}

function observed() {
  return {
    command: {
      runId: RUN_ID,
      requestGroupId: RUN_ID,
      commandId: "command:163",
      instanceId: "instance:office-mac",
      sessionId: "session:office-mac:7",
      method: "system.info",
      readOnly: true,
      deliveryStatus: "acked" as const,
    },
    observedResult: {
      runId: RUN_ID,
      commandId: "command:163",
      instanceId: "instance:office-mac",
      sessionId: "session:office-mac:7",
      status: "observed" as const,
      evidenceRef: EVIDENCE_REF,
    },
    auditEventId: "audit:yeonjang:163",
    diagnosisPayload: Object.freeze({ status: "ready", hostname: "private-host" }),
  }
}

function diagnosis(evidenceRef = EVIDENCE_REF) {
  return {
    diagnosedBy: "llm" as const,
    status: "complete" as const,
    contextFingerprint: `sha256:${"a".repeat(64)}` as const,
    criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
    evidenceRefs: [evidenceRef],
  }
}

describe("Task 163 Yeonjang live smoke runner", () => {
  it("keeps environment, storage, registry and transport behind injected ports", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/runs/yeonjang-live-smoke-runner.ts"),
      "utf8",
    )

    expect(source).not.toContain("process.env")
    expect(source).not.toMatch(/from ["'][^"']*(?:db|mqtt|registry)[^"']*["']/u)
    expect(source).not.toContain("invokeYeonjangMethod")
  })

  it("verifies an exact remote system.info result only after LLM diagnosis", async () => {
    const execute = vi.fn(async () => observed())
    const diagnose = vi.fn(async ({ evidenceRef }: { evidenceRef: string }) =>
      diagnosis(evidenceRef),
    )

    const result = await runYeonjangLiveSmokeScenario({
      runId: RUN_ID,
      selection: selection(),
      execute,
      diagnose,
      maxInstanceAgeMs: 5_000,
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("passed")
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toEqual(
      expect.objectContaining({ state: "verified", status: "passed" }),
    )
    expect(
      produceYeonjangLiveAcceptanceEvidence({
        run: result,
        now: NOW,
        maxSessionAgeMs: 5_000,
      }).accepted,
    ).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain("private-host")
  })

  it.each([
    [
      "local status alias",
      { scenario: { ...selection().scenario, expectedMethod: "yeonjang_status" } },
    ],
    ["offline instance", { instance: { ...selection().instance, status: "disconnected" } }],
    [
      "duplicate session",
      { instance: { ...selection().instance, duplicateActiveIdentityCount: 1 } },
    ],
    ["untrusted instance", { instance: { ...selection().instance, trustState: "pending" } }],
    ["non-runnable instance", { instance: { ...selection().instance, runnableTarget: false } }],
    ["wrong session", { instance: { ...selection().instance, sessionId: "session:other" } }],
    ["stale instance", { instance: { ...selection().instance, observedAt: NOW - 6_000 } }],
  ])("rejects %s before transport dispatch", async (_label, overrides) => {
    const execute = vi.fn()
    const result = await runYeonjangLiveSmokeScenario({
      runId: RUN_ID,
      selection: selection(overrides as Partial<YeonjangLiveSmokeSelection>),
      execute,
      diagnose: vi.fn(),
      maxInstanceAgeMs: 5_000,
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("failed")
    expect(result.results[0]?.state).toBe("rejected")
    expect(execute).not.toHaveBeenCalled()
  })

  it("rejects ACK-only execution and a non-LLM diagnosis", async () => {
    const ackOnly = await runYeonjangLiveSmokeScenario({
      runId: RUN_ID,
      selection: selection(),
      execute: async () => ({ ...observed(), observedResult: null }),
      diagnose: async () => diagnosis(),
      maxInstanceAgeMs: 5_000,
      now: () => NOW,
      signal: new AbortController().signal,
    })
    const nonLlm = await runYeonjangLiveSmokeScenario({
      runId: RUN_ID,
      selection: selection(),
      execute: async () => observed(),
      diagnose: async () => ({ ...diagnosis(), diagnosedBy: "rule" }),
      maxInstanceAgeMs: 5_000,
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(ackOnly.results[0]?.reasonCode).toBe("yeonjang_smoke_observed_result_missing")
    expect(nonLlm.results[0]?.reasonCode).toBe("yeonjang_smoke_llm_diagnosis_invalid")
  })

  it("does not dispatch after cancellation", async () => {
    const controller = new AbortController()
    controller.abort()
    const execute = vi.fn()

    await expect(
      runYeonjangLiveSmokeScenario({
        runId: RUN_ID,
        selection: selection(),
        execute,
        diagnose: vi.fn(),
        maxInstanceAgeMs: 5_000,
        now: () => NOW,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(YeonjangLiveSmokeRunnerError)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe("Task 163 Yeonjang transport and SQLite audit integration", () => {
  let stateDir: string

  beforeEach(() => {
    closeDb()
    stateDir = mkdtempSync(join(tmpdir(), "knowbee-task163-yeonjang-"))
    tempDirs.push(stateDir)
    initializeTestDbRuntime(stateDir)
  })

  afterEach(() => {
    closeDb()
    while (tempDirs.length > 0) {
      const path = tempDirs.pop()
      if (path) rmSync(path, { recursive: true, force: true })
    }
  })

  it("sends exact target metadata, observes a response and persists bounded audit", async () => {
    const invoke = vi.fn(async () => ({ status: "ready", hostname: "private-host" }))
    const adapter = createYeonjangLiveTransportAdapter({
      invoke,
      timeoutMs: 5_000,
      createCommandId: () => "command:163",
      createAuditCorrelationId: () => "audit-correlation:163",
      recordAuditEvent(event) {
        insertAuditLog({
          timestamp: NOW,
          session_id: event.sessionId,
          run_id: event.runId,
          request_group_id: event.requestGroupId,
          channel: "system",
          source: "agent",
          tool_name: event.method,
          params: JSON.stringify({ instanceId: event.instanceId, commandId: event.commandId }),
          output: JSON.stringify({ evidenceRef: event.evidenceRef, observed: true }),
          result: "success",
          duration_ms: 1,
          approval_required: 0,
          approved_by: null,
        })
        return (
          listAuditLogsForRun(event.runId).findLast((row) => row.tool_name === event.method)?.id ??
          null
        )
      },
    })

    const result = await runYeonjangLiveSmokeScenario({
      runId: RUN_ID,
      selection: selection(),
      execute: adapter,
      diagnose: async ({ evidenceRef }) => diagnosis(evidenceRef),
      maxInstanceAgeMs: 5_000,
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("passed")
    expect(invoke).toHaveBeenCalledWith(
      "system.info",
      {},
      expect.objectContaining({
        extensionId: "instance:office-mac",
        timeoutMs: 5_000,
        metadata: expect.objectContaining({
          runId: RUN_ID,
          requestGroupId: RUN_ID,
          targetSessionId: "session:office-mac:7",
          commandId: "command:163",
          auditId: "audit-correlation:163",
        }),
      }),
    )
    expect(listAuditLogsForRun(RUN_ID)).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain("private-host")
  })
})
