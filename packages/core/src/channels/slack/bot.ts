import type { SlackConfig } from "../../config/types.js"
import type { ArtifactStorageContext } from "../../artifacts/lifecycle.js"
import type { MemoryJournalRepository } from "../../memory/journal.js"
import type { AgentHierarchyStorage } from "../../orchestration/hierarchy.js"
import { eventBus } from "../../events/index.js"
import { createLogger, redactLogText } from "../../logger/index.js"
import { cancelRootRun, getRootRun } from "../../runs/store.js"
import { startIngressRun } from "../../runs/ingress.js"
import type { RootRun } from "../../runs/types.js"
import {
  deliverIntakeAcknowledgementControl,
  type IntakeAcknowledgementControl,
} from "../intake-acknowledgement-control.js"
import { createInboundMessageRecord } from "../../runs/request-isolation.js"
import { recordMessageLedgerEvent } from "../../runs/message-ledger.js"
import { getSession, insertChannelMessageRef } from "../../db/index.js"
import {
  buildAccessPolicyFromAllowedIds,
  evaluateInboundAccessPolicy,
  recordChannelAccessPolicyResult,
} from "../access-policy.js"
import { resolveChannelContinuation } from "../continuation.js"
import type { InboundEnvelope } from "../contracts.js"
import { buildChannelIngressFailureNotice } from "../ingress-failure-notice.js"
import { renderChannelNoticeText, type ChannelNoticeRenderDependencies } from "../notice-rendering.js"
import { detectPrimaryMessageLanguage } from "../language.js"
import { createSlackChunkDeliveryHandler } from "./chunk-delivery.js"
import { clearActiveSlackConversationForSession, handleSlackApprovalAction, handleSlackApprovalMessage, registerSlackApprovalHandler, setActiveSlackConversationForSession } from "./approval-handler.js"
import { SlackResponder, type SlackResponderLanguage } from "./responder.js"
import {
  getOrCreateSlackSession,
  newSlackSession,
  parseSlackSessionKey,
  resolveSlackSessionKey,
} from "./session.js"
import type { ChannelPendingResponseDeliveryInput } from "../pending-response-delivery.js"

const log = createLogger("channel:slack")

function slackBotErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export function resolveSlackInboundMessageLanguage(text: string): SlackResponderLanguage {
  const visibleText = text.replace(/<@[A-Z0-9_]+>/gi, " ")
  const language = detectPrimaryMessageLanguage(visibleText)
  return language === "unknown" ? "en" : language
}

async function sendSlackContinuationConfirmation(params: {
  responder: SlackResponder
  originalRequest: string
  rawText: string
  dependencies?: ChannelNoticeRenderDependencies | undefined
}): Promise<void> {
  const renderedNotice = await renderChannelNoticeText({
    originalRequest: params.originalRequest,
    rawText: params.rawText,
    ...(params.dependencies ? { dependencies: params.dependencies } : {}),
  })
  if (renderedNotice.status === "ready") {
    await params.responder.sendReceipt(renderedNotice.text)
  } else {
    log.warn(`Skipped Slack continuation confirmation delivery: ${renderedNotice.reason}`)
  }
}

async function sendSlackIngressReceipt(params: {
  responder: SlackResponder
  control: IntakeAcknowledgementControl
}): Promise<string | undefined> {
  const result = await deliverIntakeAcknowledgementControl({
    control: params.control,
    deliver: (text) => params.responder.sendIntakeAcknowledgement(text),
    onFailure: (error) => log.fieldDebug(`Slack intake acknowledgement delivery failed: ${slackBotErrorMessage(error)}`),
  })
  return result.status === "delivered" ? result.reference : undefined
}

export function findSlackReplyTaskRef(params: {
  channelId: string
  messageTs: string
  threadTs: string
}) {
  const result = resolveChannelContinuation({
    envelope: buildSlackContinuationEnvelope({
      channelId: params.channelId,
      messageTs: params.messageTs,
      threadTs: params.threadTs,
      userId: "unknown",
      text: "",
    }),
  })
  if (result.selected?.messageRef) return result.selected.messageRef
  return result.selected
    ? {
        id: `continuation:${result.selected.source}:${result.selected.externalMessageId ?? result.selected.runId}`,
        source: "slack",
        session_id: result.selected.sessionId ?? "",
        root_run_id: result.selected.runId,
        request_group_id: result.selected.requestGroupId,
        external_chat_id: result.selected.externalChatId ?? params.channelId,
        external_thread_id: result.selected.externalThreadId ?? params.threadTs,
        external_message_id: result.selected.externalMessageId ?? params.messageTs,
        role: "assistant",
        created_at: result.selected.createdAt,
      }
    : undefined
}

function buildSlackContinuationEnvelope(params: {
  channelId: string
  messageTs: string
  threadTs?: string | undefined
  userId: string
  text: string
  teamId?: string | undefined
}): InboundEnvelope {
  return {
    channelId: "slack:workspace",
    provider: "slack",
    connectionId: "slack:primary",
    messageId: params.messageTs,
    ...(params.threadTs ? { threadId: params.threadTs } : {}),
    sender: { id: params.userId, providerType: "user" },
    room: { id: params.channelId, type: "channel" },
    ...(params.teamId ? { workspace: { id: params.teamId } } : {}),
    text: params.text,
    attachments: [],
    mentions: [],
    timestamp: Date.now(),
    rawPayloadRef: {
      storage: "none",
      redactionState: "not_stored",
      provider: "slack",
      createdAt: Date.now(),
    },
    dedupeKey: `slack:${params.channelId}:${params.messageTs}`,
  }
}

interface SocketEnvelope {
  envelope_id?: string
  payload?: {
    event?: {
      type?: string
      subtype?: string
      user?: string
      text?: string
      channel?: string
      ts?: string
      thread_ts?: string
      bot_id?: string
    }
    team_id?: string
    type?: string
    user?: {
      id?: string
    }
    channel?: {
      id?: string
    }
    message?: {
      ts?: string
      thread_ts?: string
    }
    container?: {
      channel_id?: string
      message_ts?: string
      thread_ts?: string
    }
    actions?: Array<{
      action_id?: string
      value?: string
    }>
  }
  type?: string
}

interface WebSocketLike {
  send(data: string): void
  close(): void
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void
}

export interface SlackLiveSmokeIngressReceipt {
  requestId: string
  runId: string
  requestGroupId: string
  threadTs: string
  finished: Promise<RootRun | undefined>
}

export class SlackChannel {
  private socket: WebSocketLike | null = null
  private runningRuns = new Map<string, Set<string>>()
  private sessionIds = new Map<string, string>()
  private seenInboundEvents = new Map<string, number>()
  private liveSmokeSequence = 0
  private liveSmokeStartObservers = new Map<
    string,
    (receipt: SlackLiveSmokeIngressReceipt) => void
  >()

  constructor(
    private config: SlackConfig,
    private artifactStorage: ArtifactStorageContext,
    private noticeRendering?: ChannelNoticeRenderDependencies,
    private memoryJournal?: MemoryJournalRepository,
    private hierarchyStorage?: AgentHierarchyStorage,
  ) {}

  async start(): Promise<void> {
    log.info(
      `Starting Slack channel (Socket Mode, allowedUsers=${this.config.allowedUserIds.length || "all"}, allowedChannels=${this.config.allowedChannelIds.length || "all"})`,
    )

    registerSlackApprovalHandler({
      sendApprovalRequest: async ({ channelId, threadTs, runId, text, language }) => {
        const responder = new SlackResponder(this.config, channelId, threadTs, language ?? "ko")
        await responder.sendApprovalRequest(runId, text, language)
      },
    })

    const openResponse = await fetch("https://slack.com/api/apps.connections.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.appToken}`,
      },
    })
    const openPayload = await openResponse.json() as { ok?: boolean; error?: string; url?: string }
    if (!openResponse.ok || openPayload.ok !== true || !openPayload.url) {
      throw new Error(openPayload.error ?? "Slack Socket Mode 연결 URL을 가져오지 못했습니다.")
    }

    const SocketCtor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => WebSocketLike }).WebSocket
    if (!SocketCtor) {
      throw new Error("이 환경에서는 WebSocket 런타임을 사용할 수 없습니다.")
    }

    this.socket = new SocketCtor(openPayload.url)
    await new Promise<void>((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Slack WebSocket 생성에 실패했습니다."))
        return
      }
      const timer = setTimeout(() => reject(new Error("Slack Socket Mode 연결 시간이 초과되었습니다.")), 15_000)
      this.socket.addEventListener("open", () => {
        clearTimeout(timer)
        log.info("Slack Socket Mode connected")
        eventBus.emit("channel.connected", { channel: "slack", detail: { transport: "socket_mode" } })
        resolve()
      })
      this.socket.addEventListener("error", () => {
        clearTimeout(timer)
        reject(new Error("Slack Socket Mode 연결에 실패했습니다."))
      })
      this.socket.addEventListener("message", (event) => {
        void this.handleSocketMessage(String(event.data ?? "")).catch((error) => {
          log.error(`Slack message handling failed: ${slackBotErrorMessage(error)}`)
        })
      })
    })
  }

  stop(): void {
    this.socket?.close()
    this.socket = null
  }

  async acceptLiveSmokeRequest(input: {
    request: string
    target: { channelId: string; userId: string; threadTs?: string }
  }): Promise<SlackLiveSmokeIngressReceipt> {
    if (!this.socket) throw new Error("slack_live_smoke_runtime_unavailable")
    if (
      !this.config.allowedUserIds.includes(input.target.userId) ||
      !this.config.allowedChannelIds.includes(input.target.channelId)
    ) {
      throw new Error("slack_live_smoke_target_not_allowed")
    }
    const request = input.request.trim()
    if (!request) throw new Error("slack_live_smoke_request_required")

    this.liveSmokeSequence = (this.liveSmokeSequence + 1) % 1_000_000
    const seconds = Math.floor(Date.now() / 1_000)
    const fraction = String(this.liveSmokeSequence).padStart(6, "0")
    const messageTs = `${seconds}.${fraction}`
    const threadTs = input.target.threadTs ?? messageTs
    const eventKey = `${input.target.channelId}:${messageTs}`
    let started: SlackLiveSmokeIngressReceipt | undefined
    this.liveSmokeStartObservers.set(eventKey, (receipt) => {
      started = receipt
    })
    try {
      await this.handleSocketMessage(
        JSON.stringify({
          payload: {
            type: "events_api",
            event: {
              type: "message",
              user: input.target.userId,
              channel: input.target.channelId,
              text: request,
              ts: messageTs,
              ...(input.target.threadTs ? { thread_ts: input.target.threadTs } : {}),
            },
          },
        }),
      )
    } finally {
      this.liveSmokeStartObservers.delete(eventKey)
    }
    if (!started) throw new Error("slack_live_smoke_ingress_not_started")
    if (started.threadTs !== threadTs) throw new Error("slack_live_smoke_thread_mismatch")
    return started
  }

  createPendingResponseDeliveryHandler(input: ChannelPendingResponseDeliveryInput) {
    const session = getSession(input.sessionId)
    if (!session || session.source !== "slack" || !session.source_id) return undefined
    const target = parseSlackSessionKey(session.source_id)
    if (!target) return undefined
    const responder = new SlackResponder(
      this.config,
      target.channelId,
      target.threadTs,
      input.language,
    )
    return createSlackChunkDeliveryHandler({
      artifactStorage: this.artifactStorage,
      responder,
      sessionId: input.sessionId,
      channelId: target.channelId,
      threadTs: target.threadTs,
      ...(input.language ? { language: input.language } : {}),
      getRunId: () => input.runId,
      deliveryKind: "final",
      noticeRendering: this.noticeRendering,
      recordOutgoingMessageRef: (params) => this.recordOutgoingMessageRef(params),
      logError: (message) => log.error(message),
    })
  }

  private addSessionRun(sessionKey: string, runId: string): void {
    const existing = this.runningRuns.get(sessionKey)
    if (existing) {
      existing.add(runId)
      return
    }
    this.runningRuns.set(sessionKey, new Set([runId]))
  }

  private removeSessionRun(sessionKey: string, runId: string): boolean {
    const existing = this.runningRuns.get(sessionKey)
    if (!existing) return false
    existing.delete(runId)
    if (existing.size === 0) {
      this.runningRuns.delete(sessionKey)
      return false
    }
    return true
  }

  private isAllowedUser(userId: string): boolean {
    return this.config.allowedUserIds.length === 0 || this.config.allowedUserIds.includes(userId)
  }

  private isAllowedChannel(channelId: string): boolean {
    return this.config.allowedChannelIds.length === 0 || this.config.allowedChannelIds.includes(channelId)
  }

  private markInboundEventSeen(eventKey: string): boolean {
    const now = Date.now()
    const previous = this.seenInboundEvents.get(eventKey)

    for (const [key, seenAt] of this.seenInboundEvents.entries()) {
      if (now - seenAt > 60_000) this.seenInboundEvents.delete(key)
    }

    if (typeof previous === "number" && now - previous < 60_000) {
      return true
    }

    this.seenInboundEvents.set(eventKey, now)
    return false
  }

  private recordOutgoingMessageRef(params: {
    sessionId: string
    runId: string
    channelId: string
    threadTs: string
    messageId: string
    role: "assistant" | "tool"
  }): void {
    const run = getRootRun(params.runId)
    if (!run) return
    insertChannelMessageRef({
      source: "slack",
      session_id: params.sessionId,
      root_run_id: params.runId,
      request_group_id: run.requestGroupId,
      external_chat_id: params.channelId,
      external_thread_id: params.threadTs,
      external_message_id: params.messageId,
      role: params.role,
      created_at: Date.now(),
    })
  }

  private async handleSocketMessage(raw: string): Promise<void> {
    const envelope = JSON.parse(raw) as SocketEnvelope
    if (envelope.envelope_id && this.socket) {
      this.socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }))
    }

    if (envelope.payload?.type === "block_actions") {
      await this.handleBlockActions(envelope.payload)
      return
    }

    const event = envelope.payload?.event
    if (!event) return
    if (event.bot_id) return

    const eventType = event.type?.trim()
    if (eventType !== "message" && eventType !== "app_mention") {
      log.info(`Ignored Slack event type=${eventType ?? "unknown"}`)
      return
    }
    if (eventType === "message" && event.subtype) {
      log.info(`Ignored Slack message subtype=${event.subtype}`)
      return
    }

    const userId = event.user?.trim()
    const channelId = event.channel?.trim()
    const rawText = event.text?.trim() ?? ""
    const text = eventType === "app_mention"
      ? rawText.replace(/<@[^>]+>/g, "").trim()
      : rawText
    const messageTs = event.ts?.trim()
    const threadTs = (event.thread_ts?.trim() || messageTs || "").trim()

    if (!userId || !channelId || !text || !messageTs || !threadTs) return
    const inboundEventKey = `${channelId}:${messageTs}`
    if (this.markInboundEventSeen(inboundEventKey)) {
      log.info(`Ignored duplicate Slack inbound event channel=${channelId} ts=${messageTs} type=${eventType}`)
      return
    }
    const inboundEnvelope = buildSlackContinuationEnvelope({
      channelId,
      messageTs,
      threadTs,
      userId,
      text,
      ...(envelope.payload?.team_id ? { teamId: envelope.payload.team_id } : {}),
    })
    const access = evaluateInboundAccessPolicy({
      envelope: inboundEnvelope,
      policy: buildAccessPolicyFromAllowedIds({
        provider: "slack",
        allowedUserIds: this.config.allowedUserIds,
        allowedRoomIds: this.config.allowedChannelIds,
        ...(envelope.payload?.team_id ? { teamId: envelope.payload.team_id } : {}),
        requireAllowedPrincipal: true,
        allowUnlisted: false,
        emptyAllowlistAllows: true,
      }),
    })
    recordChannelAccessPolicyResult(access)
    if (!access.allowed) {
      log.warn(`Ignored Slack message by policy user=${userId} channel=${channelId} reason=${access.policy.reasonCode}`)
      return
    }

    log.info(`Accepted Slack message user=${userId} channel=${channelId} thread=${threadTs}`)
    const language = resolveSlackInboundMessageLanguage(text)

    const approvalHandled = await handleSlackApprovalMessage({
      channelId,
      threadTs,
      userId,
      text,
      language,
      reply: async (message) => {
        const responder = new SlackResponder(this.config, channelId, threadTs, language)
        await responder.sendReceipt(message)
      },
    })
    if (approvalHandled) return

    const sessionKey = resolveSlackSessionKey(channelId, threadTs)
    const sessionId = getOrCreateSlackSession(sessionKey)
    this.sessionIds.set(sessionKey, sessionId)

    eventBus.emit("message.inbound", {
      source: "slack",
      sessionId,
      content: text,
      userId,
    })

    setActiveSlackConversationForSession(sessionId, channelId, userId, threadTs, language)
    const responder = new SlackResponder(this.config, channelId, threadTs, language)

    let startedRunId = ""
    const continuation = resolveChannelContinuation({ envelope: access.envelope, language })
    if (continuation.status === "ambiguous") {
      const confirmationText = continuation.confirmationNotice?.text ?? continuation.confirmationPrompt
      if (confirmationText?.trim()) {
        await sendSlackContinuationConfirmation({
          responder,
          originalRequest: text,
          rawText: confirmationText,
          dependencies: this.noticeRendering,
        })
      }
      clearActiveSlackConversationForSession(sessionId)
      return
    }
    const repliedTaskRef = continuation.selected
      ? {
          root_run_id: continuation.selected.runId,
          request_group_id: continuation.selected.requestGroupId,
        }
      : undefined

    try {
      if (repliedTaskRef) {
        const cancelled = cancelRootRun(repliedTaskRef.root_run_id)
        if (cancelled) {
          log.info(`Reply override detected for Slack requestGroup=${repliedTaskRef.request_group_id}`)
        }
      }

      const onChunk = createSlackChunkDeliveryHandler({
        artifactStorage: this.artifactStorage,
        responder,
        sessionId,
        channelId,
        threadTs,
        language,
        getRunId: () => startedRunId || undefined,
        recordOutgoingMessageRef: (params) => this.recordOutgoingMessageRef(params),
        logError: (message) => log.error(message),
        noticeRendering: this.noticeRendering,
      })

      const runtimeConfig = this.noticeRendering?.config
      if (!runtimeConfig) throw new Error("Slack root run config snapshot is missing.")
      if (!this.memoryJournal) throw new Error("Slack memory journal context is missing.")
      if (!this.hierarchyStorage) throw new Error("Slack hierarchy storage context is missing.")
      const { started, acknowledgement } = startIngressRun({
        artifactStorage: this.artifactStorage,
        memoryJournal: this.memoryJournal,
        hierarchyStorage: this.hierarchyStorage,
        config: runtimeConfig,
        message: text,
        sessionId,
        ...(repliedTaskRef ? { requestGroupId: repliedTaskRef.request_group_id, forceRequestGroupReuse: true } : {}),
        model: undefined,
        source: "slack",
        inboundMessage: createInboundMessageRecord({
          source: "slack",
          sessionId,
          channelEventId: inboundEventKey,
          externalChatId: channelId,
          externalThreadId: threadTs,
          externalMessageId: messageTs,
          userId,
          rawText: text,
        }),
        onChunk,
      })

      startedRunId = started.runId
      this.addSessionRun(sessionKey, started.runId)
      this.liveSmokeStartObservers.get(inboundEventKey)?.({
        requestId: started.runId,
        runId: started.runId,
        requestGroupId: getRootRun(started.runId)?.requestGroupId ?? started.runId,
        threadTs,
        finished: started.finished,
      })

      {
        const receiptMessageId = await sendSlackIngressReceipt({ responder, control: acknowledgement })
        if (receiptMessageId !== undefined) {
          const startedRun = getRootRun(started.runId)
          recordMessageLedgerEvent({
            runId: started.runId,
            requestGroupId: startedRun?.requestGroupId ?? started.runId,
            sessionKey: sessionId,
            threadKey: sessionKey,
            channel: "slack",
            eventKind: "fast_receipt_sent",
            deliveryKey: `slack:receipt:${channelId}:${threadTs ?? "channel"}:${receiptMessageId}`,
            idempotencyKey: `slack:receipt:${started.runId}:${receiptMessageId}`,
            status: "sent",
            summary: "Slack 접수 메시지를 전송했습니다.",
            detail: {
              acknowledgementControl: acknowledgement,
              channelId,
              ...(threadTs ? { threadTs } : {}),
              messageId: receiptMessageId,
            },
          })
          this.recordOutgoingMessageRef({
            sessionId,
            runId: started.runId,
            channelId,
            threadTs,
            messageId: receiptMessageId,
            role: "assistant",
          })
        }
      }

      void started.finished.finally(() => {
        const hasRemainingRuns = this.removeSessionRun(sessionKey, started.runId)
        if (!hasRemainingRuns) {
          clearActiveSlackConversationForSession(sessionId)
        }
      })
    } catch (error) {
      clearActiveSlackConversationForSession(sessionId)
      const message = slackBotErrorMessage(error)
      const notice = buildChannelIngressFailureNotice({
        provider: "slack",
        userMessage: text,
        reason: message,
      })
      log.error(`Slack ingress failed: ${message}`)
      const renderedNotice = await renderChannelNoticeText({
        originalRequest: text,
        rawText: notice.text,
        ...(this.noticeRendering ? { dependencies: this.noticeRendering } : {}),
      })
      if (renderedNotice.status === "ready") {
        await responder.sendError(renderedNotice.text)
      } else {
        log.warn(`Skipped Slack ingress failure notice delivery: ${renderedNotice.reason}`)
      }
    }
  }

  private async handleBlockActions(payload: NonNullable<SocketEnvelope["payload"]>): Promise<void> {
    const action = payload.actions?.[0]
    const actionId = action?.action_id?.trim()
    const runId = action?.value?.trim()
    const userId = payload.user?.id?.trim()
    const channelId = payload.channel?.id?.trim() || payload.container?.channel_id?.trim()
    const threadTs = payload.message?.thread_ts?.trim()
      || payload.container?.thread_ts?.trim()
      || payload.message?.ts?.trim()
      || payload.container?.message_ts?.trim()

    if (!actionId || !runId || !userId || !channelId || !threadTs) {
      log.warn("Ignored Slack block action with incomplete payload")
      return
    }

    const decision =
      actionId === "approval_allow_run"
        ? "allow_run"
        : actionId === "approval_allow_once"
          ? "allow_once"
          : actionId === "approval_deny"
            ? "deny"
            : null

    if (!decision) {
      log.info(`Ignored Slack block action actionId=${actionId}`)
      return
    }

    const responder = new SlackResponder(this.config, channelId, threadTs)
    const handled = await handleSlackApprovalAction({
      runId,
      decision,
      channelId,
      threadTs,
      userId,
      reply: async (message) => {
        await responder.sendReceipt(message)
      },
    })

    if (!handled) {
      log.warn(`Ignored Slack approval action runId=${runId} user=${userId} channel=${channelId}`)
    }
  }
}
