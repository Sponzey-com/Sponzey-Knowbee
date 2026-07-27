import { describe, expect, it } from "vitest"
import {
  buildTaskIntakeFirstResponseSystemPrompt,
  buildTaskIntakeSystemPrompt,
} from "../packages/core/src/agent/intake-prompt.ts"

describe("buildTaskIntakeSystemPrompt", () => {
  it("requires exactly one typed response-tool result", () => {
    const prompt = buildTaskIntakeSystemPrompt()

    expect(prompt).toContain("Call `submit_task_intake` exactly once")
    expect(prompt).not.toContain("Return valid JSON only.")
    expect(prompt).not.toContain("```json")
  })

  it("assembles only the basic first-response owners in canonical order", () => {
    const prompt = buildTaskIntakeFirstResponseSystemPrompt({
      mainAgentName: "Knowbee",
      productName: "Sponzey Knowbee",
      productNameKo: "스폰지 노비",
    })
    const systemAt = prompt.indexOf("# Root Runtime System Prompt")
    const identityAt = prompt.indexOf("# Identity")
    const intakeAt = prompt.indexOf("# Task Intake")
    const finalAt = prompt.indexOf("# Final Response Policy")

    expect(systemAt).toBeGreaterThanOrEqual(0)
    expect(identityAt).toBeGreaterThan(systemAt)
    expect(intakeAt).toBeGreaterThan(identityAt)
    expect(finalAt).toBeGreaterThan(intakeAt)
    expect(prompt).not.toContain("# Bootstrap")
  })

  it("keeps scheduling classification in the minimal output without owning scheduling procedures", () => {
    const prompt = buildTaskIntakeSystemPrompt()

    expect(prompt).toContain("response-tool schema is the only output shape")
    expect(prompt).toContain("scheduling procedures")
    expect(prompt).not.toContain("schedule_kind")
    expect(prompt).toContain("does not own detailed action payload schemas")
  })

  it("leaves action payload schemas to downstream typed contracts", () => {
    const prompt = buildTaskIntakeSystemPrompt()

    expect(prompt).toContain("downstream typed contracts own each action payload")
    expect(prompt).not.toContain("### type = run_task")
    expect(prompt).not.toContain("### type = delegate_agent")
    expect(prompt).not.toContain("review_required")
  })

  it("references canonical execution owners without duplicating route policy", () => {
    const prompt = buildTaskIntakeSystemPrompt()

    expect(prompt).toContain("request_diagnosis.md")
    expect(prompt).toContain("work_record.md")
    expect(prompt).toContain("knowbee-execution.md")
    expect(prompt).not.toContain("sub_agent/delegate_to_child -> yeonjang -> self_solve")
    expect(prompt).not.toContain("root_knowbee_direct")
  })

  it("treats depth wording as a quality signal rather than a route", () => {
    const prompt = buildTaskIntakeSystemPrompt()

    expect(prompt).toContain("depth and verification requirements, not delegation commands")
    expect(prompt).toContain("Preserve exact user-specified names")
  })

  it("uses unbounded delegation turns as the default serialized value", () => {
    const prompt = buildTaskIntakeSystemPrompt()

    expect(prompt).toContain("maximum delegation turns is `0`")
  })

  it("renders an explicit delegation-turn override into the output contract", () => {
    const prompt = buildTaskIntakeSystemPrompt({ maxDelegationTurns: 6 })

    expect(prompt).toContain("maximum delegation turns is `6`")
    expect(prompt).not.toContain("{{maxDelegationTurns}}")
  })

  it("diagnoses the need for web evidence without owning web tool procedure", () => {
    const prompt = buildTaskIntakeSystemPrompt()

    expect(prompt).toContain("execution.needs_web=true")
    expect(prompt).toContain("does not own detailed action payload schemas")
    expect(prompt).toContain("web tool selection or retrieval procedure")
    expect(prompt).toContain("execution.needs_web=true")
    expect(prompt).toContain("Current prices")
    expect(prompt).toContain("Do not ask the user to provide the requested external result")
  })
})
