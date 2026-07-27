import { createHash } from "node:crypto"
import type { ToolContext, ToolResult, ToolSideEffectContract, ToolSideEffectObservation } from "../types.js"
import { DEFAULT_YEONJANG_EXTENSION_ID } from "../../yeonjang/mqtt-client.js"
import type { YeonjangTargetedToolParams } from "./yeonjang-target.js"

type ExpectedStateBuilder<TParams extends YeonjangTargetedToolParams> = (
  params: TParams,
  ctx: ToolContext,
) => Record<string, unknown>

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export function hashSideEffectText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function hashSideEffectValue(value: unknown): string {
  return createHash("sha256").update(stable(value), "utf8").digest("hex")
}

function yeonjangTargetRef(params: YeonjangTargetedToolParams): string {
  const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID
  const sessionId = params.targetSessionId?.trim()
  return sessionId ? `${extensionId}#${sessionId}` : extensionId
}

export function createYeonjangControlSideEffect<TParams extends YeonjangTargetedToolParams>(input: {
  method: string
  expectedState: ExpectedStateBuilder<TParams>
  observeState?: (
    params: TParams,
    ctx: ToolContext,
    result: ToolResult,
    expectedState: Record<string, unknown>,
  ) => Promise<{ verified: boolean; observedState: Record<string, unknown> }>
  observeVerifiedState?: (
    params: TParams,
    ctx: ToolContext,
    result: ToolResult,
    expectedState: Record<string, unknown>,
  ) => Promise<boolean>
}): ToolSideEffectContract<TParams> {
  const targetRef = (params: TParams, _ctx: ToolContext): string => `yeonjang:${yeonjangTargetRef(params)}:${input.method}`
  const observe = async (
    params: TParams,
    ctx: ToolContext,
    result: ToolResult,
  ): Promise<ToolSideEffectObservation> => {
    const expectedState = input.expectedState(params, ctx)
    const stateObservation = input.observeState
      ? await input.observeState(params, ctx, result, expectedState)
      : undefined
    const verified = result.success && (stateObservation
      ? stateObservation.verified
      : input.observeVerifiedState
        ? await input.observeVerifiedState(params, ctx, result, expectedState)
        : false)
    return {
      available: verified,
      targetRef: targetRef(params, ctx),
      expectedState,
      observedState: stateObservation
        ? stateObservation.observedState
        : verified
        ? expectedState
        : {
            accepted: false,
            reason: result.success
              ? "target_observation_required"
              : result.error ?? `${input.method}_not_verified`,
          },
    }
  }

  return {
    effectClass: "external_write",
    compensationSupport: "irreversible",
    targetRef,
    expectedState: input.expectedState,
    observe,
  }
}
