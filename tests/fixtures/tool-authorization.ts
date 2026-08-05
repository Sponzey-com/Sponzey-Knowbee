import { hashApprovalParams } from "../../packages/core/src/runs/approval-registry.ts"
import type { ToolContext } from "../../packages/core/src/tools/types.ts"

export function withToolAuthorization(
  ctx: ToolContext,
  toolName: string,
  params: Record<string, unknown>,
): ToolContext {
  return {
    ...ctx,
    authorizationReceipt: {
      policyDecisionId: "policy-decision:test",
      toolName,
      paramsHash: hashApprovalParams(params),
      runId: ctx.runId,
      requestGroupId: ctx.requestGroupId ?? ctx.runId,
      approvalDecision: "allow_once",
      approvalId: "approval:test",
    },
  }
}
