import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CONTRACT_SCHEMA_VERSION,
  buildScheduleIdentityProjection,
  validateScheduleContract,
  type ScheduleContract,
} from "../packages/core/src/contracts/index.ts"

function scheduleContract(responseLanguageMode: ScheduleContract["responseLanguageMode"]): ScheduleContract {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    kind: "recurring",
    responseLanguageMode,
    time: {
      cron: "0 9 * * *",
      timezone: "Asia/Seoul",
      missedPolicy: "next_only",
    },
    payload: { kind: "agent_task", taskContract: null },
    delivery: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      mode: "channel_message",
      channel: "agent",
    },
  }
}

describe("task1191 ingress response-language policy contract", () => {
  it("persists a valid scheduled response-language mode in canonical identity", () => {
    const contract = scheduleContract("translation")

    expect(validateScheduleContract(contract)).toEqual({ ok: true, value: contract, issues: [] })
    expect(buildScheduleIdentityProjection(contract)).toEqual(expect.objectContaining({
      responseLanguageMode: "translation",
    }))
  })

  it("rejects an unknown scheduled response-language mode", () => {
    const contract = {
      ...scheduleContract("same_as_request"),
      responseLanguageMode: "allow_all",
    }

    const result = validateScheduleContract(contract)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "$.responseLanguageMode" }),
      ]))
    }
  })

  it("routes Telegram, Slack, CLI, and API requests through the common root ingress", () => {
    const paths = [
      ["packages/core/src/channels/telegram/bot.ts", 'from "../../runs/ingress.js"'],
      ["packages/core/src/channels/slack/bot.ts", 'from "../../runs/ingress.js"'],
      ["packages/cli/src/commands/run.ts", 'from "@knowbee/core"'],
      ["packages/core/src/api/routes/runs.ts", 'from "../../runs/ingress.js"'],
    ]

    for (const [path, importSource] of paths) {
      const source = readFileSync(path, "utf-8")
      expect(source, path).toContain(importSource)
      expect(source, path).toMatch(/\b(?:submitUserRequest|startIngressRun)\s*\(\{/u)
    }
  })

  it("projects the stored schedule mode into the final-response renderer", () => {
    const actionExecution = readFileSync("packages/core/src/runs/action-execution.ts", "utf-8")
    const contractExecutor = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")
    const scheduledFinalResponse = readFileSync("packages/core/src/scheduler/final-response.ts", "utf-8")

    expect(actionExecution).toContain("responseLanguageMode: intake.structured_request.response_language_mode")
    expect(contractExecutor).toContain("responseLanguageMode: params.contract.responseLanguageMode")
    expect(scheduledFinalResponse).toContain("responseLanguageMode: params.responseLanguageMode")
  })
})
