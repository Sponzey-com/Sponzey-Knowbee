import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CONTRACT_SCHEMA_VERSION,
  type ScheduleContract,
} from "../packages/core/src/contracts/index.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildScheduledAgentExecutionBrief } from "../packages/core/src/scheduler/contract-executor.ts"

function contract(): ScheduleContract {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    kind: "recurring",
    time: {
      cron: "0 9 * * *",
      timezone: "Asia/Seoul",
      missedPolicy: "next_only",
    },
    payload: {
      kind: "agent_task",
      taskContract: null,
    },
    delivery: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      mode: "channel_message",
      channel: "agent",
      sessionId: null,
    },
    source: {
      originRunId: "run-task0948",
      originRequestGroupId: "group-task0948",
    },
    displayName: "TASK0948 reminder",
    rawText: "RAW_SOURCE_TEXT_SHOULD_BE_OMITTED",
  }
}

function brief(): string {
  return buildScheduledAgentExecutionBrief({
    schedule: {
      id: "schedule-task0948",
      name: "TASK0948 reminder",
      target_channel: "agent",
      target_session_id: null,
    } as any,
    contract: contract(),
    dueAt: "2026-04-15T00:00:00.000Z",
  })
}

describe("task0948 scheduled contract execution prompt source", () => {
  it("registers scheduled contract execution as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "scheduled_contract_execution_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "scheduled_contract_execution_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/scheduled_contract_execution_user.md")).toBe(true)
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("{{contractJson}}")
  })

  it("renders only the Value section for scheduled contract execution", () => {
    const rendered = brief()

    expect(rendered).toContain("[scheduled-execution]")
    expect(rendered).toContain("Execute the scheduled work described by this contract now.")
    expect(rendered).toContain("Do not create, update, cancel, deduplicate, or re-register schedules.")
    expect(rendered).toContain("Do not treat this as a new user request. This is an execution tick for an existing schedule.")
    expect(rendered).toContain("[schedule] id=schedule-task0948")
    expect(rendered).toContain("[schedule] targetSessionId=none")
    expect(rendered).toContain("[contract-json]")
    expect(rendered).toContain("[output]\nReturn only the result that should be delivered for this scheduled execution.")
    expect(rendered).not.toContain("RAW_SOURCE_TEXT_SHOULD_BE_OMITTED")
    expect(rendered).not.toContain("# Scheduled Contract Execution Brief")
    expect(rendered).not.toContain("## Value")
  })

  it("keeps scheduler on the memory prompt fragment helper and removes hardcoded brief bodies", () => {
    const schedulerSource = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")
    const rootLoopSource = readFileSync("packages/core/src/runs/root-loop-pass-launch.ts", "utf-8")

    expect(schedulerSource).toContain("scheduled_contract_execution_user")
    expect(schedulerSource).toContain('import { loadPromptValue } from "../memory/prompt-fragments.js"')
    expect(rootLoopSource).toContain('import { loadPromptValue } from "../memory/prompt-fragments.js"')
    expect(schedulerSource).not.toContain("Execute the scheduled work described by this contract now.")
    expect(schedulerSource).not.toContain("Do not create, update, cancel, deduplicate, or re-register schedules.")
    expect(schedulerSource).not.toContain("Return only the result that should be delivered for this scheduled execution.")
  })
})
