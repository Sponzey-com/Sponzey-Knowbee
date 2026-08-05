import type {
  RequestDeliveryOutcomeStatus,
  RequestExecutionOutcomeStatus,
  RootRun,
  RunContextMode,
} from "../contracts/runs"
import { pickUiText, type UiLanguage } from "../stores/uiLanguage"

export function toRunStatusText(status: RootRun["status"], language: UiLanguage) {
  switch (status) {
    case "queued":
      return pickUiText(language, "대기", "Queued")
    case "running":
      return pickUiText(language, "진행 중", "Running")
    case "awaiting_approval":
      return pickUiText(language, "승인 대기", "Awaiting approval")
    case "awaiting_user":
      return pickUiText(language, "사용자 확인", "Awaiting user")
    case "completed":
      return pickUiText(language, "완료", "Completed")
    case "failed":
      return pickUiText(language, "실패", "Failed")
    case "cancelled":
      return pickUiText(language, "취소됨", "Cancelled")
    case "interrupted":
      return pickUiText(language, "중단됨", "Interrupted")
  }
}

export function toRequestExecutionOutcomeText(
  status: RequestExecutionOutcomeStatus,
  language: UiLanguage,
) {
  switch (status) {
    case "in_progress":
      return pickUiText(language, "진행 중", "In progress")
    case "awaiting_approval":
      return pickUiText(language, "승인 대기", "Awaiting approval")
    case "awaiting_user":
      return pickUiText(language, "사용자 확인 필요", "Awaiting user")
    case "succeeded":
      return pickUiText(language, "목표 완료", "Goal completed")
    case "partially_succeeded":
      return pickUiText(language, "일부 완료", "Partially completed")
    case "blocked":
      return pickUiText(language, "진행 차단", "Blocked")
    case "exhausted":
      return pickUiText(language, "해결 경로 소진", "Paths exhausted")
    case "cancelled":
      return pickUiText(language, "취소됨", "Cancelled")
    case "internal_fault":
      return pickUiText(language, "내부 오류", "Internal error")
  }
}

export function toRequestDeliveryOutcomeText(
  status: RequestDeliveryOutcomeStatus,
  language: UiLanguage,
) {
  switch (status) {
    case "not_started":
      return pickUiText(language, "전달 전", "Not delivered")
    case "pending":
      return pickUiText(language, "전달 대기", "Delivery pending")
    case "delivered":
      return pickUiText(language, "전달 완료", "Delivered")
    case "failed":
      return pickUiText(language, "전달 실패", "Delivery failed")
  }
}

export function toRunSourceText(source: RootRun["source"], language: UiLanguage) {
  const normalized = source.trim().toLowerCase()
  if (normalized === "webui") return pickUiText(language, "화면 요청", "Web UI")
  if (normalized === "cli") return pickUiText(language, "터미널 요청", "CLI")
  if (normalized === "telegram") return pickUiText(language, "Telegram 요청", "Telegram")
  if (normalized === "slack") return pickUiText(language, "Slack 요청", "Slack")
  if (normalized === "schedule" || normalized === "scheduler") return pickUiText(language, "예약 실행", "Scheduled")
  if (normalized === "topology") return pickUiText(language, "서브 에이전트 설정", "Sub-agent setup")
  if (normalized === "agent") return pickUiText(language, "에이전트 판단", "Agent decision")
  return source || pickUiText(language, "출처 확인 필요", "Needs source check")
}

export function toTaskProfileText(taskProfile: RootRun["taskProfile"], language: UiLanguage) {
  switch (taskProfile) {
    case "planning":
      return pickUiText(language, "계획", "Planning")
    case "coding":
      return pickUiText(language, "코드 작업", "Coding")
    case "review":
      return pickUiText(language, "검토", "Review")
    case "research":
      return pickUiText(language, "리서치", "Research")
    case "private_local":
      return pickUiText(language, "로컬 작업", "Local work")
    case "summarization":
      return pickUiText(language, "요약", "Summarization")
    case "operations":
      return pickUiText(language, "운영", "Operations")
    default:
      return pickUiText(language, "일반", "General")
  }
}

export function toContextModeText(contextMode: RunContextMode, language: UiLanguage) {
  switch (contextMode) {
    case "request_group":
      return pickUiText(language, "같은 요청만 참조", "Same request only")
    case "isolated":
      return pickUiText(language, "현재 요청만 참조", "This request only")
    default:
      return pickUiText(language, "대화 전체 참조", "Full conversation")
  }
}
