export type InteractiveControlLanguage = "ko" | "en"
export type InteractiveControlChannel = "slack" | "telegram"
declare const interactiveControlTextBrand: unique symbol
export type InteractiveControlText = string & { readonly [interactiveControlTextBrand]: true }

interface InteractiveControlBase {
  deliveryMode: "interactive_control"
  finalAnswer: false
  assistantIdentityClaim: false
}

export interface ApprovalRequestControlItem {
  approvalRef?: string | undefined
  toolLabel: string
  screenConfirmation: boolean
}

export interface ApprovalRequestControl extends InteractiveControlBase {
  kind: "approval_request_control"
  runRef: string
  language: InteractiveControlLanguage
  items: ApprovalRequestControlItem[]
  actions: readonly ["allow_run", "allow_once", "deny"]
}

export interface ToolStatusControl extends InteractiveControlBase {
  kind: "tool_status_control"
  toolLabel: string
  status: "running" | "succeeded" | "failed"
  language: InteractiveControlLanguage
}

function requiredLabel(value: string): string {
  const normalized = value.trim().replace(/[\r\n\t]+/gu, " ").slice(0, 120)
  return normalized || "unknown"
}

export function buildApprovalRequestControl(input: {
  runRef: string
  language?: InteractiveControlLanguage | undefined
  items: Array<{
    approvalRef?: string | undefined
    toolLabel: string
    kind: string
  }>
}): ApprovalRequestControl {
  return {
    kind: "approval_request_control",
    deliveryMode: "interactive_control",
    finalAnswer: false,
    assistantIdentityClaim: false,
    runRef: input.runRef.trim(),
    language: input.language ?? "ko",
    items: input.items.map((item) => ({
      ...(item.approvalRef?.trim() ? { approvalRef: item.approvalRef.trim() } : {}),
      toolLabel: requiredLabel(item.toolLabel),
      screenConfirmation: item.kind === "screen_confirmation",
    })),
    actions: ["allow_run", "allow_once", "deny"],
  }
}

export function renderApprovalRequestControlText(
  control: ApprovalRequestControl,
  channel: InteractiveControlChannel,
): InteractiveControlText {
  const language = control.language
  const screenConfirmation = control.items[0]?.screenConfirmation === true
  const header = screenConfirmation
    ? language === "en"
      ? channel === "slack" ? "Screen operation readiness confirmation required." : "Screen operation readiness confirmation"
      : channel === "slack" ? "화면 조작 준비 확인이 필요합니다." : "화면 조작 준비 확인"
    : language === "en"
      ? channel === "slack" ? "Tool execution approval required." : "Tool execution approval request"
      : channel === "slack" ? "도구 실행 승인이 필요합니다." : "도구 실행 승인 요청"
  const decoratedHeader = channel === "slack" ? `*${header}*` : header
  const count = control.items.length > 1
    ? language === "en" ? `Approval items: ${control.items.length}` : `승인 항목: ${control.items.length}개`
    : undefined
  const tools = control.items.map((item, index) => {
    const prefix = control.items.length > 1 ? `#${index + 1} ` : ""
    return language === "en"
      ? `${prefix}Tool: ${item.toolLabel}`
      : `${prefix}도구: ${item.toolLabel}`
  })
  const footer = screenConfirmation
    ? language === "en" ? "Continue after preparation is complete." : "준비가 끝나면 계속할 수 있습니다."
    : channel === "slack"
      ? language === "en"
        ? "Use the buttons below, or reply in this thread with `approve`, `approve once`, or `deny`."
        : "아래 버튼을 누르거나, 버튼이 보이지 않으면 이 스레드에 `approve`, `approve once`, `deny` 중 하나로 답해주세요."
      : language === "en" ? "Choose an approval action below." : "아래에서 승인 동작을 선택하세요."
  return [decoratedHeader, count, ...tools, footer]
    .filter(Boolean)
    .join("\n\n") as InteractiveControlText
}

export function buildToolStatusControl(input: {
  toolLabel: string
  status: ToolStatusControl["status"]
  language?: InteractiveControlLanguage | undefined
}): ToolStatusControl {
  return {
    kind: "tool_status_control",
    deliveryMode: "interactive_control",
    finalAnswer: false,
    assistantIdentityClaim: false,
    toolLabel: requiredLabel(input.toolLabel),
    status: input.status,
    language: input.language ?? "ko",
  }
}

export function renderToolStatusControlText(
  control: ToolStatusControl,
  channel: InteractiveControlChannel,
): InteractiveControlText {
  const tool = channel === "telegram" ? `\`${control.toolLabel}\`` : control.toolLabel
  if (control.status === "running") {
    if (control.language === "en") {
      return (channel === "telegram" ? `⚙️ Running: ${tool}...` : `Running: ${tool}...`) as InteractiveControlText
    }
    return (channel === "telegram" ? `⚙️ 실행 중: ${tool}...` : `실행 중: ${tool}...`) as InteractiveControlText
  }
  const succeeded = control.status === "succeeded"
  if (control.language === "en") {
    const text = `${tool} ${succeeded ? "done" : "failed"}`
    return (channel === "telegram" ? `${succeeded ? "✅" : "❌"} ${text}` : `${succeeded ? "Done" : "Failed"}: ${control.toolLabel}`) as InteractiveControlText
  }
  const text = `${tool} ${succeeded ? "완료" : "실패"}`
  return (channel === "telegram" ? `${succeeded ? "✅" : "❌"} ${text}` : `${succeeded ? "완료" : "실패"}: ${control.toolLabel}`) as InteractiveControlText
}
