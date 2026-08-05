import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildOrchestrationRegistrySnapshot } from "../packages/core/src/orchestration/registry.ts"

const registrySource = readFileSync(
  new URL("../packages/core/src/orchestration/registry.ts", import.meta.url),
  "utf-8",
)

function snapshotFor(errorMessage: string) {
  return buildOrchestrationRegistrySnapshot({
    now: () => Date.UTC(2026, 6, 7, 0, 0, 0),
    get config() {
      throw new Error(errorMessage)
    },
  })
}

describe("task0650 orchestration registry fallback redaction", () => {
  it("keeps fallback API fields independent from raw exception details", () => {
    const snapshot = snapshotFor(
      "load failed at /Users/example/private/config.json with token=sk-secret1234567890",
    )
    const exposed = JSON.stringify({
      fallback: snapshot.fallback,
      diagnostics: snapshot.diagnostics,
    })

    expect(snapshot.status).toBe("degraded")
    expect(snapshot.fallback).toEqual({
      mode: "single_knowbee",
      reasonCode: "registry_load_failed",
      reason: "Registry snapshot is unavailable. Single main-agent mode is active.",
    })
    expect(snapshot.diagnostics).toEqual([
      {
        code: "registry_load_failed",
        severity: "invalid",
        message: "Registry snapshot is unavailable. Single main-agent mode is active.",
      },
    ])
    expect(exposed).not.toContain("sk-secret")
    expect(exposed).not.toContain("/Users/example")
    expect(exposed).not.toContain("load failed at")
  })

  it("does not derive fallback invalidation keys from raw exception text", () => {
    const first = snapshotFor("first failure token=sk-firstsecret123456")
    const second = snapshotFor("second failure token=sk-secondsecret123456")

    expect(first.invalidation?.cacheKey).toBe(second.invalidation?.cacheKey)
    expect(first.invalidation?.cacheKey).toBe(first.invalidation?.configHash)
  })

  it("keeps raw error conversion behind the registry fallback helper", () => {
    expect(registrySource).toContain("function registryFallbackFailureLogDetail(error: unknown): string")
    expect(registrySource).toContain("const logDetail = registryFallbackFailureLogDetail(input.error)")
    expect(registrySource).not.toContain("const detail = redactLogText(")
    expect(registrySource).not.toContain("Registry snapshot failed: ${detail}")
    expect(registrySource).not.toContain("single main-agent mode: ${detail}")
  })
})
