import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { extractIntakeMethodConstraints } from "../packages/core/src/agent/intake-method-constraints.ts"
import { evaluateCanonicalPlanPolicy } from "../packages/core/src/runs/canonical-plan-policy.ts"

const fingerprint = `sha256:${"a".repeat(64)}` as const

describe("Task 066 user-specified execution method priority", () => {
  it("preserves the user's preferred and exclusive method order", () => {
    expect(
      extractIntakeMethodConstraints([
        {
          payload: {
            preferred_methods: ["mcp.finance", "web.search", "mcp.finance"],
            exclusive_methods: ["yeonjang.shell", "mcp.finance", "yeonjang.shell"],
            target_instance: "pc:office",
          },
        },
      ]),
    ).toEqual({
      ok: true,
      constraints: {
        requestedMethods: ["mcp.finance", "web.search"],
        exclusiveMethods: ["yeonjang.shell", "mcp.finance"],
        targetId: "pc:office",
      },
    })
  })

  it("evaluates an allowed user-preferred method before required baseline capabilities", () => {
    const decision = evaluateCanonicalPlanPolicy({
      runId: "run:66",
      workId: "work:root:run:66",
      planFingerprint: fingerprint,
      capabilitySnapshot: {
        snapshotId: "snapshot:66",
        fingerprint,
        bindings: [
          { capabilityId: "mcp.finance", targetId: "pc:office", risk: "safe" },
          { capabilityId: "web.search", targetId: "pc:office", risk: "safe" },
          { capabilityId: "action:quote", targetId: "pc:office", risk: "safe" },
        ],
      },
      constraints: {
        requiredMethods: ["action:quote"],
        requestedMethods: ["mcp.finance", "web.search"],
        exclusiveMethods: [],
        targetId: "pc:office",
        approvedCapabilityIds: [],
      },
    })

    expect(decision).toMatchObject({
      outcome: "allowed",
      evaluatedCapabilityIds: ["mcp.finance", "web.search", "action:quote"],
    })
  })

  it("defines first-path preference and exclusive-method failure behavior in the execution prompt", () => {
    const prompt = readFileSync("prompts/knowbee-execution.md", "utf8")

    expect(prompt).toContain(
      "Use the first available method in `preferred_methods` as the initial execution path",
    )
    expect(prompt).toContain(
      "Do not substitute another method when `exclusive_methods` is non-empty",
    )
    expect(prompt).toContain(
      "diagnose the failure before selecting a materially different allowed method",
    )
  })
})
