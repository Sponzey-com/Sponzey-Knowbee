import type {
  YeonjangBrowserFocusCommandContractDecision,
  YeonjangBrowserFocusTargetProjection,
} from "../../capabilities/yeonjang-browser-focus-contract.js"
import { evaluateYeonjangBrowserFocusPostCheck } from "../../capabilities/yeonjang-browser-focus-contract.js"
import type { ToolContext, ToolResult, ToolSideEffectContract, ToolSideEffectObservation } from "../types.js"

export interface CreateYeonjangBrowserFocusSideEffectInput<TParams> {
  target(params: TParams, ctx: ToolContext): YeonjangBrowserFocusTargetProjection
  targetRef(params: TParams, ctx: ToolContext): string
  expectedState(params: TParams, ctx: ToolContext): {
    method: "browser.focus"
    target: YeonjangBrowserFocusTargetProjection
    commandContract: YeonjangBrowserFocusCommandContractDecision
  }
}

export function createYeonjangBrowserFocusSideEffect<TParams>(
  input: CreateYeonjangBrowserFocusSideEffectInput<TParams>,
): ToolSideEffectContract<TParams> {
  return {
    effectClass: "external_write",
    compensationSupport: "irreversible",
    targetRef: input.targetRef,
    expectedState: input.expectedState,
    observe: async (params, ctx, result): Promise<ToolSideEffectObservation> => {
      const expectedState = input.expectedState(params, ctx)
      const observation = buildBrowserFocusObservedState(result, input.target(params, ctx), expectedState)
      return {
        available: observation.verified,
        targetRef: input.targetRef(params, ctx),
        expectedState,
        observedState: observation.observedState,
      }
    },
  }
}

function buildBrowserFocusObservedState(
  result: ToolResult,
  target: YeonjangBrowserFocusTargetProjection,
  expectedState: ReturnType<CreateYeonjangBrowserFocusSideEffectInput<unknown>["expectedState"]>,
): {
  verified: boolean
  observedState: unknown
} {
  const details = result.details as {
    commandAccepted?: unknown
    observedFocusedTarget?: unknown
    postCheck?: { state?: unknown; reasonCode?: unknown }
  } | undefined
  const observedFocusedTarget = isFocusTargetProjection(details?.observedFocusedTarget)
    ? details.observedFocusedTarget
    : undefined
  const evaluated = evaluateYeonjangBrowserFocusPostCheck({
    commandAccepted: result.success === true && details?.commandAccepted === true,
    expectedTarget: target,
    ...(observedFocusedTarget ? { observedFocusedTarget } : {}),
  })
  if (evaluated.state === "VERIFIED") {
    return {
      verified: true,
      observedState: expectedState,
    }
  }
  return {
    verified: false,
    observedState: {
      method: "browser.focus",
      commandAccepted: details?.commandAccepted === true,
      target,
      ...(observedFocusedTarget ? { observedFocusedTarget } : {}),
      postCheck: {
        state: evaluated.state,
        reasonCode: evaluated.reasonCode,
      },
    },
  }
}

function isFocusTargetProjection(value: unknown): value is YeonjangBrowserFocusTargetProjection {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<YeonjangBrowserFocusTargetProjection>
  return (
    candidate.schemaVersion === "yeonjang-browser-focus-target-v1" &&
    candidate.targetKind === "browser_window_or_tab" &&
    typeof candidate.displayName === "string" &&
    Array.isArray(candidate.publicEvidenceFields) &&
    Array.isArray(candidate.auditOnlyFields)
  )
}
