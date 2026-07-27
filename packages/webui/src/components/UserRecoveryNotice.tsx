import React from "react"
import type { UserRecoveryKind, UserRecoveryProjection } from "../lib/user-recovery"
import { Button } from "./ui/Button"

type Text = (ko: string, en: string) => string
export type RecoverySubject = "skills" | "capabilities" | "work" | "agents" | "settings" | "chat" | "command"

export interface UserRecoveryNoticeProps {
  projection: UserRecoveryProjection
  subject: RecoverySubject
  text: Text
  onAction?: () => void
}

export function UserRecoveryNotice({
  projection,
  subject,
  text,
  onAction,
}: UserRecoveryNoticeProps) {
  return (
    <section
      role="alert"
      data-recovery-kind={projection.kind}
      className="rounded-[var(--ui-surface-radius)] border border-red-200 bg-red-50 px-4 py-4 text-red-950"
    >
      <h2 className="text-sm font-semibold">{recoveryTitle(subject, text)}</h2>
      <p className="mt-1 break-words text-sm leading-6 [overflow-wrap:anywhere]">
        {recoveryMessage(projection.kind, text)}
      </p>
      {onAction ? (
        <div className="mt-3">
          <Button onClick={onAction} className="min-w-11">
            {recoveryActionLabel(projection.actionLabelKey, text)}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold">
          {text("다음 행동", "Next action")}: {recoveryActionLabel(projection.actionLabelKey, text)}
        </p>
      )}
    </section>
  )
}

function recoveryTitle(subject: RecoverySubject, text: Text): string {
  if (subject === "skills") return text("Skill 정보를 불러오지 못했습니다", "Could not load Skills")
  if (subject === "capabilities")
    return text("기능 정보를 불러오지 못했습니다", "Could not load capabilities")
  if (subject === "work") return text("작업 정보를 불러오지 못했습니다", "Could not load work")
  if (subject === "agents")
    return text("에이전트 정보를 불러오지 못했습니다", "Could not load agents")
  if (subject === "chat")
    return text("요청을 전송하지 못했습니다", "Could not send the request")
  if (subject === "command")
    return text("명령을 처리하지 못했습니다", "Could not process the command")
  return text("설정 정보를 불러오지 못했습니다", "Could not load settings")
}

function recoveryMessage(kind: UserRecoveryKind, text: Text): string {
  const messages: Record<UserRecoveryKind, string> = {
    authentication: text(
      "인증이 만료되었습니다. 다시 인증한 뒤 상태를 확인하세요.",
      "Authentication expired. Sign in again, then check the state.",
    ),
    authorization: text(
      "이 작업에 필요한 권한이 없습니다. 관리자에게 권한을 요청하세요.",
      "You do not have permission for this action. Ask an administrator for access.",
    ),
    conflict: text(
      "화면의 정보가 서버 상태와 다릅니다. 최신 상태를 불러온 뒤 변경 내용을 다시 확인하세요.",
      "This view differs from the server state. Load the latest state, then review your changes.",
    ),
    invalid_input: text(
      "입력값을 적용할 수 없습니다. 표시된 값을 수정한 뒤 다시 확인하세요.",
      "The input cannot be applied. Correct the shown values, then review them again.",
    ),
    unavailable: text(
      "서비스에 일시적으로 연결할 수 없습니다. 상태를 새로 불러와 연결을 확인하세요.",
      "The service is temporarily unavailable. Refresh the state to check the connection.",
    ),
    unsupported: text(
      "현재 환경에서는 이 방법을 사용할 수 없습니다. 지원되는 다른 방법을 선택하세요.",
      "This method is unavailable in the current environment. Choose a supported alternative.",
    ),
    unknown: text(
      "현재 상태를 확인하지 못했습니다. 최신 상태를 다시 불러오세요.",
      "The current state could not be checked. Load the latest state.",
    ),
  }
  return messages[kind]
}

function recoveryActionLabel(action: UserRecoveryProjection["actionLabelKey"], text: Text): string {
  const labels: Record<UserRecoveryProjection["actionLabelKey"], string> = {
    refresh_state: text("상태 새로고침", "Refresh state"),
    edit_input: text("입력 수정", "Edit input"),
    reauthorize: text("다시 인증", "Sign in again"),
    choose_alternative: text("다른 방법 선택", "Choose another method"),
    contact_admin: text("관리자에게 요청", "Ask administrator"),
  }
  return labels[action]
}
