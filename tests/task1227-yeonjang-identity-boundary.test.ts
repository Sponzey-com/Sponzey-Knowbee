import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  projectYeonjangUserFacingIdentities,
  validateYeonjangIdentityBoundarySnapshot,
  type YeonjangIdentityBoundarySnapshot,
} from "../packages/core/src/index.ts"

const capturedAt = Date.UTC(2026, 6, 14, 9, 0, 0)

function snapshot(): YeonjangIdentityBoundarySnapshot {
  return {
    schemaVersion: 1,
    capturedAt,
    runtime: { kind: "knowbee_runtime", runtimeId: "runtime:main", hostComputerId: "computer:local", observedAt: capturedAt },
    instances: [
      {
        kind: "yeonjang_instance", instanceId: "instance:local", label: "작업실 연장", instanceAlias: "local-workshop", callNames: ["내 작업실"], locality: "local",
        computerId: "computer:local", connectionState: "online", trustState: "trusted", capabilitySnapshotRef: "capability:local:v1",
        permissionSnapshotRef: "permission:local:v1", capabilityIds: ["screen.capture", "shell.exec"], observedAt: capturedAt,
      },
      {
        kind: "yeonjang_instance", instanceId: "instance:remote", label: "작업실 연장", instanceAlias: "remote-workshop", callNames: ["원격 작업실"], locality: "remote",
        computerId: "computer:remote", connectionState: "degraded", trustState: "trusted", capabilitySnapshotRef: "capability:remote:v1",
        permissionSnapshotRef: "permission:remote:v1", capabilityIds: ["screen.capture"], observedAt: capturedAt,
      },
    ],
    computers: [
      { kind: "computer", computerId: "computer:local", label: "내 Mac", operatingSystemId: "os:local", observedAt: capturedAt },
      { kind: "computer", computerId: "computer:remote", label: "원격 PC", operatingSystemId: "os:remote", observedAt: capturedAt },
    ],
    operatingSystems: [
      { kind: "operating_system", operatingSystemId: "os:local", family: "macos", version: "15.5", architecture: "aarch64", observedAt: capturedAt },
      { kind: "operating_system", operatingSystemId: "os:remote", family: "unknown", version: null, architecture: null, observedAt: capturedAt },
    ],
  }
}

describe("task1227 Yeonjang runtime, instance, and computer identity boundary", () => {
  it("keeps runtime, local and remote instances, computers, and operating systems as distinct identities", () => {
    const validated = validateYeonjangIdentityBoundarySnapshot({ snapshot: snapshot(), maxAgeMs: 1_000 })
    expect(validated.runtime.kind).toBe("knowbee_runtime")
    expect(validated.instances.map((item) => [item.kind, item.locality])).toEqual([
      ["yeonjang_instance", "local"], ["yeonjang_instance", "remote"],
    ])
    expect(validated.computers.every((item) => item.kind === "computer")).toBe(true)
    expect(validated.operatingSystems.every((item) => item.kind === "operating_system")).toBe(true)
  })

  it("allows duplicate labels because kind and stable internal ID define identity", () => {
    expect(() => validateYeonjangIdentityBoundarySnapshot({ snapshot: snapshot(), maxAgeMs: 1_000 })).not.toThrow()
  })

  it("projects only user-facing identity and keeps capabilities owned by each instance", () => {
    const validated = validateYeonjangIdentityBoundarySnapshot({ snapshot: snapshot(), maxAgeMs: 1_000 })
    const projection = projectYeonjangUserFacingIdentities(validated)
    expect(projection).toEqual([
      {
        label: "작업실 연장", locality: "local", connectionState: "online", computerName: "내 Mac",
        operatingSystem: { family: "macos", version: "15.5", architecture: "aarch64" }, capabilityCount: 2,
      },
      {
        label: "작업실 연장", locality: "remote", connectionState: "degraded", computerName: "원격 PC",
        operatingSystem: { family: "unknown", version: null, architecture: null }, capabilityCount: 1,
      },
    ])
    expect(JSON.stringify(projection)).not.toMatch(/runtime:|instance:|computer:|os:|SnapshotRef|permission:/)
  })

  it("rejects locality inferred contrary to the verified runtime-computer association", () => {
    const value = snapshot()
    value.instances[1]!.locality = "local"
    expect(() => validateYeonjangIdentityBoundarySnapshot({ snapshot: value, maxAgeMs: 1_000 })).toThrow(/locality contradicts/i)
  })

  it("rejects missing associations, duplicate IDs, stale observations, and inferred unknown OS details", () => {
    const missingComputer = snapshot()
    missingComputer.instances[0]!.computerId = "computer:missing"
    expect(() => validateYeonjangIdentityBoundarySnapshot({ snapshot: missingComputer, maxAgeMs: 1_000 })).toThrow(/computer association is missing/i)

    const duplicateInstance = snapshot()
    duplicateInstance.instances[1]!.instanceId = duplicateInstance.instances[0]!.instanceId
    expect(() => validateYeonjangIdentityBoundarySnapshot({ snapshot: duplicateInstance, maxAgeMs: 1_000 })).toThrow(/must be unique/i)

    const stale = snapshot()
    stale.instances[0]!.observedAt = capturedAt - 1_001
    expect(() => validateYeonjangIdentityBoundarySnapshot({ snapshot: stale, maxAgeMs: 1_000 })).toThrow(/stale/i)

    const inferred = snapshot()
    inferred.operatingSystems[1]!.architecture = "x86_64"
    expect(() => validateYeonjangIdentityBoundarySnapshot({ snapshot: inferred, maxAgeMs: 1_000 })).toThrow(/cannot contain inferred/i)
  })

  it("keeps the identity owner independent from adapters and external state", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/yeonjang-identity-boundary.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(source).not.toMatch(/process\.env|process\.platform|hostname|fetch\(|readFile|globalThis/)
  })
})
