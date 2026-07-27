import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

type IngressClassification =
  | "canonical"
  | "canonical_with_recorded_bypass"
  | "no_runtime_ingress"
  | "outbound_only"
  | "canonical_child_run"

interface KnownBypass {
  owner: string
  marker: string
  reason: string
}

interface IngressEntry {
  id: string
  kind: "external_ingress" | "adapter_only" | "internal_child_execution"
  owner: string
  entryMarker: string
  executionOwner: string | null
  executionMarker: string | null
  classification: IngressClassification
  finalResponseBinding: string
  cancellationBinding: string
  knownBypasses?: KnownBypass[]
}

const inventory = JSON.parse(
  readFileSync("docs/audit/canonical-ingress-inventory.json", "utf8"),
) as { schemaVersion: number; entries: IngressEntry[] }

const expectedIds = [
  "api-runs",
  "cli-run",
  "discord-adapter",
  "google-chat-adapter",
  "internal-delegation",
  "local-bridge-adapters",
  "scheduler",
  "slack-message",
  "telegram-message",
  "webui-api-agent-run",
]

describe("task020 canonical ingress inventory", () => {
  it("classifies every known ingress owner and rejects missing source markers", () => {
    expect(inventory.schemaVersion).toBe(1)
    expect(inventory.entries.map((entry) => entry.id).sort()).toEqual(expectedIds)
    expect(new Set(inventory.entries.map((entry) => entry.id)).size).toBe(inventory.entries.length)

    for (const entry of inventory.entries) {
      const ownerSource = readFileSync(entry.owner, "utf8")
      expect(ownerSource, entry.id).toContain(entry.entryMarker)
      expect(entry.finalResponseBinding, entry.id).not.toBe("")
      expect(entry.cancellationBinding, entry.id).not.toBe("")
      if (entry.executionOwner && entry.executionMarker) {
        expect(readFileSync(entry.executionOwner, "utf8"), entry.id).toContain(
          entry.executionMarker,
        )
      }
      for (const bypass of entry.knownBypasses ?? []) {
        expect(readFileSync(bypass.owner, "utf8"), `${entry.id}:${bypass.owner}`).toContain(
          bypass.marker,
        )
        expect(bypass.reason.trim(), entry.id).not.toBe("")
      }
    }
  })

  it("keeps direct runAgent execution out of external ingress owners", () => {
    const externalOwners = inventory.entries
      .filter((entry) => entry.kind === "external_ingress")
      .map((entry) => entry.owner)

    for (const owner of externalOwners) {
      const source = readFileSync(owner, "utf8")
      expect(source, owner).not.toMatch(/from\s+["'][^"']*agent\/index\.js["']/u)
      expect(source, owner).not.toMatch(/\brunAgent\s*\(/u)
    }
  })

  it("has no recorded direct execution bypass in a known external ingress", () => {
    const bypasses = inventory.entries.flatMap((entry) => entry.knownBypasses ?? [])
    expect(bypasses).toEqual([])
  })

  it("keeps every active external ingress on canonical execution and finalization", () => {
    const activeExternal = inventory.entries.filter((entry) => entry.kind === "external_ingress")
    expect(activeExternal.every((entry) => entry.classification === "canonical")).toBe(true)

    const scheduler = readFileSync("packages/core/src/scheduler/index.ts", "utf8")
    expect(scheduler).not.toContain("renderScheduledFinalResponse")
    expect(scheduler).not.toContain("toolDispatcher.dispatch")
    expect(scheduler).not.toContain("runAgent(")
  })
})
