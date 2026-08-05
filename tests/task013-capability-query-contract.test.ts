import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CapabilityQueryCoordinator,
  validateCapabilitySummary,
} from "../packages/webui/src/lib/capability-query-contract.js"

describe("task013 capability query contract", () => {
  it("rejects restricted fields and incomplete user status reasons", () => {
    const result = validateCapabilitySummary({
      capabilityId: "mcp.penpot", name: "Penpot", kind: "mcp", status: "unavailable",
      reasonCode: "", allowedActions: ["inspect"], revision: 2, observedAt: "2026-07-20T00:00:00.000Z",
      secret: "hidden", absolutePath: "/private/path",
    })
    expect(new Set(result.diagnostics.map((item) => item.reasonCode))).toEqual(new Set([
      "capability_reason_missing", "restricted_projection_field",
    ]))
  })

  it("deduplicates concurrent queries and rejects stale late revisions", async () => {
    let calls = 0
    let resolveFirst!: (value: { revision: number; value: string }) => void
    const coordinator = new CapabilityQueryCoordinator(async (_key, _signal) => {
      calls += 1
      return new Promise((resolve) => { resolveFirst = resolve })
    })
    const first = coordinator.query("capabilities")
    const duplicate = coordinator.query("capabilities")
    expect(calls).toBe(1)
    resolveFirst({ revision: 2, value: "current" })
    expect(await first).toEqual({ accepted: true, projection: { revision: 2, value: "current" } })
    expect(await duplicate).toEqual({ accepted: true, projection: { revision: 2, value: "current" } })

    const stale = await coordinator.accept("capabilities", { revision: 1, value: "old" })
    expect(stale).toEqual({ accepted: false, reasonCode: "stale_revision_rejected", currentRevision: 2 })
  })

  it("cancels an owner's request through AbortSignal", async () => {
    let observedAbort = false
    const coordinator = new CapabilityQueryCoordinator((_key, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { observedAbort = true; reject(new DOMException("Aborted", "AbortError")) })
    }))
    const pending = coordinator.query("capabilities", "route:capabilities")
    coordinator.releaseOwner("route:capabilities")
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(observedAbort).toBe(true)
  })

  it("keeps the application contract free of framework and external I/O dependencies", () => {
    const source = readFileSync("packages/webui/src/lib/capability-query-contract.ts", "utf8")
    expect(source).not.toMatch(/from ["'](?:react|fastify|better-sqlite3)|fetch\(|readFile|writeFile|process\.env/)
    expect(source).not.toMatch(/console\.|logger\./)
  })
})
