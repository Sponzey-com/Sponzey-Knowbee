import { createHash } from "node:crypto"
import type { YeonjangRequestMetadata } from "../yeonjang/mqtt-client.js"
import type { YeonjangLiveSmokeReadOnlyMethod } from "./yeonjang-live-smoke.js"
import type {
  YeonjangLiveSmokeExecutePort,
  YeonjangLiveSmokeExecutionInput,
} from "./yeonjang-live-smoke-runner.js"

export interface YeonjangLiveInvokeOptions {
  readonly extensionId: string
  readonly timeoutMs: number
  readonly metadata: YeonjangRequestMetadata
}

export type YeonjangLiveInvokePort = (
  method: YeonjangLiveSmokeReadOnlyMethod,
  params: Record<string, unknown>,
  options: YeonjangLiveInvokeOptions,
) => Promise<unknown>

export interface YeonjangLiveAuditEvent {
  readonly runId: string
  readonly requestGroupId: string
  readonly commandId: string
  readonly instanceId: string
  readonly sessionId: string
  readonly method: YeonjangLiveSmokeReadOnlyMethod
  readonly evidenceRef: string
}

function evidenceHash(input: {
  runId: string
  commandId: string
  instanceId: string
  sessionId: string
  method: YeonjangLiveSmokeReadOnlyMethod
  params: Readonly<Record<string, unknown>>
  response: unknown
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

export function createYeonjangLiveTransportAdapter(input: {
  readonly invoke: YeonjangLiveInvokePort
  readonly timeoutMs: number
  readonly createCommandId: () => string
  readonly createAuditCorrelationId: () => string
  readonly recordAuditEvent: (event: YeonjangLiveAuditEvent) => string | null
}): YeonjangLiveSmokeExecutePort {
  if (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new Error("yeonjang_live_timeout_invalid")
  }
  return async (execution: YeonjangLiveSmokeExecutionInput) => {
    if (execution.signal.aborted) throw new Error("yeonjang_smoke_cancelled")
    const scenario = execution.selection.scenario
    const params = { ...(scenario.params ?? {}) }
    const commandId = input.createCommandId().trim()
    const auditId = input.createAuditCorrelationId().trim()
    if (!commandId || !auditId) throw new Error("yeonjang_live_correlation_invalid")
    const response = await input.invoke(
      scenario.expectedMethod,
      params,
      {
        extensionId: scenario.expectedInstanceId,
        timeoutMs: input.timeoutMs,
        metadata: {
          runId: execution.runId,
          requestGroupId: execution.runId,
          targetSessionId: scenario.expectedSessionId,
          commandId,
          auditId,
        },
      },
    )
    if (execution.signal.aborted) throw new Error("yeonjang_smoke_cancelled")
    const evidenceRef = `tool-result:yeonjang:${evidenceHash({
      runId: execution.runId,
      commandId,
      instanceId: scenario.expectedInstanceId,
      sessionId: scenario.expectedSessionId,
      method: scenario.expectedMethod,
      params,
      response,
    })}`
    const auditEventId = input.recordAuditEvent({
      runId: execution.runId,
      requestGroupId: execution.runId,
      commandId,
      instanceId: scenario.expectedInstanceId,
      sessionId: scenario.expectedSessionId,
      method: scenario.expectedMethod,
      evidenceRef,
    })
    return {
      command: {
        runId: execution.runId,
        requestGroupId: execution.runId,
        commandId,
        instanceId: scenario.expectedInstanceId,
        sessionId: scenario.expectedSessionId,
        method: scenario.expectedMethod,
        readOnly: true,
        deliveryStatus: "acked",
      },
      observedResult: {
        runId: execution.runId,
        commandId,
        instanceId: scenario.expectedInstanceId,
        sessionId: scenario.expectedSessionId,
        status: "observed",
        evidenceRef,
      },
      auditEventId,
      diagnosisPayload: response,
    }
  }
}
