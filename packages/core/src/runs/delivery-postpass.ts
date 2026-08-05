import { buildImplicitExecutionSummary } from "./execution.js"
import {
  buildSuccessfulDeliverySummary,
  type DeliveryOutcome,
  type DeliverySource,
  type SuccessfulFileDelivery,
  type SuccessfulTextDelivery,
} from "./delivery.js"
import {
  type RecoveryAlternative,
  type SuccessfulToolEvidence,
} from "./recovery.js"

export interface DeliveryPostPassPreview {
  preview: string
  summaryToLog?: string
}

export function buildDeliveryPostPassPreview(params: {
  preview: string
  deliveryOutcome: DeliveryOutcome
  successfulFileDeliveries: SuccessfulFileDelivery[]
  successfulTools: SuccessfulToolEvidence[]
  sawRealFilesystemMutation: boolean
}): DeliveryPostPassPreview {
  if (params.deliveryOutcome.hasSuccessfulArtifactDelivery && params.deliveryOutcome.deliverySummary) {
    return {
      preview: [params.preview.trim(), params.deliveryOutcome.deliverySummary].filter(Boolean).join("\n\n"),
      summaryToLog: params.deliveryOutcome.deliverySummary,
    }
  }

  if (!params.preview.trim()) {
    const implicitPreview = buildImplicitExecutionSummary({
      successfulTools: params.successfulTools,
      sawRealFilesystemMutation: params.sawRealFilesystemMutation,
    })
    if (implicitPreview) {
      return {
        preview: implicitPreview,
        summaryToLog: implicitPreview,
      }
    }
  }

  return { preview: params.preview }
}

export type DirectArtifactDeliveryDecision =
  | {
      kind: "none"
    }
  | {
      kind: "complete"
      deliverySummary: string
      finalText: string
      eventLabel: string
    }
  | {
      kind: "stop"
      summary: string
      reason: string
      remainingItems: string[]
    }
  | {
      kind: "retry"
      recoveryKey: string
      summary: string
      reason: string
      alternatives: RecoveryAlternative[]
      nextMessage: string
      eventLabel: string
    }

export function decideDirectArtifactDeliveryFlow(params: {
  deliveryOutcome: DeliveryOutcome
  source: DeliverySource
  successfulFileDeliveries: SuccessfulFileDelivery[]
  successfulTextDeliveries?: SuccessfulTextDelivery[]
  seenKeys: Set<string>
  canRetry: boolean
  maxTurns: number
  deliveryBudgetLimit: number
  originalRequest: string
  previousResult: string
  successfulTools: SuccessfulToolEvidence[]
}): DirectArtifactDeliveryDecision {
  if (params.deliveryOutcome.deliverySatisfied) {
    const deliverySummary = params.deliveryOutcome.deliverySummary ?? buildSuccessfulDeliverySummary(params.successfulFileDeliveries)
    return {
      kind: "complete",
      deliverySummary,
      finalText: params.previousResult || deliverySummary,
      eventLabel: "직접 파일 전달 요청 완료",
    }
  }

  if (!params.deliveryOutcome.requiresDirectArtifactRecovery) {
    return { kind: "none" }
  }

  if (isPlainTextInformationCompletion(params)) {
    return {
      kind: "complete",
      deliverySummary: "텍스트 결과 전달 완료",
      finalText: params.previousResult.trim(),
      eventLabel: "텍스트 결과 전달 요청 완료",
    }
  }

  // A missing artifact is unfinished execution, not a delivery failure. Once a
  // typed artifact exists, review-cycle-pass restricts the next attempt to the
  // admitted channel delivery Tool. Consuming a generic delivery retry here
  // used to mark that recovery as spent before capture had even occurred.
  return { kind: "none" }
}

function isPlainTextInformationCompletion(params: {
  successfulFileDeliveries: SuccessfulFileDelivery[]
  previousResult: string
  successfulTools: SuccessfulToolEvidence[]
}): boolean {
  if (params.successfulFileDeliveries.length > 0) return false
  if (!params.previousResult.trim()) return false

  const toolNames = params.successfulTools
    .map((tool) => tool.toolName.trim())
    .filter(Boolean)
  if (toolNames.length === 0) return false
  if (toolNames.some(isArtifactProducingToolName)) return false
  return toolNames.some(isTextInformationToolName)
}

function isArtifactProducingToolName(toolName: string): boolean {
  return /^(screen_capture|screenshot|camera_|file_|filesystem_|telegram_send_file|slack_send_file|yeonjang_|shell_exec|app_launch|process_kill|mouse_|keyboard_)/iu.test(toolName)
}

function isTextInformationToolName(toolName: string): boolean {
  return /^(web_search|web_fetch|browser_|fetch|http_get|knowledge|memory_)/iu.test(toolName)
}
