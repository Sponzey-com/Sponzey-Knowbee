import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  createRuntimeConfigSnapshot,
  projectCapabilityAudience,
  rejectRuntimeEnvironmentMutation,
  validateMutationEnvelope,
} from "../packages/webui/src/lib/capability-security-boundary.js"

const envelope = () => ({ actorRef: "user:self", scope: "capability:write", mutationId: "m1", targetRevision: 4, purpose: "connect_mcp", issuedAt: 1000, nonce: "n1" })

describe("task016 capability security boundary", () => {
  it("rejects replay, expiry, scope, and revision mismatch with stable reasons", () => {
    expect(validateMutationEnvelope({ envelope: envelope(), requiredScope: "capability:write", currentRevision: 3, now: 1200, maxAgeMs: 500, usedNonces: new Set() }).ok).toBe(true)
    expect(validateMutationEnvelope({ envelope: envelope(), requiredScope: "admin:write", currentRevision: 3, now: 1200, maxAgeMs: 500, usedNonces: new Set(["n1"]) }).diagnostics.map((x) => x.reasonCode)).toEqual([
      "mutation_scope_denied", "mutation_nonce_replayed",
    ])
    expect(validateMutationEnvelope({ envelope: envelope(), requiredScope: "capability:write", currentRevision: 4, now: 2000, maxAgeMs: 500, usedNonces: new Set() }).diagnostics.map((x) => x.reasonCode)).toEqual([
      "mutation_expired", "mutation_revision_conflict",
    ])
  })

  it("redacts restricted fields from user and requires authorization for audit", () => {
    const source = { name: "Penpot", status: "available", internalId: "i1", absolutePath: "/private", rawPrompt: "hidden", privateMemory: "hidden", structuredLlmContract: { hidden: true } }
    expect(projectCapabilityAudience({ audience: "user", authorized: true, source })).toEqual({ name: "Penpot", status: "available" })
    expect(() => projectCapabilityAudience({ audience: "audit", authorized: false, source })).toThrow("Audit authorization required")
    expect(projectCapabilityAudience({ audience: "audit", authorized: true, source })).toMatchObject({ internalId: "i1" })
  })

  it("creates an immutable allowlisted bootstrap snapshot and rejects runtime mutation", () => {
    const snapshot = createRuntimeConfigSnapshot({ PORT: "18888", LOG_LEVEL: "field_debug", SECRET: "omit" }, ["PORT", "LOG_LEVEL"])
    expect(snapshot).toEqual({ PORT: "18888", LOG_LEVEL: "field_debug" })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(() => rejectRuntimeEnvironmentMutation("PORT")).toThrow("Runtime environment mutation is prohibited")
  })

  it("does not access environment, storage, network, or logging implicitly", () => {
    const source = readFileSync("packages/webui/src/lib/capability-security-boundary.ts", "utf8")
    expect(source).not.toMatch(/process\.env|fetch\(|localStorage|sessionStorage|console\.|logger\./)
  })
})
