import { InlineKeyboard } from "grammy"

export type TelegramApprovalRequestLanguage = "ko" | "en"

export function resolveTelegramApprovalRequestLanguage(
  languageCode: string | undefined,
): TelegramApprovalRequestLanguage {
  return languageCode?.toLowerCase().startsWith("en") ? "en" : "ko"
}

export function buildApprovalKeyboard(
  runId: string,
  language: TelegramApprovalRequestLanguage = "ko",
): InlineKeyboard {
  const copy = telegramApprovalKeyboardCopy(language)
  return new InlineKeyboard()
    .text(copy.approveAll, `approve:${runId}:all`)
    .row()
    .text(copy.approveOnce, `approve:${runId}:once`)
    .row()
    .text(copy.deny, `deny:${runId}`)
}

export function buildResultKeyboard(label: string): InlineKeyboard {
  return new InlineKeyboard().text(label, "noop")
}

function telegramApprovalKeyboardCopy(language: TelegramApprovalRequestLanguage): {
  approveAll: string
  approveOnce: string
  deny: string
} {
  if (language === "en") {
    return {
      approveAll: "✅ Approve all",
      approveOnce: "🔹 This step only",
      deny: "❌ Deny and cancel",
    }
  }
  return {
    approveAll: "✅ 전체 승인",
    approveOnce: "🔹 이번 단계만",
    deny: "❌ 거부 후 취소",
  }
}
