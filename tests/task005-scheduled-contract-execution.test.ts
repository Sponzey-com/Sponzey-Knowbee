import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { registerSchedulesRoute } from "../packages/core/src/api/routes/schedules.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { recordArtifactMetadata } from "../packages/core/src/artifacts/lifecycle.ts"
import {
  CONTRACT_SCHEMA_VERSION,
  buildDeliveryKey,
  buildPayloadHash,
  buildScheduleIdentityKey,
  toCanonicalJson,
  type ScheduleContract,
} from "../packages/core/src/contracts/index.ts"
import {
  closeDb,
  getSchedule,
  getScheduleDeliveryReceipt,
  getScheduleRuns,
  insertSchedule,
  insertScheduleRun,
  isLegacySchedule,
} from "../packages/core/src/db/index.js"
import { findScheduleCandidatesByContract } from "../packages/core/src/schedules/candidates.ts"
import {
  buildScheduledAgentExecutionBrief,
  executeScheduleContract,
} from "../packages/core/src/scheduler/contract-executor.ts"
import { runScheduleAndWait } from "../packages/core/src/scheduler/index.ts"
import { createMemoryJournalRepository } from "../packages/core/src/memory/journal.ts"
import { createAgentHierarchyStorage } from "../packages/core/src/orchestration/hierarchy.ts"
import { createTestArtifactStorage } from "./fixtures/artifact-storage.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture
let runtimeDb: ReturnType<typeof initializeTestDbRuntime>
const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; json(): any }>
}

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task005-schedule-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  runtimeDb = initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function scheduleContract(overrides: Partial<ScheduleContract> = {}): ScheduleContract {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    kind: "recurring",
    time: {
      cron: "0 9 * * *",
      timezone: "Asia/Seoul",
      missedPolicy: "next_only",
    },
    payload: {
      kind: "literal_message",
      literalText: "알림",
    },
    delivery: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      mode: "channel_message",
      channel: "agent",
      sessionId: null,
    },
    source: {
      originRunId: "run-task005",
      originRequestGroupId: "group-task005",
    },
    displayName: "TASK005 알림",
    rawText: "매일 오전 9시에 알림이라고 보내줘",
    ...overrides,
  }
}

function insertContractSchedule(id: string, contract: ScheduleContract): void {
  const now = Date.parse("2026-04-15T00:00:00.000Z")
  runtimeDb.prepare(
    `INSERT INTO schedules
     (id, name, cron_expression, timezone, prompt, enabled, target_channel, target_session_id, execution_driver,
      origin_run_id, origin_request_group_id, model, max_retries, timeout_sec,
      contract_json, identity_key, payload_hash, delivery_key, contract_schema_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    `TASK005 ${id}`,
    contract.time.cron ?? "0 9 * * *",
    contract.time.timezone,
    "RAW_PROMPT_SHOULD_NOT_REENTER_AGENT",
    1,
    contract.delivery.channel === "telegram" || contract.delivery.channel === "slack" ? contract.delivery.channel : "agent",
    contract.delivery.sessionId ?? null,
    "internal",
    "run-task005",
    "group-task005",
    null,
    0,
    300,
    toCanonicalJson(contract),
    buildScheduleIdentityKey(contract),
    buildPayloadHash(contract.payload),
    buildDeliveryKey(contract.delivery),
    contract.schemaVersion,
    now,
    now,
  )
}

function insertRun(id: string, scheduleId: string): void {
  insertScheduleRun({
    id,
    schedule_id: scheduleId,
    started_at: Date.parse("2026-04-15T00:00:05.000Z"),
    finished_at: null,
    success: null,
    summary: null,
    error: null,
  })
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

describe("task005 scheduled contract execution", () => {
  it("creates new schedules through the API as validated contract schedules, not legacy rows", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    const routeMemoryJournal = createMemoryJournalRepository({
      memoryDbFile: join(runtimeFixture.paths.stateDir, "memory-route.db3"),
    })
    registerSchedulesRoute(app, routeMemoryJournal)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/schedules",
        payload: {
          name: "TASK005 API Contract",
          cron: "0 9 * * *",
          timezone: "Asia/Seoul",
          prompt: "매일 오전 9시에 오늘 할 일을 정리해줘",
        },
      })
      expect(response.statusCode).toBe(201)
      const body = response.json()
      const row = getSchedule(body.id)
      expect(row).toBeDefined()
      expect(row && isLegacySchedule(row)).toBe(false)
      expect(row?.contract_json).toContain("agent_task")
      expect(row?.identity_key).toMatch(/^schedule:v1:/)
      expect(row?.payload_hash).toMatch(/^payload:v1:/)
      expect(row?.delivery_key).toMatch(/^delivery:v1:/)
      expect(row?.contract_schema_version).toBe(CONTRACT_SCHEMA_VERSION)
    } finally {
      await app.close()
      routeMemoryJournal.close()
    }
  })

  it("excludes legacy schedules from automatic semantic duplicate candidates", () => {
    const now = Date.parse("2026-04-15T00:00:00.000Z")
    insertSchedule({
      id: "schedule-task005-legacy-candidate",
      name: "TASK005 legacy candidate",
      cron_expression: "0 9 * * *",
      timezone: "Asia/Seoul",
      prompt: "매일 오전 9시에 알림이라고 보내줘",
      enabled: 1,
      target_channel: "telegram",
      target_session_id: "telegram-session-task005",
      execution_driver: "internal",
      origin_run_id: "run-task005",
      origin_request_group_id: "group-task005",
      model: null,
      max_retries: 3,
      timeout_sec: 300,
      created_at: now,
      updated_at: now,
    })
    const legacy = getSchedule("schedule-task005-legacy-candidate")
    expect(legacy && isLegacySchedule(legacy)).toBe(true)

    const candidates = findScheduleCandidatesByContract({ contract: scheduleContract() })

    expect(candidates.map((candidate) => candidate.schedule.id)).not.toContain("schedule-task005-legacy-candidate")
  })

  it("executes literal messages without calling the AI provider and records a delivery receipt", async () => {
    const contract = scheduleContract({
      delivery: {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        mode: "channel_message",
        channel: "telegram",
        sessionId: "telegram-session-task005",
      },
    })
    insertContractSchedule("schedule-task005-literal", contract)
    insertRun("run-task005-literal", "schedule-task005-literal")
    const schedule = getSchedule("schedule-task005-literal")
    expect(schedule).toBeDefined()

    const startIngressRunImpl = vi.fn()
    const deliverTelegramText = vi.fn(async () => undefined)
    const result = await executeScheduleContract({
      config: runtimeFixture.config,
      schedule: schedule!,
      scheduleRunId: "run-task005-literal",
      trigger: "scheduler tick (due: 2026-04-15T00:00:00.000Z)",
      startedAt: Date.parse("2026-04-15T00:00:05.000Z"),
      dependencies: { startIngressRunImpl, deliverTelegramText },
    })

    expect(result.handled).toBe(true)
    expect(result.handled && result.result).toMatchObject({
      success: true,
      summary: "알림",
      executionSuccess: true,
      deliverySuccess: true,
    })
    expect(startIngressRunImpl).not.toHaveBeenCalled()
    expect(deliverTelegramText).toHaveBeenCalledOnce()
    expect(deliverTelegramText).toHaveBeenCalledWith("telegram-session-task005", "알림")

    const dedupeKey = result.handled ? result.result.deliveryDedupeKey : null
    expect(dedupeKey).toBeTruthy()
    expect(getScheduleDeliveryReceipt(dedupeKey!)).toMatchObject({
      schedule_id: "schedule-task005-literal",
      schedule_run_id: "run-task005-literal",
      due_at: "2026-04-15T00:00:00.000Z",
      delivery_status: "delivered",
    })
  })

  it("skips the same dueAt delivery when a delivered receipt already exists", async () => {
    const contract = scheduleContract({
      delivery: {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        mode: "channel_message",
        channel: "telegram",
        sessionId: "telegram-session-task005",
      },
    })
    insertContractSchedule("schedule-task005-dedupe", contract)
    insertRun("run-task005-first", "schedule-task005-dedupe")
    insertRun("run-task005-second", "schedule-task005-dedupe")
    const schedule = getSchedule("schedule-task005-dedupe")!
    const deliverTelegramText = vi.fn(async () => undefined)

    const first = await executeScheduleContract({
      config: runtimeFixture.config,
      schedule,
      scheduleRunId: "run-task005-first",
      trigger: "scheduler tick (due: 2026-04-15T00:00:00.000Z)",
      startedAt: Date.parse("2026-04-15T00:00:05.000Z"),
      dependencies: { deliverTelegramText },
    })
    expect(first.handled && first.result.success).toBe(true)

    const second = await executeScheduleContract({
      config: runtimeFixture.config,
      schedule,
      scheduleRunId: "run-task005-second",
      trigger: "scheduler tick (due: 2026-04-15T00:00:00.000Z)",
      startedAt: Date.parse("2026-04-15T00:00:10.000Z"),
      dependencies: { deliverTelegramText },
    })

    expect(deliverTelegramText).toHaveBeenCalledTimes(1)
    expect(second.handled && second.result).toMatchObject({
      success: true,
      deliverySuccess: true,
    })
    expect(second.handled && second.result.summary).toContain("중복")
  })

  it("routes explicit tool contracts through canonical ingress without direct dispatch", async () => {
    const contract = scheduleContract({
      payload: {
        kind: "tool_task",
        toolName: "web_search",
        toolParams: { query: "current semiconductor market status" },
      },
    })
    insertContractSchedule("schedule-task005-tool", contract)
    insertRun("run-task005-tool", "schedule-task005-tool")
    const schedule = getSchedule("schedule-task005-tool")!
    const startIngressRunImpl = vi.fn((params) => {
      params.onChunk?.({ type: "text" as const, delta: "검증된 도구 실행 결과", textSource: "llm_reviewed" })
      params.onChunk?.({ type: "done" as const, totalTokens: 0 })
      return {
        started: {
          runId: params.runId,
          sessionId: params.sessionId,
          status: "started" as const,
          finished: Promise.resolve({ status: "completed", summary: "검증된 도구 실행 결과" }),
        },
      }
    })

    const result = await executeScheduleContract({
      config: runtimeFixture.config,
      schedule,
      scheduleRunId: "run-task005-tool",
      trigger: "scheduler tick (due: 2026-04-15T00:00:00.000Z)",
      startedAt: Date.parse("2026-04-15T00:00:05.000Z"),
      artifactStorage: createTestArtifactStorage(runtimeFixture.paths.stateDir),
      memoryJournal: {} as never,
      hierarchyStorage: createAgentHierarchyStorage(runtimeFixture.paths),
      dependencies: { startIngressRunImpl: startIngressRunImpl as never },
    })

    expect(result.handled && result.result).toMatchObject({
      success: true,
      summary: "검증된 도구 실행 결과",
      executionSuccess: true,
      deliverySuccess: true,
    })
    expect(startIngressRunImpl).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-task005-tool",
      requestGroupId: "run-task005-tool",
      source: "scheduler",
    }))
    const canonicalRequest = startIngressRunImpl.mock.calls[0]?.[0]?.message ?? ""
    expect(canonicalRequest).toContain('"toolName":"web_search"')
    expect(canonicalRequest).toContain('"query":"current semiconductor market status"')
    expect(canonicalRequest).not.toContain("RAW_PROMPT_SHOULD_NOT_REENTER_AGENT")
  })

  it("does not deliver tool contract output while canonical execution awaits approval", async () => {
    const contract = scheduleContract({
      payload: {
        kind: "tool_task",
        toolName: "screen_capture",
        toolParams: { display: 1 },
      },
      delivery: {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        mode: "channel_message",
        channel: "telegram",
        sessionId: "telegram-session-task005",
      },
    })
    insertContractSchedule("schedule-task005-tool-approval", contract)
    insertRun("run-task005-tool-approval", "schedule-task005-tool-approval")
    const schedule = getSchedule("schedule-task005-tool-approval")!
    const deliverTelegramText = vi.fn(async () => undefined)
    const startIngressRunImpl = vi.fn((params) => ({
      started: {
        runId: params.runId,
        sessionId: params.sessionId,
        status: "started" as const,
        finished: Promise.resolve({ status: "awaiting_approval", summary: "승인이 필요합니다." }),
      },
    }))

    const result = await executeScheduleContract({
      config: runtimeFixture.config,
      schedule,
      scheduleRunId: "run-task005-tool-approval",
      trigger: "manual",
      startedAt: Date.parse("2026-04-15T00:00:05.000Z"),
      artifactStorage: createTestArtifactStorage(runtimeFixture.paths.stateDir),
      memoryJournal: {} as never,
      hierarchyStorage: createAgentHierarchyStorage(runtimeFixture.paths),
      dependencies: {
        startIngressRunImpl: startIngressRunImpl as never,
        deliverTelegramText,
      },
    })

    expect(result.handled && result.result).toMatchObject({
      success: false,
      executionSuccess: false,
      deliverySuccess: null,
      retryable: false,
    })
    expect(result.handled && result.result.error).toContain("승인이 필요")
    expect(deliverTelegramText).not.toHaveBeenCalled()
  })

  it("rejects a structurally incomplete tool contract before canonical execution", async () => {
    const contract = scheduleContract({ payload: { kind: "tool_task", toolName: null } })
    insertContractSchedule("schedule-task005-tool-missing", contract)
    insertRun("run-task005-tool-missing", "schedule-task005-tool-missing")
    const startIngressRunImpl = vi.fn()

    const result = await executeScheduleContract({
      config: runtimeFixture.config,
      schedule: getSchedule("schedule-task005-tool-missing")!,
      scheduleRunId: "run-task005-tool-missing",
      trigger: "manual",
      startedAt: Date.parse("2026-04-15T00:00:05.000Z"),
      artifactStorage: createTestArtifactStorage(runtimeFixture.paths.stateDir),
      memoryJournal: {} as never,
      hierarchyStorage: createAgentHierarchyStorage(runtimeFixture.paths),
      dependencies: { startIngressRunImpl: startIngressRunImpl as never },
    })

    expect(result.handled && result.result).toMatchObject({
      success: false,
      error: "scheduled tool task is missing toolName",
      retryable: false,
    })
    expect(startIngressRunImpl).not.toHaveBeenCalled()
  })

  it("delivers artifact contracts through the Telegram delivery port without tool dispatch", async () => {
    const artifactStorage = createTestArtifactStorage(runtimeFixture.paths.stateDir)
    const artifactPath = join(artifactStorage.rootDir, "task005-report.txt")
    const artifactId = recordArtifactMetadata({
      sourceRunId: "run-task005-artifact",
      requestGroupId: "group-task005",
      ownerChannel: "telegram",
      channelTarget: "telegram-session-task005",
      artifactPath,
      mimeType: "text/plain",
      sizeBytes: 12,
      retentionPolicy: "standard",
    }, artifactStorage)
    const contract = scheduleContract({
      payload: { kind: "artifact_delivery", artifactId },
      delivery: {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        mode: "direct_artifact",
        channel: "telegram",
        sessionId: "telegram-session-task005",
        artifactId,
      },
      summary: "TASK005 report",
    })
    insertContractSchedule("schedule-task005-artifact", contract)
    insertRun("run-task005-artifact", "schedule-task005-artifact")
    const deliverTelegramFile = vi.fn(async () => undefined)

    const result = await executeScheduleContract({
      config: runtimeFixture.config,
      schedule: getSchedule("schedule-task005-artifact")!,
      scheduleRunId: "run-task005-artifact",
      trigger: "manual",
      startedAt: Date.parse("2026-04-15T00:00:05.000Z"),
      artifactStorage,
      memoryJournal: {} as never,
      hierarchyStorage: createAgentHierarchyStorage(runtimeFixture.paths),
      dependencies: { deliverTelegramFile },
    })

    expect(result.handled && result.result).toMatchObject({
      success: true,
      summary: artifactPath,
      executionSuccess: true,
      deliverySuccess: true,
    })
    expect(deliverTelegramFile).toHaveBeenCalledWith(
      "telegram-session-task005",
      artifactPath,
      "TASK005 report",
    )
  })

  it("uses a contract execution brief for agent tasks and does not include raw schedule prompt", async () => {
    const contract = scheduleContract({
      payload: {
        kind: "agent_task",
        taskContract: null,
      },
      rawText: "RAW_SOURCE_TEXT_SHOULD_BE_OMITTED",
    })
    insertContractSchedule("schedule-task005-agent", contract)
    insertRun("run-task005-agent", "schedule-task005-agent")
    const schedule = getSchedule("schedule-task005-agent")!
    const brief = buildScheduledAgentExecutionBrief({
      schedule,
      contract,
      dueAt: "2026-04-15T00:00:00.000Z",
    })
    expect(brief).toContain("Execute the scheduled work")
    expect(brief).toContain("Do not create, update, cancel, deduplicate, or re-register schedules")
    expect(brief).not.toContain("RAW_PROMPT_SHOULD_NOT_REENTER_AGENT")
    expect(brief).not.toContain("RAW_SOURCE_TEXT_SHOULD_BE_OMITTED")

    let capturedUserMessage = ""
    const startIngressRunImpl = vi.fn((params) => {
      capturedUserMessage = params.message
      params.onChunk?.({ type: "text" as const, delta: "검토된 실행 완료", textSource: "llm_reviewed" })
      params.onChunk?.({ type: "done" as const, totalTokens: 0 })
      return {
        started: {
          runId: params.runId,
          sessionId: params.sessionId,
          status: "started" as const,
          finished: Promise.resolve({ status: "completed", summary: "검토된 실행 완료" }),
        },
      }
    })
    const result = await executeScheduleContract({
      config: runtimeFixture.config,
      schedule,
      scheduleRunId: "run-task005-agent",
      trigger: "scheduler tick (due: 2026-04-15T00:00:00.000Z)",
      startedAt: Date.parse("2026-04-15T00:00:05.000Z"),
      artifactStorage: createTestArtifactStorage(runtimeFixture.paths.stateDir),
      memoryJournal: {} as never,
      hierarchyStorage: createAgentHierarchyStorage(runtimeFixture.paths),
      dependencies: { startIngressRunImpl: startIngressRunImpl as never },
    })

    expect(result.handled && result.result).toMatchObject({ success: true, summary: "검토된 실행 완료" })
    expect(startIngressRunImpl).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-task005-agent",
      requestGroupId: "run-task005-agent",
      responseLanguageMode: "same_as_request",
      source: "scheduler",
    }))
    expect(capturedUserMessage).toContain("[scheduled-execution]")
    expect(capturedUserMessage).not.toContain("RAW_PROMPT_SHOULD_NOT_REENTER_AGENT")
    expect(capturedUserMessage).not.toContain("RAW_SOURCE_TEXT_SHOULD_BE_OMITTED")

    const duplicate = await executeScheduleContract({
      config: runtimeFixture.config,
      schedule,
      scheduleRunId: "run-task005-agent",
      trigger: "scheduler tick (due: 2026-04-15T00:00:00.000Z)",
      startedAt: Date.parse("2026-04-15T00:00:05.000Z"),
      artifactStorage: createTestArtifactStorage(runtimeFixture.paths.stateDir),
      memoryJournal: {} as never,
      hierarchyStorage: createAgentHierarchyStorage(runtimeFixture.paths),
      dependencies: { startIngressRunImpl: startIngressRunImpl as never },
    })
    expect(startIngressRunImpl).toHaveBeenCalledOnce()
    expect(duplicate.handled && duplicate.result.summary).toContain("중복")
  })

  it("blocks scheduled agent raw text when final response rendering is unavailable", async () => {
    const contract = scheduleContract({
      payload: {
        kind: "agent_task",
        instruction: "RAW_SOURCE_TEXT_SHOULD_NOT_DELIVER",
      },
      delivery: {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        mode: "channel_message",
        channel: "telegram",
        sessionId: "telegram-session-task005",
      },
    })
    insertContractSchedule("schedule-task005-agent-render-blocked", contract)
    insertRun("run-task005-agent-render-blocked", "schedule-task005-agent-render-blocked")
    const schedule = getSchedule("schedule-task005-agent-render-blocked")!
    const deliverTelegramText = vi.fn(async () => undefined)
    const startIngressRunImpl = vi.fn((params) => {
      params.onChunk?.({ type: "text" as const, delta: "RAW_AGENT_RESULT_SHOULD_NOT_DELIVER", textSource: "llm_generated" })
      return {
        started: {
          runId: params.runId,
          sessionId: params.sessionId,
          status: "started" as const,
          finished: Promise.resolve({ status: "failed", summary: "canonical final response review failed" }),
        },
      }
    })

    const result = await executeScheduleContract({
      config: runtimeFixture.config,
      schedule,
      scheduleRunId: "run-task005-agent-render-blocked",
      trigger: "scheduler tick (due: 2026-04-15T00:00:00.000Z)",
      startedAt: Date.parse("2026-04-15T00:00:05.000Z"),
      artifactStorage: createTestArtifactStorage(runtimeFixture.paths.stateDir),
      memoryJournal: {} as never,
      hierarchyStorage: createAgentHierarchyStorage(runtimeFixture.paths),
      dependencies: {
        startIngressRunImpl: startIngressRunImpl as never,
        deliverTelegramText,
      },
    })

    expect(result.handled && result.result).toMatchObject({
      success: false,
      summary: null,
      executionSuccess: false,
      deliverySuccess: null,
      retryable: false,
    })
    expect(result.handled && result.result.error).toContain("final response review")
    expect(deliverTelegramText).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain("RAW_AGENT_RESULT_SHOULD_NOT_DELIVER")
  })

  it("runs contract literal schedules through scheduler without writing raw prompt messages", async () => {
    insertContractSchedule("schedule-task005-integration", scheduleContract())

    const memoryJournal = createMemoryJournalRepository({
      memoryDbFile: join(runtimeFixture.paths.stateDir, "memory.db3"),
    })
    try {
      await runScheduleAndWait(
        "schedule-task005-integration",
        "manual",
        runtimeFixture.config,
        createTestArtifactStorage(runtimeFixture.paths.stateDir),
        memoryJournal,
        createAgentHierarchyStorage(runtimeFixture.paths),
      )
    } finally {
      memoryJournal.close()
    }

    const [run] = getScheduleRuns("schedule-task005-integration", 1, 0)
    expect(run).toMatchObject({
      schedule_id: "schedule-task005-integration",
      success: 1,
      summary: "알림",
      error: null,
      execution_success: 1,
      delivery_success: 1,
    })

    const messageCount = runtimeDb
      .prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM messages WHERE content = 'RAW_PROMPT_SHOULD_NOT_REENTER_AGENT'")
      .get()?.n ?? 0
    expect(messageCount).toBe(0)
  })
})
