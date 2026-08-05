import { createHash } from "node:crypto"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import { buildSideEffectOperationIdentity } from "../contracts/side-effect-operation.js"
import type { ApprovalOperationBinding } from "../runs/approval-registry.js"
import type { AnyTool, ToolContext } from "./types.js"

const ARTIFACT_REF_PATTERN = /^artifact:[0-9a-f-]{36}$/iu

function fingerprint(value: unknown): `sha256:${string}` {
  const canonical = JSON.stringify(value, Object.keys(value as object).sort())
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`
}

export interface ApprovedArtifactDeliveryOperation {
  readonly binding: ApprovalOperationBinding
  readonly artifactRef: string
  readonly targetFingerprint: `sha256:${string}`
  readonly authorizationParams: Readonly<{
    operationId: string
    operationBindingHash: `sha256:${string}`
    artifactRef: string
    targetFingerprint: `sha256:${string}`
  }>
}

export type ResolveApprovedArtifactDeliveryOperationResult =
  | { readonly status: "not_required" }
  | {
      readonly status: "rejected"
      readonly reasonCode:
        | "approved_artifact_delivery_channel_mismatch"
        | "approved_artifact_delivery_ref_required"
    }
  | {
      readonly status: "resolved"
      readonly operation: ApprovedArtifactDeliveryOperation
    }

export function resolveApprovedArtifactDeliveryOperation(input: {
  tool: Pick<AnyTool, "name" | "channelCapability">
  params: Readonly<Record<string, unknown>>
  ctx: Pick<ToolContext, "runId" | "requestGroupId" | "sessionId" | "source">
}): ResolveApprovedArtifactDeliveryOperationResult {
  const capability = input.tool.channelCapability
  if (capability?.kind !== "direct_artifact_delivery") {
    return { status: "not_required" }
  }
  if (
    input.ctx.source !== capability.channel
    || capability.channel !== "telegram"
  ) {
    return {
      status: "rejected",
      reasonCode: "approved_artifact_delivery_channel_mismatch",
    }
  }
  const artifactRef =
    typeof input.params.artifactRef === "string"
      ? input.params.artifactRef.trim()
      : ""
  if (!ARTIFACT_REF_PATTERN.test(artifactRef)) {
    return {
      status: "rejected",
      reasonCode: "approved_artifact_delivery_ref_required",
    }
  }
  const targetFingerprint = fingerprint({
    schemaVersion: 1,
    channel: capability.channel,
    sessionId: input.ctx.sessionId,
  })
  const paramsFingerprint = fingerprint({
    schemaVersion: 1,
    artifactRef,
  })
  const identity = buildSideEffectOperationIdentity({
    runId: input.ctx.runId,
    workId: canonicalWorkIdForRootRun(input.ctx.runId),
    stepKey: "delivering",
    adapterId: `channel:${capability.channel}:artifact`,
    targetFingerprint,
    paramsFingerprint,
  })
  const operationBindingHash = fingerprint({
    schemaVersion: 1,
    operationId: identity.operationId,
    targetFingerprint,
    paramsFingerprint,
    requestGroupId:
      input.ctx.requestGroupId ?? input.ctx.runId,
  })
  const binding: ApprovalOperationBinding = Object.freeze({
    operationId: identity.operationId,
    operationBindingHash,
    continuationSchemaVersion: 1,
  })
  return {
    status: "resolved",
    operation: Object.freeze({
      binding,
      artifactRef,
      targetFingerprint,
      authorizationParams: Object.freeze({
        operationId: binding.operationId,
        operationBindingHash: binding.operationBindingHash,
        artifactRef,
        targetFingerprint,
      }),
    }),
  }
}
