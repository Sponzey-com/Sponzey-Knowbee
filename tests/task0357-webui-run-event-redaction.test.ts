import { describe, expect, it } from "vitest"
import { projectRunEventForWebUi } from "../packages/core/src/api/ws/stream.ts"
import type { RootRun, RunStep } from "../packages/core/src/runs/types.ts"

function run(overrides: Partial<RootRun> = {}): RootRun {
  return {
    id: "run-task0357",
    sessionId: "session-task0357",
    requestGroupId: "group-task0357",
    lineageRootRunId: "group-task0357",
    runScope: "root",
    title: "Run redaction",
    prompt: "Read /Users/demo/.knowbee/private/request.md using sk-task0357-secret-value-1234567890",
    source: "webui",
    status: "running",
    taskProfile: "operations",
    contextMode: "full",
    promptSourceSnapshot: {
      credential: "Bearer sk-task0357-secret-value-1234567890",
      providerRawResponse: "<html><body>internal trace</body></html>",
      artifactPath: "/private/var/folders/task0357/raw-output.json",
    },
    delegationTurnCount: 0,
    maxDelegationTurns: 3,
    currentStepKey: "executing",
    currentStepIndex: 3,
    totalSteps: 5,
    summary: "Using /tmp/task0357/output.json with token sk-task0357-secret-value-1234567890",
    canCancel: true,
    createdAt: 1,
    updatedAt: 2,
    steps: [
      {
        key: "executing",
        title: "Executing",
        index: 3,
        status: "running",
        summary: "Working from /Users/demo/.knowbee/private/request.md",
      },
    ],
    recentEvents: [
      {
        id: "event-task0357",
        at: 2,
        label: "Stored raw output at /private/var/folders/task0357/raw-output.json",
      },
    ],
    ...overrides,
  }
}

describe("task0357 WebUI run event redaction", () => {
  it("redacts RootRun payloads before WebUI transport", () => {
    const payload = projectRunEventForWebUi("run.status", { run: run() })
    const serialized = JSON.stringify(payload)

    expect(payload.type).toBe("run.status")
    expect(payload.run.id).toBe("run-task0357")
    expect(payload.run.status).toBe("running")
    expect(payload.run.currentStepKey).toBe("executing")
    expect(serialized).not.toContain("sk-task0357-secret-value")
    expect(serialized).not.toContain("/Users/demo/.knowbee/private/request.md")
    expect(serialized).not.toContain("/private/var/folders/task0357/raw-output.json")
    expect(serialized).not.toContain("/tmp/task0357/output.json")
    expect(serialized).not.toContain("<html")
    expect(serialized).toContain("***MASKED***")
    expect(serialized).toContain("[redacted-raw-payload]")
    expect(serialized).toContain("artifact:")
  })

  it("redacts top-level step payloads before WebUI transport", () => {
    const step: RunStep = {
      key: "reviewing",
      title: "Reviewing",
      index: 4,
      status: "completed",
      summary: "Checked /Users/demo/.knowbee/private/review.md with Bearer sk-task0357-step-secret-value-1234567890",
    }

    const payload = projectRunEventForWebUi("run.step.completed", {
      runId: "run-task0357",
      step,
      run: run({ currentStepKey: "reviewing", currentStepIndex: 4, status: "completed" }),
    })
    const serialized = JSON.stringify(payload)

    expect(payload.type).toBe("run.step.completed")
    expect(payload.runId).toBe("run-task0357")
    expect(payload.step.key).toBe("reviewing")
    expect(payload.step.status).toBe("completed")
    expect(serialized).not.toContain("/Users/demo/.knowbee/private/review.md")
    expect(serialized).not.toContain("sk-task0357-step-secret-value")
    expect(serialized).toContain("artifact:")
    expect(serialized).toContain("Bearer ***")
  })
})
