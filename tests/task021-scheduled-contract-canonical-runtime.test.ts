import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  CONTRACT_SCHEMA_VERSION,
  type ScheduleContract,
  toCanonicalJson,
} from "../packages/core/src/contracts/index.ts"
import { closeDb, getScheduleRuns, insertSchedule } from "../packages/core/src/db/index.js"
import { createMemoryJournalRepository } from "../packages/core/src/memory/journal.ts"
import { createAgentHierarchyStorage } from "../packages/core/src/orchestration/hierarchy.ts"
import { getRootRun } from "../packages/core/src/runs/store.ts"
import { runScheduleAndWait } from "../packages/core/src/scheduler/index.ts"
import { createTestArtifactStorage } from "./fixtures/artifact-storage.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task021 scheduled contract canonical runtime", () => {
  it("binds an agent contract to one canonical root identity and stores terminal failure", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task021-scheduler-"))
    tempDirs.push(rootDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    initializeTestDbRuntime(runtime.paths.stateDir)
    const contract: ScheduleContract = {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      kind: "recurring",
      time: { cron: "0 9 * * *", timezone: "Asia/Seoul", missedPolicy: "next_only" },
      payload: { kind: "agent_task", instruction: "Inspect and report verified workspace status." },
      delivery: {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        mode: "channel_message",
        channel: "agent",
        sessionId: null,
      },
      source: { originRunId: "origin-task021", originRequestGroupId: "group-task021" },
      displayName: "TASK021 canonical agent contract",
      rawText: "Inspect and report verified workspace status.",
    }
    const now = Date.now()
    insertSchedule({
      id: "schedule-task021-canonical",
      name: "TASK021 canonical agent contract",
      cron_expression: "0 9 * * *",
      timezone: "Asia/Seoul",
      prompt: "RAW_SCHEDULE_PROMPT_MUST_NOT_EXECUTE",
      enabled: 1,
      target_channel: "agent",
      target_session_id: null,
      execution_driver: "internal",
      origin_run_id: "origin-task021",
      origin_request_group_id: "group-task021",
      model: null,
      max_retries: 3,
      timeout_sec: 300,
      contract_json: toCanonicalJson(contract),
      contract_schema_version: CONTRACT_SCHEMA_VERSION,
      created_at: now,
      updated_at: now,
    })

    const memoryJournal = createMemoryJournalRepository(runtime.paths)
    try {
      const startedAt = Date.now()
      const scheduleRunId = await runScheduleAndWait(
        "schedule-task021-canonical",
        "manual",
        runtime.config,
        createTestArtifactStorage(runtime.paths.stateDir),
        memoryJournal,
        createAgentHierarchyStorage(runtime.paths),
      )
      const [scheduleRun] = getScheduleRuns("schedule-task021-canonical", 1, 0)

      expect(Date.now() - startedAt).toBeLessThan(4_000)
      expect(getRootRun(scheduleRunId)).toMatchObject({
        id: scheduleRunId,
        source: "scheduler",
        requestGroupId: scheduleRunId,
      })
      expect(scheduleRun).toMatchObject({
        id: scheduleRunId,
        success: 0,
        execution_success: 0,
        delivery_success: null,
      })
      expect(scheduleRun?.error).toBeTruthy()
    } finally {
      memoryJournal.close()
    }
  })
})
