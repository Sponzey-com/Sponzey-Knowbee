import { describe, expect, it } from "vitest"
import {
  REQUIRED_USABILITY_TASKS,
  evaluateUsabilityEvidence,
} from "../scripts/lib/usability-evidence.mjs"

function completedTasks(outcome: "success" | "failure" = "success") {
  return REQUIRED_USABILITY_TASKS.map((taskId, index) => ({
    taskId,
    outcome,
    durationMs: 1_000 + index,
  }))
}

function validEvidence(collectionKind: "fixture" | "live" = "live") {
  return {
    schemaVersion: "knowbee.usability-evidence:v1",
    collectionKind,
    buildIdentity: "build-abc123",
    deterministicAccessibility: {
      passed: true,
      sampleCount: 15,
      criticalViolationCount: 0,
    },
    screenReaders: [
      { slot: "sr-macos", platform: "macos", technology: "voiceover", status: "collected", tasks: completedTasks() },
      { slot: "sr-other", platform: "windows", technology: "nvda", status: "collected", tasks: completedTasks() },
    ],
    participants: Array.from({ length: 5 }, (_, index) => ({
      alias: `P${index + 1}`,
      status: "collected",
      tasks: completedTasks(),
    })),
  }
}

describe("Task060 usability evidence", () => {
  it("derives a passing live gate only from complete event records", () => {
    const report = evaluateUsabilityEvidence(validEvidence())
    expect(report).toMatchObject({
      valid: true,
      liveEvidence: true,
      phase10Ready: true,
      completeParticipantCount: 5,
      participantTaskSuccessRate: 1,
      screenReaderStatus: "collected",
    })
  })

  it("does not promote a complete deterministic fixture as live evidence", () => {
    const report = evaluateUsabilityEvidence(validEvidence("fixture"))
    expect(report.valid).toBe(true)
    expect(report.liveEvidence).toBe(false)
    expect(report.phase10Ready).toBe(false)
    expect(report.blockingReasons).toContain("live_evidence_not_collected")
  })

  it.each([
    ["duplicate alias", (value: ReturnType<typeof validEvidence>) => { value.participants[1].alias = "P1" }, "participant_alias_duplicate"],
    ["missing task", (value: ReturnType<typeof validEvidence>) => { value.participants[0].tasks.pop() }, "participant_tasks_incomplete"],
    ["invalid duration", (value: ReturnType<typeof validEvidence>) => { value.participants[0].tasks[0].durationMs = -1 }, "task_duration_invalid"],
    ["manual aggregate", (value: ReturnType<typeof validEvidence> & { successRate?: number }) => { value.successRate = 1 }, "manual_aggregate_forbidden"],
    ["private payload", (value: ReturnType<typeof validEvidence>) => { Object.assign(value.participants[0], { prompt: "private request" }) }, "private_field_forbidden"],
  ])("rejects %s", (_label, mutate, reason) => {
    const evidence = validEvidence()
    mutate(evidence)
    const report = evaluateUsabilityEvidence(evidence)
    expect(report.valid).toBe(false)
    expect(report.validationErrors.some((error) => error.includes(reason))).toBe(true)
    expect(report.phase10Ready).toBe(false)
  })

  it("keeps fewer than five sessions and missing screen-reader platforms uncollected", () => {
    const evidence = validEvidence()
    evidence.participants.pop()
    evidence.screenReaders[1] = {
      ...evidence.screenReaders[1],
      status: "not_collected",
      tasks: [],
    }
    const report = evaluateUsabilityEvidence(evidence)
    expect(report.valid).toBe(true)
    expect(report.phase10Ready).toBe(false)
    expect(report.completeParticipantCount).toBe(4)
    expect(report.screenReaderStatus).toBe("not_collected")
    expect(report.blockingReasons).toEqual(expect.arrayContaining([
      "five_participants_not_collected",
      "screen_reader_matrix_not_collected",
    ]))
  })
})
