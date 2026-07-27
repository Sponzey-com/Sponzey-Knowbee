import { describe, expect, it } from "vitest"
import {
  authorizeExactYeonjangTarget,
  resolveExactYeonjangTarget,
  type YeonjangIdentityBoundarySnapshot,
} from "../packages/core/src/index.ts"
import { renderYeonjangTargetClarification } from "../packages/core/src/runs/yeonjang-target-clarification.ts"

const now = Date.UTC(2026, 6, 14, 10, 0, 0)

function fleet(): YeonjangIdentityBoundarySnapshot {
  return {
    schemaVersion: 1,
    capturedAt: now,
    runtime: { kind: "knowbee_runtime", runtimeId: "runtime:main", hostComputerId: "computer:local", observedAt: now },
    instances: [
      {
        kind: "yeonjang_instance", instanceId: "instance:local", label: "개발 연장", instanceAlias: "dev-local",
        callNames: ["개발기"], locality: "local", computerId: "computer:local", connectionState: "online", trustState: "trusted",
        capabilitySnapshotRef: "capability:local", permissionSnapshotRef: "permission:local", capabilityIds: ["shell.exec"], observedAt: now,
      },
      {
        kind: "yeonjang_instance", instanceId: "instance:remote-a", label: "원격 개발 연장", instanceAlias: "dev-remote-a",
        callNames: ["공용 개발기"], locality: "remote", computerId: "computer:remote-a", connectionState: "online", trustState: "trusted",
        capabilitySnapshotRef: "capability:remote-a", permissionSnapshotRef: "permission:remote-a", capabilityIds: ["shell.exec"], observedAt: now,
      },
      {
        kind: "yeonjang_instance", instanceId: "instance:remote-b", label: "원격 개발 연장", instanceAlias: "dev-remote-b",
        callNames: ["공용_개발기"], locality: "remote", computerId: "computer:remote-b", connectionState: "online", trustState: "trusted",
        capabilitySnapshotRef: "capability:remote-b", permissionSnapshotRef: "permission:remote-b", capabilityIds: ["screen.capture"], observedAt: now,
      },
    ],
    computers: [
      { kind: "computer", computerId: "computer:local", label: "내 Mac", operatingSystemId: "os:local", observedAt: now },
      { kind: "computer", computerId: "computer:remote-a", label: "서울 PC", operatingSystemId: "os:remote-a", observedAt: now },
      { kind: "computer", computerId: "computer:remote-b", label: "부산 PC", operatingSystemId: "os:remote-b", observedAt: now },
    ],
    operatingSystems: [
      { kind: "operating_system", operatingSystemId: "os:local", family: "macos", version: "15", architecture: "aarch64", observedAt: now },
      { kind: "operating_system", operatingSystemId: "os:remote-a", family: "windows", version: "11", architecture: "x86_64", observedAt: now },
      { kind: "operating_system", operatingSystemId: "os:remote-b", family: "linux", version: "24.04", architecture: "x86_64", observedAt: now },
    ],
  }
}

describe("task1228 exact Yeonjang target resolution", () => {
  it("resolves an explicit stable instance ID without falling back to another field", () => {
    const decision = resolveExactYeonjangTarget({
      selector: { type: "instance_id", instanceId: "instance:remote-a" }, snapshot: fleet(), maxAgeMs: 1_000,
    })
    expect(decision).toMatchObject({ status: "resolved", receipt: { targetInstanceId: "instance:remote-a" } })
    expect(resolveExactYeonjangTarget({
      selector: { type: "instance_id", instanceId: "dev-remote-a" }, snapshot: fleet(), maxAgeMs: 1_000,
    })).toEqual({ status: "not_found", reasonCode: "target_not_found", candidates: [] })
  })

  it("resolves one normalized alias but never picks the first of multiple normalized call names", () => {
    expect(resolveExactYeonjangTarget({
      selector: { type: "instance_alias", instanceAlias: " DEV_REMOTE_A " }, snapshot: fleet(), maxAgeMs: 1_000,
    })).toMatchObject({ status: "resolved", receipt: { targetInstanceId: "instance:remote-a" } })
    const ambiguous = resolveExactYeonjangTarget({
      selector: { type: "call_name", callName: "공용 개발기" }, snapshot: fleet(), maxAgeMs: 1_000,
    })
    expect(ambiguous).toMatchObject({ status: "ambiguous", reasonCode: "target_ambiguous" })
    if (ambiguous.status !== "ambiguous") throw new Error("expected ambiguity")
    expect(ambiguous.candidates.map((item) => item.computerName)).toEqual(["서울 PC", "부산 PC"])
    expect(JSON.stringify(ambiguous.candidates)).not.toMatch(/instance:|computer:|os:|permission:|capability:/)
  })

  it.each([
    ["offline", "trusted", "target_offline"],
    ["degraded", "trusted", "target_degraded"],
    ["online", "pending", "target_untrusted"],
  ] as const)("does not dispatch a %s/%s exact target", (connectionState, trustState, reasonCode) => {
    const value = fleet()
    value.instances[1] = { ...value.instances[1]!, connectionState, trustState }
    expect(resolveExactYeonjangTarget({
      selector: { type: "instance_id", instanceId: "instance:remote-a" }, snapshot: value, maxAgeMs: 1_000,
    })).toMatchObject({ status: "unavailable", reasonCode })
  })

  it("binds dispatch authorization to the exact selector and current snapshot", () => {
    const selector = { type: "instance_id" as const, instanceId: "instance:remote-a" }
    const snapshot = fleet()
    const decision = resolveExactYeonjangTarget({ selector, snapshot, maxAgeMs: 1_000 })
    if (decision.status !== "resolved") throw new Error("expected resolved target")
    expect(authorizeExactYeonjangTarget({ receipt: decision.receipt, selector, snapshot, maxAgeMs: 1_000 })).toBe("instance:remote-a")

    const changed = fleet()
    changed.instances[1]!.capabilityIds.push("screen.capture")
    expect(() => authorizeExactYeonjangTarget({ receipt: decision.receipt, selector, snapshot: changed, maxAgeMs: 1_000 })).toThrow(/does not match/i)
    expect(() => authorizeExactYeonjangTarget({ receipt: decision.receipt, selector: { ...selector, instanceId: "instance:remote-b" }, snapshot, maxAgeMs: 1_000 })).toThrow(/does not match/i)
  })

  it("rejects a stale identity snapshot before matching", () => {
    const snapshot = fleet()
    snapshot.instances[0]!.observedAt = now - 1_001
    expect(() => resolveExactYeonjangTarget({
      selector: { type: "instance_id", instanceId: "instance:local" }, snapshot, maxAgeMs: 1_000,
    })).toThrow(/stale/i)
  })

  it("renders ambiguity as a same-language LLM-reviewed question with every safe candidate", async () => {
    const decision = resolveExactYeonjangTarget({
      selector: { type: "call_name", callName: "공용 개발기" }, snapshot: fleet(), maxAgeMs: 1_000,
    })
    if (decision.status !== "ambiguous") throw new Error("expected ambiguity")
    await expect(renderYeonjangTargetClarification({
      originalRequest: "공용 개발기에서 실행해줘",
      primaryLanguage: "ko",
      decision,
      renderNotice: async () => ({
        status: "ready", text: "서울 PC와 부산 PC 중 어느 연장을 사용할까요?", textSource: "llm_reviewed",
      }),
    })).resolves.toEqual({ status: "ready", text: "서울 PC와 부산 PC 중 어느 연장을 사용할까요?", textSource: "llm_reviewed" })
  })

  it.each([
    ["서울 PC를 선택했습니다.", "yeonjang_target_clarification_auto_selected"],
    ["Which computer should I use, Seoul or Busan?", "yeonjang_target_clarification_language_mismatch"],
    ["서울 PC 중 어느 것을 쓸까요?", "yeonjang_target_clarification_candidate_missing"],
    ["instance_id: remote-a 중 어느 것을 쓸까요?", "yeonjang_target_clarification_internal_detail"],
  ])("blocks an unsafe ambiguity response: %s", async (text, reason) => {
    const decision = resolveExactYeonjangTarget({
      selector: { type: "call_name", callName: "공용 개발기" }, snapshot: fleet(), maxAgeMs: 1_000,
    })
    if (decision.status !== "ambiguous") throw new Error("expected ambiguity")
    await expect(renderYeonjangTargetClarification({
      originalRequest: "공용 개발기에서 실행해줘", primaryLanguage: "ko", decision,
      renderNotice: async () => ({ status: "ready", text, textSource: "llm_reviewed" }),
    })).resolves.toEqual({ status: "blocked", reason })
  })
})
