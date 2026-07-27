import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { transitionCapabilityMutation } from "../packages/core/src/capabilities/capability-mutation-state-machine.js"
import { validateMutationEnvelope } from "../packages/core/src/capabilities/capability-security-boundary.js"

describe("task022 capability mutation core ownership", () => {
  it("preserves state transition and envelope decisions in core", () => {
    const draft = { mutationId: "m1", state: "draft" as const, baseRevision: 1, targetRevision: 2, reasonCode: null }
    expect(transitionCapabilityMutation(draft, { type: "validate" }).state).toBe("validating")
    expect(validateMutationEnvelope({ envelope: { actorRef: "user", scope: "capability:write", mutationId: "m1", targetRevision: 2, purpose: "create_skill", issuedAt: 10, nonce: "n1" }, requiredScope: "capability:write", currentRevision: 1, now: 20, maxAgeMs: 100, usedNonces: new Set() }).ok).toBe(true)
  })

  it("leaves WebUI as compatibility re-exports with no implementation", () => {
    for (const path of ["packages/webui/src/lib/capability-mutation-state-machine.ts", "packages/webui/src/lib/capability-security-boundary.ts"]) {
      const source = readFileSync(path, "utf8")
      expect(source).toMatch(/^export \* from /)
      expect(source).not.toMatch(/function |process\.env|fetch\(|localStorage|sessionStorage/)
    }
  })

  it("keeps core independent from WebUI and framework adapters", () => {
    for (const path of ["packages/core/src/capabilities/capability-mutation-state-machine.ts", "packages/core/src/capabilities/capability-security-boundary.ts"]) {
      const source = readFileSync(path, "utf8")
      expect(source).not.toMatch(/packages\/webui|react|fastify|process\.env|fetch\(|localStorage|sessionStorage/)
    }
  })
})
