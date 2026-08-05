import type { ApprovalDecision, ApprovalKind, ApprovalResolutionReason } from "../events/index.js"
import {
  buildApprovalRequestControl,
  renderApprovalRequestControlText,
} from "./interactive-control.js"
import type { InteractiveControlText } from "./interactive-control.js"

export interface ApprovalAggregateItem {
  approvalId?: string
  runId: string
  parentRunId?: string
  subSessionId?: string
  agentId?: string
  teamId?: string
  toolName: string
  kind: ApprovalKind
  riskSummary?: string
  guidance?: string
  paramsPreview: string
  resolve?: (decision: ApprovalDecision, reason?: ApprovalResolutionReason) => void
}

export interface ApprovalAggregateContext {
  runId: string
  requesterId: string | number
  items: ApprovalAggregateItem[]
  openedAt: number
  lastUpdatedAt: number
}

export type ApprovalAggregateTextLanguage = "ko" | "en"

export function appendApprovalAggregateItem(
  context: ApprovalAggregateContext | undefined,
  item: ApprovalAggregateItem,
  requesterId: string | number,
  observedAt = Date.now(),
): { context: ApprovalAggregateContext; appended: boolean; aggregationLatencyMs: number | null } {
  const next = context ?? {
    runId: item.runId,
    requesterId,
    items: [],
    openedAt: observedAt,
    lastUpdatedAt: observedAt,
  }
  const itemKey = approvalAggregateItemKey(item)
  const exists = next.items.some((existing) => approvalAggregateItemKey(existing) === itemKey)
  if (!exists) next.items.push(item)
  next.lastUpdatedAt = observedAt
  return {
    context: next,
    appended: !exists,
    aggregationLatencyMs: !exists && next.items.length > 1
      ? Math.max(0, observedAt - next.openedAt)
      : null,
  }
}

export function buildApprovalAggregateText(params: {
  context: ApprovalAggregateContext
  channel: "slack" | "telegram"
  language?: ApprovalAggregateTextLanguage | undefined
}): InteractiveControlText {
  return renderApprovalRequestControlText(buildApprovalRequestControl({
    runRef: params.context.runId,
    language: params.language,
    items: params.context.items.map((item) => ({
      ...(item.approvalId ? { approvalRef: item.approvalId } : {}),
      toolLabel: item.toolName,
      kind: item.kind,
    })),
  }), params.channel)
}

export function resolveApprovalAggregate(
  context: ApprovalAggregateContext,
  decision: ApprovalDecision,
  reason: ApprovalResolutionReason = "user",
): ApprovalAggregateItem[] {
  for (const item of context.items) {
    item.resolve?.(decision, reason)
  }
  return [...context.items]
}

function approvalAggregateItemKey(item: ApprovalAggregateItem): string {
  return item.approvalId
    ?? [
      item.runId,
      item.parentRunId ?? "",
      item.subSessionId ?? "",
      item.agentId ?? "",
      item.teamId ?? "",
      item.kind,
      item.toolName,
      item.paramsPreview,
    ].join(":")
}
