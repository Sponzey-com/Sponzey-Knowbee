import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildStartRootRunDriverDependencies } from "../packages/core/src/runs/start-driver-dependencies.ts"
import { createTestDbRuntimeFixture, type TestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let dbRuntime: TestDbRuntimeFixture

beforeEach(() => {
  dbRuntime = createTestDbRuntimeFixture("knowbee-run-start-driver-")
})

afterEach(() => {
  dbRuntime.dispose()
})

describe("start driver dependencies", () => {
  it("tracks synthetic approval scopes and builds delegation state accessors", () => {
    const scopes = new Set<string>()
    const { driverDependencies, finalizationDependencies } = buildStartRootRunDriverDependencies({
      runId: "run-1",
      sessionId: "session-1",
      requestGroupId: "group-1",
      source: "webui",
      onChunk: undefined,
      message: "hello",
      model: "gpt-test",
      workDir: "/tmp",
      config: {
        orchestration: { maxDelegationTurns: 7 },
        security: { approvalTimeout: 30, approvalTimeoutFallback: "deny" },
      },
      canonicalPolicyTools: [],
      reuseConversationContext: false,
      activeQueueCancellationMode: null,
      startNestedRootRun: vi.fn(() => ({ finished: Promise.resolve(undefined) })),
      syntheticApprovalScopes: scopes,
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    })

    expect(driverDependencies.getSyntheticApprovalAlreadyApproved("capture_probe")).toBe(false)
    driverDependencies.rememberRunApprovalScope("run-1", "capture_probe")
    expect(scopes.has("run-1\u0000capture_probe")).toBe(true)
    expect(driverDependencies.getSyntheticApprovalAlreadyApproved("capture_probe")).toBe(true)
    expect(driverDependencies.getSyntheticApprovalAlreadyApproved("delivery_probe")).toBe(false)
    expect(driverDependencies.getDelegationTurnState().maxTurns).toBe(7)
    expect(finalizationDependencies.appendRunEvent).toBeTypeOf("function")
  })

  it("builds synthetic approval runtime from explicit runtime config", () => {
    const { syntheticApprovalRuntimeDependencies } = buildStartRootRunDriverDependencies({
      runId: "run-2",
      sessionId: "session-2",
      requestGroupId: "group-2",
      source: "webui",
      onChunk: undefined,
      message: "hello",
      model: "gpt-test",
      workDir: "/tmp",
      config: {
        orchestration: { maxDelegationTurns: 3 },
        security: { approvalTimeout: 45, approvalTimeoutFallback: "allow" },
      },
      canonicalPolicyTools: [],
      reuseConversationContext: false,
      activeQueueCancellationMode: null,
      startNestedRootRun: vi.fn(() => ({ finished: Promise.resolve(undefined) })),
      syntheticApprovalScopes: new Set<string>(),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    })

    expect(syntheticApprovalRuntimeDependencies.timeoutSec).toBe(45)
    expect(syntheticApprovalRuntimeDependencies.fallback).toBe("allow_once")
  })

  it("does not read global config inside the start driver dependency factory", () => {
    const source = readFileSync("packages/core/src/runs/start-driver-dependencies.ts", "utf-8")

    expect(source).not.toContain("getConfig(")
    expect(source).toContain("config: StartRootRunDriverRuntimeConfig")
    expect(source).toContain("params.config.orchestration.maxDelegationTurns")
    expect(source).toContain("params.config.security.approvalTimeout")
  })

  it("defers capability admission to the validated solution plan without a selection call", () => {
    const dependencySource = readFileSync(
      "packages/core/src/runs/start-driver-dependencies.ts",
      "utf-8",
    )
    const startSource = readFileSync("packages/core/src/runs/start.ts", "utf-8")
    const policyIndex = dependencySource.indexOf("buildCanonicalIntakePlanPolicy({")
    const policyReceiptIndex = dependencySource.indexOf(
      "recordCanonicalIntakePlanPolicy(policy.descriptor",
    )

    expect(policyIndex).toBeGreaterThan(-1)
    expect(policyReceiptIndex).toBeGreaterThan(policyIndex)
    expect(dependencySource).not.toContain("await authorizeCanonicalCapabilitySelection({")
    expect(startSource).toContain("projectCapabilitySelectionCatalog({")
    expect(startSource).toContain("loadInstructionSkillSnapshots(")
    expect(startSource).toContain("instructionSkills: instructionSkillSnapshot.snapshots")
    expect(startSource).toContain("createRuntimeCapabilitySelectionProvider({")
    expect(startSource).toContain("capabilitySelection: {")
    expect(dependencySource).toContain("pendingCapabilityAdmissionContext")
    expect(dependencySource).toContain(
      "createSolutionPlanCapabilityExecutionScope({",
    )
    expect(dependencySource).toContain(
      "getAdmittedCapabilityExecutionScope: () => admittedCapabilityExecutionScope",
    )
  })
})
