import { eventBus } from "../../events/index.js"
import { createLogger } from "../../logger/index.js"
import { getRootRun } from "../../runs/store.js"
import {
  attachApprovalChannelMessage,
  describeLateApproval,
  findLatestApprovalByChannelMessage,
  getLatestApprovalForRun,
} from "../../runs/approval-registry.js"
import { recordMessageLedgerEvent } from "../../runs/message-ledger.js"
import { recordLatencyMetric } from "../../observability/latency.js"
import {
  appendApprovalAggregateItem,
  buildApprovalAggregateText,
  resolveApprovalAggregate,
  type ApprovalAggregateContext,
  type ApprovalAggregateTextLanguage,
} from "../approval-aggregation.js"
import { renderChannelNoticeText, type ChannelNoticeRenderDependencies } from "../notice-rendering.js"
import type { InteractiveControlText } from "../interactive-control.js"

export type SlackApprovalDecision = "allow_once" | "allow_run" | "deny"
export type SlackApprovalReplyLanguage = "ko" | "en"
export type SlackApprovalReplyReason = "decision"

export interface SlackApprovalReplyNotice {
  kind: "slack_approval_reply_notice"
  language: SlackApprovalReplyLanguage
  reason: SlackApprovalReplyReason
  deliveryMode: "thread_reply"
  textSource: "slack_approval_reply_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
  text: string
}

interface ActiveSlackConversation {
  channelId: string
  userId: string
  threadTs: string
  language?: ApprovalAggregateTextLanguage | undefined
}

interface PendingApproval {
  requesterId: string
  channelId: string
  threadTs: string
  language?: ApprovalAggregateTextLanguage | undefined
  context: ApprovalAggregateContext
}

export interface SlackApprovalMessenger {
  sendApprovalRequest(params: {
    channelId: string
    threadTs: string
    runId: string
    text: InteractiveControlText
    language?: ApprovalAggregateTextLanguage | undefined
  }): Promise<string | void>
  updateApprovalRequest?(params: {
    channelId: string
    threadTs: string
    runId: string
    text: string
    language?: ApprovalAggregateTextLanguage | undefined
  }): Promise<void>
}

const activeConversations = new Map<string, ActiveSlackConversation>()
const activeConversationRefs = new Map<string, number>()
const pendingApprovals = new Map<string, PendingApproval>()
const resolvedApprovalLanguages = new Map<string, SlackApprovalReplyLanguage>()
let detachSlackApprovalRequestListener: (() => void) | null = null
let latestActiveConversation: ActiveSlackConversation | undefined
const log = createLogger("channel:slack:approval")

export function buildSlackApprovalReplyNotice(input: {
  language?: SlackApprovalReplyLanguage | undefined
  reason: SlackApprovalReplyReason
  decision: SlackApprovalDecision
}): SlackApprovalReplyNotice {
  const language = input.language ?? "ko"
  return {
    kind: "slack_approval_reply_notice",
    language,
    reason: input.reason,
    deliveryMode: "thread_reply",
    textSource: "slack_approval_reply_notice",
    renderingRequired: "llm_final_response",
    finalAnswer: false,
    assistantIdentityClaim: false,
    text: buildSlackApprovalReplyText(input.decision, language),
  }
}

export function setActiveSlackConversationForSession(
  sessionId: string,
  channelId: string,
  userId: string,
  threadTs: string,
  language?: ApprovalAggregateTextLanguage | undefined,
): void {
  const conversation = { channelId, userId, threadTs, ...(language ? { language } : {}) }
  activeConversations.set(sessionId, conversation)
  activeConversationRefs.set(sessionId, (activeConversationRefs.get(sessionId) ?? 0) + 1)
  latestActiveConversation = conversation
}

export function clearActiveSlackConversationForSession(sessionId: string): void {
  const remaining = (activeConversationRefs.get(sessionId) ?? 1) - 1
  if (remaining > 0) {
    activeConversationRefs.set(sessionId, remaining)
    return
  }
  activeConversationRefs.delete(sessionId)
  activeConversations.delete(sessionId)
}

export function registerSlackApprovalHandler(messenger: SlackApprovalMessenger): void {
  detachSlackApprovalRequestListener?.()
  const detachRequest = eventBus.on("approval.request", async ({ approvalId, runId, parentRunId, subSessionId, agentId, teamId, toolName, params, kind = "approval", guidance, riskSummary, resolve }) => {
    const run = getRootRun(runId)
    if (run?.source !== "slack") return
    const target = activeConversations.get(run.sessionId) ?? latestActiveConversation
    if (!target) {
      return
    }

    const observedAt = Date.now()
    const paramsPreview = JSON.stringify(params, null, 2).slice(0, 300)
    const existing = pendingApprovals.get(runId)
    const language = existing?.language ?? target.language
    const aggregated = appendApprovalAggregateItem(existing?.context, {
      ...(approvalId ? { approvalId } : {}),
      runId,
      ...(parentRunId ? { parentRunId } : {}),
      ...(subSessionId ? { subSessionId } : {}),
      ...(agentId ? { agentId } : {}),
      ...(teamId ? { teamId } : {}),
      toolName,
      kind,
      ...(riskSummary ? { riskSummary } : {}),
      ...(guidance ? { guidance } : {}),
      paramsPreview,
      resolve,
    }, target.userId, observedAt)
    const text = buildApprovalAggregateText({ context: aggregated.context, channel: "slack", language })
    pendingApprovals.set(runId, {
      requesterId: target.userId,
      channelId: target.channelId,
      threadTs: target.threadTs,
      ...(language ? { language } : {}),
      context: aggregated.context,
    })
    if (existing && aggregated.appended && aggregated.aggregationLatencyMs !== null) {
      recordLatencyMetric({
        name: "approval_aggregation_latency_ms",
        durationMs: aggregated.aggregationLatencyMs,
        runId,
        sessionId: run.sessionId,
        detail: {
          channel: "slack",
          approvalCount: aggregated.context.items.length,
          toolName,
          kind,
          approvalId: approvalId ?? null,
        },
      })
    }
    recordMessageLedgerEvent({
      runId,
      ...(parentRunId ? { parentRunId } : {}),
      ...(subSessionId ? { subSessionId } : {}),
      ...(agentId ? { agentId } : {}),
      ...(teamId ? { teamId } : {}),
      channel: "slack",
      eventKind: existing ? "approval_aggregated" : "approval_requested",
      deliveryKind: "approval",
      status: "pending",
      summary: existing ? "Slack 승인 요청을 기존 pending 항목에 집계했습니다." : "Slack 승인 요청을 전송했습니다.",
      detail: {
        approvalId: approvalId ?? null,
        approvalCount: aggregated.context.items.length,
        aggregationLatencyMs: aggregated.aggregationLatencyMs,
        toolName,
        kind,
        riskSummary: riskSummary ?? null,
      },
    })

    const channelMessageId = slackApprovalChannelMessageId(target.channelId, target.threadTs)
    if (approvalId) attachApprovalChannelMessage(approvalId, channelMessageId)

    if (existing && messenger.updateApprovalRequest) {
      await messenger.updateApprovalRequest({
        channelId: target.channelId,
        threadTs: target.threadTs,
        runId,
        text,
        ...(language ? { language } : {}),
      })
    } else if (!existing) {
      const sentTs = await messenger.sendApprovalRequest({
        channelId: target.channelId,
        threadTs: target.threadTs,
        runId,
        text,
        ...(language ? { language } : {}),
      })
      if (approvalId && typeof sentTs === "string" && sentTs.trim()) {
        attachApprovalChannelMessage(approvalId, channelMessageId)
      }
    }
  })
  const detachResolved = eventBus.on("approval.resolved", ({ runId }) => {
    const pending = pendingApprovals.get(runId)
    if (pending?.language) resolvedApprovalLanguages.set(runId, pending.language)
    pendingApprovals.delete(runId)
  })
  detachSlackApprovalRequestListener = () => {
    detachRequest()
    detachResolved()
  }
}

export function resetSlackApprovalStateForTest(): void {
  detachSlackApprovalRequestListener?.()
  detachSlackApprovalRequestListener = null
  activeConversations.clear()
  activeConversationRefs.clear()
  pendingApprovals.clear()
  resolvedApprovalLanguages.clear()
  latestActiveConversation = undefined
}

function resolveSlackApproval(params: {
  runId: string
  decision: SlackApprovalDecision
  channelId: string
  threadTs: string
  userId: string
  language?: SlackApprovalReplyLanguage | undefined
  originalRequest: string
  noticeRendering?: ChannelNoticeRenderDependencies | undefined
  reply: (text: string) => Promise<void>
}): Promise<boolean> {
  const pending = pendingApprovals.get(params.runId)
  if (!pending) {
    const row = getLatestApprovalForRun(params.runId)
    if (row) {
      const language = params.language ?? resolvedApprovalLanguages.get(params.runId) ?? "ko"
      return replyRenderedSlackApprovalText({
        reply: params.reply,
        originalRequest: params.originalRequest,
        language,
        rawText: describeLateApproval(row, language),
        noticeRendering: params.noticeRendering,
      }).then(() => true)
    }
    return Promise.resolve(false)
  }
  if (pending.channelId !== params.channelId || pending.threadTs !== params.threadTs || pending.requesterId !== params.userId) {
    return Promise.resolve(false)
  }
  const language = params.language ?? pending.language ?? "ko"
  resolvedApprovalLanguages.set(params.runId, language)

  pendingApprovals.delete(params.runId)
  const resolvedItems = resolveApprovalAggregate(pending.context, params.decision, "user")
  for (const item of resolvedItems) {
    eventBus.emit("approval.resolved", {
      ...(item.approvalId ? { approvalId: item.approvalId } : {}),
      runId: params.runId,
      decision: params.decision,
      toolName: item.toolName,
      kind: item.kind,
      reason: "user",
    })
  }
  const notice = buildSlackApprovalReplyNotice({
    language,
    reason: "decision",
    decision: params.decision,
  })
  return replyRenderedSlackApprovalText({
    reply: params.reply,
    originalRequest: params.originalRequest,
    language,
    rawText: notice.text,
    noticeRendering: params.noticeRendering,
  }).then(() => true)
}

export async function handleSlackApprovalMessage(params: {
  channelId: string
  threadTs: string
  userId: string
  text: string
  language?: SlackApprovalReplyLanguage | undefined
  noticeRendering?: ChannelNoticeRenderDependencies | undefined
  reply: (text: string) => Promise<void>
}): Promise<boolean> {
  const normalized = params.text.trim().toLowerCase()
  const decision =
    normalized === "approve"
      ? "allow_run"
      : normalized === "approve once"
        ? "allow_once"
        : normalized === "deny"
          ? "deny"
          : null

  if (!decision) return false

  const entry = [...pendingApprovals.entries()].find(([, value]) =>
    value.channelId === params.channelId
    && value.threadTs === params.threadTs
    && value.requesterId === params.userId,
  )

  if (!entry) {
    const row = findLatestApprovalByChannelMessage({
      channel: "slack",
      channelMessageId: slackApprovalChannelMessageId(params.channelId, params.threadTs),
    })
    if (!row) return false
    await replyRenderedSlackApprovalText({
      reply: params.reply,
      originalRequest: params.text,
      language: params.language ?? resolvedApprovalLanguages.get(row.run_id) ?? "ko",
      rawText: describeLateApproval(row, params.language ?? resolvedApprovalLanguages.get(row.run_id)),
      noticeRendering: params.noticeRendering,
    })
    return true
  }

  return resolveSlackApproval({
    runId: entry[0],
    decision,
    channelId: params.channelId,
    threadTs: params.threadTs,
    userId: params.userId,
    language: params.language,
    originalRequest: params.text,
    noticeRendering: params.noticeRendering,
    reply: params.reply,
  })
}

export async function handleSlackApprovalAction(params: {
  runId: string
  decision: SlackApprovalDecision
  channelId: string
  threadTs: string
  userId: string
  language?: SlackApprovalReplyLanguage | undefined
  noticeRendering?: ChannelNoticeRenderDependencies | undefined
  reply: (text: string) => Promise<void>
}): Promise<boolean> {
  return resolveSlackApproval({
    ...params,
    originalRequest: `Slack approval action: ${params.decision}`,
  })
}

async function replyRenderedSlackApprovalText(params: {
  reply: (text: string) => Promise<void>
  originalRequest: string
  language: SlackApprovalReplyLanguage
  rawText: string
  noticeRendering?: ChannelNoticeRenderDependencies | undefined
}): Promise<void> {
  const renderedNotice = await renderChannelNoticeText({
    originalRequest: params.language === "en"
      ? params.originalRequest
      : "승인 요청에 응답합니다.",
    rawText: params.rawText,
    dependencies: params.noticeRendering,
  })
  if (renderedNotice.status === "ready") {
    await params.reply(renderedNotice.text)
  } else {
    log.warn(`Skipped Slack approval reply delivery: ${renderedNotice.reason}`)
  }
}

function slackApprovalChannelMessageId(channelId: string, threadTs: string): string {
  return `slack:${channelId}:${threadTs}`
}

function buildSlackApprovalReplyText(
  decision: SlackApprovalDecision,
  language: SlackApprovalReplyLanguage,
): string {
  if (decision === "allow_run") {
    return language === "en" ? "Approved for this whole request." : "이 요청 전체를 승인했습니다."
  }
  if (decision === "allow_once") {
    return language === "en" ? "Approved for this step only." : "이번 단계만 승인했습니다."
  }
  return language === "en" ? "Denied and cancelled the request." : "요청을 거부하고 취소했습니다."
}
