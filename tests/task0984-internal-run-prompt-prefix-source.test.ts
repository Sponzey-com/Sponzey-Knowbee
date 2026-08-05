import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { selectRequestGroupContextMessages } from "../packages/core/src/agent/request-group-context.ts"
import type { DbRequestGroupMessage } from "../packages/core/src/db/index.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { internalRunPromptPrefix, internalWorkerPromptPrefixes } from "../packages/core/src/runs/internal-prompt-prefixes.ts"
import { buildTaskModels } from "../packages/core/src/runs/task-model.ts"
import type { RootRun } from "../packages/core/src/runs/types.ts"

const SOURCE_ID = "internal_run_prompt_prefix_labels_user"
const repoRoot = process.cwd()

function message(id: string, role: string, runPrompt: string): DbRequestGroupMessage {
  return {
    id,
    session_id: "session-prefix",
    root_run_id: "group-prefix",
    run_request_group_id: "group-prefix",
    run_worker_session_id: id === "root-user" ? null : "worker-1",
    role,
    content: runPrompt,
    tool_calls: null,
    tool_call_id: null,
    created_at: 1,
    run_prompt: runPrompt,
    run_context_mode: null,
  }
}

function run(id: string, prompt: string): RootRun {
  return {
    id,
    sessionId: "session-prefix",
    requestGroupId: "group-prefix",
    lineageRootRunId: "group-prefix",
    runScope: "root",
    title: prompt,
    prompt,
    source: "webui",
    status: "running",
    taskProfile: "general_chat",
    contextMode: "full",
    delegationTurnCount: 0,
    maxDelegationTurns: 5,
    currentStepKey: "executing",
    currentStepIndex: 1,
    totalSteps: 1,
    summary: prompt,
    canCancel: true,
    createdAt: 1,
    updatedAt: 1,
    steps: [],
    recentEvents: [],
  }
}

describe("task0984 internal run prompt prefixes", () => {
  it("registers internal run prompt prefixes as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot)
      .find((item) => item.sourceId === SOURCE_ID && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: SOURCE_ID,
      required: false,
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("task_intake_bridge=[Task Intake Bridge]")
    expect(source?.content).toContain("filesystem_verification=[Filesystem Verification]")
    expect(internalRunPromptPrefix("scheduled_task")).toBe("[Scheduled Task]")
    expect(internalWorkerPromptPrefixes()).toContain("[Task Intake Bridge]")
  })

  it("classifies and filters stored internal prompts from source-backed prefixes", () => {
    const task = buildTaskModels([
      run("root", "User request"),
      run("verify", `${internalRunPromptPrefix("filesystem_verification")}\nTask: verify`),
      run("scheduled", `${internalRunPromptPrefix("scheduled_task")}\nTask: scheduled`),
    ])[0]

    expect(task?.attempts.map((attempt) => attempt.kind)).toEqual(["primary", "verification", "scheduled_execution"])

    const selected = selectRequestGroupContextMessages([
      message("root-user", "user", "User request"),
      message("worker-user", "user", `${internalRunPromptPrefix("task_intake_bridge")}\nTask: child`),
      message("sibling-user", "user", "Sibling raw prompt"),
    ])

    expect(selected.map((item) => item.id)).toEqual(["root-user", "worker-user", "sibling-user"])
  })

  it("removes internal run prompt prefix literals from TypeScript", () => {
    const requestContextSource = readFileSync(join(repoRoot, "packages/core/src/agent/request-group-context.ts"), "utf8")
    const taskModelSource = readFileSync(join(repoRoot, "packages/core/src/runs/task-model.ts"), "utf8")

    expect(requestContextSource).toContain("internalWorkerPromptPrefixes")
    expect(taskModelSource).toContain("internalRunPromptPrefix")
    for (const literal of [
      "[Task Intake Bridge]",
      "[Filesystem Execution Required]",
      "[Approval Granted Continuation]",
      "[Scheduled Task]",
      "[Truncated Output Recovery]",
      "[Filesystem Verification]",
    ]) {
      expect(requestContextSource).not.toContain(literal)
      expect(taskModelSource).not.toContain(literal)
    }
  })
})
