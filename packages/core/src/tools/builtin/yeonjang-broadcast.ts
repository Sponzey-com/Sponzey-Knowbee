import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { recordArtifactMetadata, buildArtifactAccessDescriptor } from "../../artifacts/lifecycle.js"
import {
  buildYeonjangBroadcastIntentSchemaProperty,
  buildYeonjangBroadcastRetryReceiptSchemaProperty,
  type YeonjangBroadcastIntent,
  type YeonjangBroadcastRetryReceipt,
  type YeonjangBroadcastToolName,
} from "../../contracts/yeonjang-broadcast.js"
import { recordMessageLedgerEvent } from "../../runs/message-ledger.js"
import type { AgentTool, ToolContext, ToolResult } from "../types.js"
import { getMqttExtensionSnapshots } from "../../mqtt/broker.js"
import { PATHS } from "../../config/index.js"
import { withYeonjangRequestMetadata } from "./yeonjang-request-metadata.js"
import {
  buildYeonjangBroadcastAggregateSummary,
  buildYeonjangBroadcastArtifactPath,
  planYeonjangBroadcastRun,
  type YeonjangBroadcastTargetExecutionRecord,
} from "../../yeonjang/broadcast.js"
import { recordYeonjangGovernanceAudit } from "../../yeonjang/registry.js"
import { getYeonjangBroadcastPolicy } from "../../yeonjang/broadcast-policy.js"
import {
  captureScreenViaYeonjang,
  classifyYeonjangScreenCaptureFailure,
  extensionFromScreenCaptureMimeType,
  preflightYeonjangScreenCapture,
  statArtifactSize,
} from "./ui/yeonjang-screen-shared.js"
import { buildYeonjangTargetSelectorSchemaProperty, type YeonjangTargetSelector } from "../../contracts/yeonjang-target.js"

interface YeonjangBroadcastRunParams {
  toolName: YeonjangBroadcastToolName
  toolParams?: Record<string, unknown>
  targetSelector: YeonjangTargetSelector
  broadcastIntent: YeonjangBroadcastIntent
  retryReceipt?: YeonjangBroadcastRetryReceipt
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "artifact"
}

function buildBroadcastSummaryText(params: {
  toolName: string
  totalTargets: number
  successCount: number
  failedCount: number
  skippedCount: number
}): string {
  return [
    `Yeonjang broadcast ${params.toolName} 완료.`,
    `대상 ${params.totalTargets}개`,
    `성공 ${params.successCount}개`,
    `실패 ${params.failedCount}개`,
    `건너뜀 ${params.skippedCount}개`,
  ].join(" · ")
}

function recordBroadcastLedgerEvent(params: {
  ctx: ToolContext
  eventKind: "tool_started" | "tool_done" | "tool_failed"
  summary: string
  detail: Record<string, unknown>
  idempotencyKey: string
  status: "started" | "succeeded" | "failed" | "skipped" | "degraded"
}): void {
  recordMessageLedgerEvent({
    runId: params.ctx.runId,
    requestGroupId: params.ctx.requestGroupId ?? params.ctx.runId,
    sessionKey: params.ctx.sessionId,
    channel: params.ctx.source,
    eventKind: params.eventKind,
    idempotencyKey: params.idempotencyKey,
    status: params.status,
    summary: params.summary,
    detail: params.detail,
  })
}

async function executeBroadcastScreenCapture(
  params: YeonjangBroadcastRunParams,
  ctx: ToolContext,
): Promise<ToolResult> {
  const snapshots = getMqttExtensionSnapshots()
  const policy = getYeonjangBroadcastPolicy(params.toolName)
  const planned = planYeonjangBroadcastRun({
    toolName: params.toolName,
    targetSelector: params.targetSelector,
    broadcastIntent: params.broadcastIntent,
    ...(params.retryReceipt ? { retryReceipt: params.retryReceipt } : {}),
    snapshots,
    policy,
  })
  if (!planned.ok) {
    return {
      success: false,
      output: planned.message,
      error: planned.code,
      details: {
        reasonCodes: planned.reasonCodes,
        ...(planned.details ?? {}),
      },
    }
  }

  const rootDir = join(PATHS.stateDir, "artifacts", "yeonjang", "broadcast")
  const executionRecords: YeonjangBroadcastTargetExecutionRecord[] = []
  recordBroadcastLedgerEvent({
    ctx,
    eventKind: "tool_started",
    idempotencyKey: `yeonjang-broadcast:${planned.plan.broadcastRunId}:plan`,
    status: "started",
    summary: `yeonjang broadcast plan created: ${planned.plan.toolName}`,
    detail: {
      kind: "yeonjang_broadcast_plan",
      broadcastRunId: planned.plan.broadcastRunId,
      trace: planned.plan.trace,
      targets: planned.plan.targets,
      skippedTargets: planned.plan.skippedTargets,
    },
  })
  recordYeonjangGovernanceAudit({
    action: "yeonjang_broadcast_execution_approved",
    actor: `runtime:${ctx.source}`,
    reason: "explicit_broadcast_intent",
    detail: {
      toolName: planned.plan.toolName,
      broadcastRunId: planned.plan.broadcastRunId,
      requestGroupId: ctx.requestGroupId ?? ctx.runId,
      runId: ctx.runId,
      sessionId: ctx.sessionId,
      selector: planned.plan.selector,
      broadcastIntent: planned.plan.broadcastIntent,
      retryReceipt: planned.plan.trace.retryReceipt,
      targets: planned.plan.targets.map((target) => ({
        instanceId: target.instanceId,
        instanceAlias: target.instanceAlias,
        displayName: target.displayName,
        extensionId: target.extensionId,
        sessionId: target.sessionId,
        trustState: target.trustState,
      })),
      skippedTargets: planned.plan.skippedTargets,
    },
  })

  for (const target of planned.plan.targets) {
    const targetSummary = `${planned.plan.toolName} broadcast target ${target.broadcastIndex + 1}/${target.broadcastTotal}: ${target.instanceAlias}`
    ctx.onProgress(targetSummary)
    const yeonjangOptions = withYeonjangRequestMetadata(ctx, {
      extensionId: target.extensionId,
      metadata: {
        ...(target.sessionId ? { targetSessionId: target.sessionId } : {}),
        broadcastRunId: planned.plan.broadcastRunId,
        broadcastIndex: target.broadcastIndex,
        broadcastTotal: target.broadcastTotal,
      },
    })
    try {
      const preflight = await preflightYeonjangScreenCapture(yeonjangOptions)
      if (preflight) {
        executionRecords.push({
          status: "failed",
          broadcastIndex: target.broadcastIndex,
          instanceId: target.instanceId,
          extensionId: target.extensionId,
          sessionId: target.sessionId,
          instanceAlias: target.instanceAlias,
          displayName: target.displayName,
          reasonCodes: ["screen_capture_preflight_failed"],
          output: preflight.output,
          ...(preflight.error ? { error: preflight.error } : {}),
        })
        recordBroadcastLedgerEvent({
          ctx,
          eventKind: "tool_failed",
          idempotencyKey: `yeonjang-broadcast:${planned.plan.broadcastRunId}:${target.instanceId}:preflight`,
          status: "failed",
          summary: `${targetSummary} preflight failed`,
          detail: {
            kind: "yeonjang_broadcast_target_receipt",
            broadcastRunId: planned.plan.broadcastRunId,
            target,
            output: preflight.output,
            error: preflight.error ?? null,
          },
        })
        continue
      }
      const display = typeof params.toolParams?.display === "number" ? params.toolParams.display : undefined
      const { base64, remote } = await captureScreenViaYeonjang({
        options: yeonjangOptions,
        ...(display !== undefined ? { display } : {}),
      })
      const fileName = sanitizeFileName(
        remote.file_name
          ?? `screen-capture-${target.broadcastIndex + 1}.${extensionFromScreenCaptureMimeType(remote.mime_type)}`,
      )
      const artifactPath = buildYeonjangBroadcastArtifactPath({
        broadcastRunId: planned.plan.broadcastRunId,
        instanceId: target.instanceId,
        sessionId: target.sessionId,
        fileName,
        rootDir,
      })
      mkdirSync(join(rootDir, planned.plan.broadcastRunId, target.instanceId, target.sessionId ?? "session-unknown"), { recursive: true })
      writeFileSync(artifactPath, Buffer.from(base64, "base64"))
      const sizeBytes = statArtifactSize(artifactPath)
      const artifactId = recordArtifactMetadata({
        artifactPath,
        ownerChannel: ctx.source,
        channelTarget: ctx.sessionId,
        sourceRunId: ctx.runId,
        requestGroupId: ctx.requestGroupId ?? ctx.runId,
        mimeType: remote.mime_type ?? "image/png",
        sizeBytes,
        metadata: {
          kind: "yeonjang_broadcast_artifact",
          broadcastRunId: planned.plan.broadcastRunId,
          instanceId: target.instanceId,
          extensionId: target.extensionId,
          sessionId: target.sessionId,
        },
      })
      const artifact = buildArtifactAccessDescriptor({
        filePath: artifactPath,
        mimeType: remote.mime_type ?? "image/png",
        sizeBytes,
      })
      executionRecords.push({
        status: "succeeded",
        broadcastIndex: target.broadcastIndex,
        instanceId: target.instanceId,
        extensionId: target.extensionId,
        sessionId: target.sessionId,
        instanceAlias: target.instanceAlias,
        displayName: target.displayName,
        reasonCodes: ["broadcast_target_succeeded"],
        output: remote.message,
        artifactPath,
        artifact,
      })
      recordBroadcastLedgerEvent({
        ctx,
        eventKind: "tool_done",
        idempotencyKey: `yeonjang-broadcast:${planned.plan.broadcastRunId}:${target.instanceId}:result`,
        status: "succeeded",
        summary: `${targetSummary} succeeded`,
        detail: {
          kind: "yeonjang_broadcast_target_receipt",
          broadcastRunId: planned.plan.broadcastRunId,
          target,
          artifactId,
          artifactPath,
          sizeBytes,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const classified = classifyYeonjangScreenCaptureFailure(message)
      executionRecords.push({
        status: "failed",
        broadcastIndex: target.broadcastIndex,
        instanceId: target.instanceId,
        extensionId: target.extensionId,
        sessionId: target.sessionId,
        instanceAlias: target.instanceAlias,
        displayName: target.displayName,
        reasonCodes: [classified.code],
        output: classified.output,
        error: classified.code,
      })
      recordBroadcastLedgerEvent({
        ctx,
        eventKind: "tool_failed",
        idempotencyKey: `yeonjang-broadcast:${planned.plan.broadcastRunId}:${target.instanceId}:result`,
        status: "failed",
        summary: `${targetSummary} failed`,
        detail: {
          kind: "yeonjang_broadcast_target_receipt",
          broadcastRunId: planned.plan.broadcastRunId,
          target,
          error: classified.code,
          output: classified.output,
        },
      })
    }
  }

  const summary = buildYeonjangBroadcastAggregateSummary({
    broadcastRunId: planned.plan.broadcastRunId,
    records: executionRecords,
    skippedTargets: planned.plan.skippedTargets,
    retryTrace: planned.plan.trace.retryReceipt,
  })
  const output = buildBroadcastSummaryText({
    toolName: planned.plan.toolName,
    totalTargets: summary.totalTargets,
    successCount: summary.successCount,
    failedCount: summary.failedCount,
    skippedCount: summary.skippedCount,
  })
  return {
    success: summary.successCount > 0,
    output,
    ...(summary.successCount > 0 || summary.failedCount === 0
      ? {}
      : { error: "YEONJANG_BROADCAST_FAILED" }),
    details: {
      kind: "yeonjang_broadcast_result",
      broadcastRunId: planned.plan.broadcastRunId,
      policy: planned.plan.policy,
      planReceipt: planned.plan.trace,
      summaryReceipt: summary,
      retryReceipt: planned.plan.trace.retryReceipt,
      targetReceipts: executionRecords,
      skippedTargets: planned.plan.skippedTargets,
    },
  }
}

export const yeonjangBroadcastRunTool: AgentTool<YeonjangBroadcastRunParams> = {
  name: "yeonjang_broadcast_run",
  description: "명시적 broadcast intent가 있을 때 같은 Yeonjang 작업을 여러 인스턴스에 fan-out 하고 결과를 취합합니다.",
  parameters: {
    type: "object",
    properties: {
      toolName: {
        type: "string",
        enum: ["screen_capture", "screen_find_text", "shell_exec", "mouse_action", "keyboard_action"],
        description: "broadcast할 도구 이름. 현재는 screen_capture만 실행되고 나머지는 정책상 기본 차단됩니다.",
      },
      toolParams: {
        type: "object",
        description: "선택한 도구에 넘길 파라미터. 현재 screen_capture는 display만 사용합니다.",
        additionalProperties: true,
      },
      targetSelector: buildYeonjangTargetSelectorSchemaProperty(),
      broadcastIntent: buildYeonjangBroadcastIntentSchemaProperty(),
      retryReceipt: buildYeonjangBroadcastRetryReceiptSchemaProperty(),
    },
    required: ["toolName", "targetSelector", "broadcastIntent"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params, ctx): Promise<ToolResult> {
    const policy = getYeonjangBroadcastPolicy(params.toolName)
    if (policy.defaultDecision === "deny") {
      return {
        success: false,
        output: policy.userMessage,
        error: policy.approvalRequired
          ? "YEONJANG_BROADCAST_APPROVAL_REQUIRED"
          : "YEONJANG_BROADCAST_POLICY_DENIED",
        details: {
          kind: "yeonjang_broadcast_policy_denied",
          policy,
        },
      }
    }
    if (params.toolName !== "screen_capture") {
      return {
        success: false,
        output: `${params.toolName} broadcast는 아직 구현되지 않았습니다. task004 baseline에서는 screen_capture만 fan-out 실행합니다.`,
        error: "YEONJANG_BROADCAST_NOT_IMPLEMENTED",
        details: {
          kind: "yeonjang_broadcast_not_implemented",
          toolName: params.toolName,
        },
      }
    }
    return executeBroadcastScreenCapture(params, ctx)
  },
}
