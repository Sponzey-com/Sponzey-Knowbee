import { describe, expect, it, vi } from "vitest"
import type { LiveAcceptanceCapability } from "../packages/core/src/release/live-acceptance-admission.ts"
import type {
  LiveAcceptanceBundleApproval,
  LiveAcceptanceBundleCandidate,
} from "../packages/core/src/release/live-acceptance-bundle.ts"
import {
  type LiveAcceptanceRunnerPort,
  createSigningRequestPayloadSink,
  runLiveAcceptanceCollection,
} from "../packages/core/src/release/live-acceptance-runner.ts"

const NOW = Date.parse("2026-07-17T10:30:00.000Z")
const candidate: LiveAcceptanceBundleCandidate = {
  appVersion: "1.2.3",
  gitTag: "v1.2.3",
  gitCommit: "abc1234",
}
const approval: LiveAcceptanceBundleApproval = {
  decision: "approved",
  authorizationStatus: "active",
  authorizationId: "authorization:runner:159",
  auditEventId: "audit:runner:159",
  principalType: "authenticated_user",
  principalId: "operator:159",
  authenticationId: "authentication:159",
  roles: ["release_administrator"],
  approvedAt: NOW - 1_000,
  expiresAt: NOW + 60_000,
  redactionStatus: "verified",
}

function port(
  id: string,
  capabilities: LiveAcceptanceCapability[],
  calls: string[],
): LiveAcceptanceRunnerPort {
  return {
    execute: vi.fn(async ({ candidate: observed, requiredCapabilities }) => {
      calls.push(id)
      expect(observed).toEqual(candidate)
      expect(requiredCapabilities).toEqual(capabilities)
      return {
        status: "produced" as const,
        result: {
          accepted: capabilities.map((capability) => ({
            evidenceRef: `live:${capability}:runner-159`,
            capability,
            scenarioId: `${capability}-live`,
            terminalStatus: "passed" as const,
            auditEventId: `audit:${capability}:runner-159`,
            executedAt: NOW - 1_000,
            redactionStatus: "verified" as const,
          })),
          rejected: [],
        },
      }
    }),
  }
}

function ports(calls: string[]) {
  return {
    channels: port("channels", ["webui", "telegram", "slack"], calls),
    web: port("web", ["web"], calls),
    extensions: port("extensions", ["skill", "mcp"], calls),
    yeonjang: port("yeonjang", ["yeonjang"], calls),
  }
}

function sink() {
  return { write: vi.fn(async () => ({ status: "written" as const })) }
}

describe("Task 159 production-like live runner", () => {
  it("executes candidate-bound ports in fixed order and returns only a complete payload", async () => {
    const calls: string[] = []
    const payloadSink = sink()
    const result = await runLiveAcceptanceCollection({
      candidate,
      approval,
      ports: ports(calls),
      payloadSink,
      failurePolicy: "continue_diagnostics",
      now: NOW,
      maxEvidenceAgeMs: 60_000,
      isCancelled: () => false,
    })
    expect(calls).toEqual(["channels", "web", "extensions", "yeonjang"])
    expect(result).toMatchObject({ status: "collected" })
    expect(result.events.at(-1)).toEqual({ state: "payload_written" })
    expect(payloadSink.write).toHaveBeenCalledOnce()
  })

  it("continues diagnostic ports after an unavailable stage without emitting a payload", async () => {
    const calls: string[] = []
    const configured = ports(calls)
    const payloadSink = sink()
    configured.web.execute = vi.fn(async () => {
      calls.push("web")
      return { status: "unavailable", reasonCode: "credential_unavailable" }
    })
    const result = await runLiveAcceptanceCollection({
      candidate,
      approval,
      ports: configured,
      payloadSink,
      failurePolicy: "continue_diagnostics",
      now: NOW,
      maxEvidenceAgeMs: 60_000,
      isCancelled: () => false,
    })
    expect(calls).toEqual(["channels", "web", "extensions", "yeonjang"])
    expect(result.status).toBe("blocked")
    expect(result).not.toHaveProperty("payload")
    expect(payloadSink.write).not.toHaveBeenCalled()
  })

  it("stops after the first failed stage when explicitly configured", async () => {
    const calls: string[] = []
    const configured = ports(calls)
    const payloadSink = sink()
    configured.web.execute = vi.fn(async () => {
      calls.push("web")
      return { status: "unavailable", reasonCode: "credential_unavailable" }
    })
    const result = await runLiveAcceptanceCollection({
      candidate,
      approval,
      ports: configured,
      payloadSink,
      failurePolicy: "stop_on_failure",
      now: NOW,
      maxEvidenceAgeMs: 60_000,
      isCancelled: () => false,
    })
    expect(calls).toEqual(["channels", "web"])
    expect(result.status).toBe("blocked")
    expect(payloadSink.write).not.toHaveBeenCalled()
  })

  it("stops new calls after cancellation", async () => {
    const calls: string[] = []
    let checks = 0
    const payloadSink = sink()
    const result = await runLiveAcceptanceCollection({
      candidate,
      approval,
      ports: ports(calls),
      payloadSink,
      failurePolicy: "continue_diagnostics",
      now: NOW,
      maxEvidenceAgeMs: 60_000,
      isCancelled: () => {
        checks += 1
        return checks > 1
      },
    })
    expect(calls).toEqual(["channels"])
    expect(result.status).toBe("cancelled")
    expect(result).not.toHaveProperty("payload")
    expect(payloadSink.write).not.toHaveBeenCalled()
  })

  it("fails closed when the payload sink rejects the write", async () => {
    const calls: string[] = []
    const payloadSink = {
      write: vi.fn(async () => ({
        status: "rejected" as const,
        reasonCode: "live_payload_output_exists",
      })),
    }
    const result = await runLiveAcceptanceCollection({
      candidate,
      approval,
      ports: ports(calls),
      payloadSink,
      failurePolicy: "continue_diagnostics",
      now: NOW,
      maxEvidenceAgeMs: 60_000,
      isCancelled: () => false,
    })
    expect(result).toMatchObject({
      status: "blocked",
      blockers: [{ capability: "collection", reasonCode: "live_payload_output_exists" }],
    })
    expect(result).not.toHaveProperty("payload")
  })

  it("passes a complete payload to the Task 158 unsigned signing-request boundary", async () => {
    const calls: string[] = []
    const requestSink = { write: vi.fn(async () => ({ status: "written" as const })) }
    const payloadSink = createSigningRequestPayloadSink({
      candidate,
      requestedKeyId: `sha256:${"1".repeat(64)}`,
      now: NOW,
      requestSink,
    })
    const result = await runLiveAcceptanceCollection({
      candidate,
      approval,
      ports: ports(calls),
      payloadSink,
      failurePolicy: "continue_diagnostics",
      now: NOW,
      maxEvidenceAgeMs: 60_000,
      isCancelled: () => false,
    })
    expect(result.status).toBe("collected")
    expect(requestSink.write).toHaveBeenCalledOnce()
    const request = requestSink.write.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      kind: "knowbee.release.live_acceptance_signing_request",
      requestedKeyId: `sha256:${"1".repeat(64)}`,
    })
    expect(JSON.stringify(request)).not.toMatch(/signatureBase64|privateKey|rawResult/u)
  })
})
