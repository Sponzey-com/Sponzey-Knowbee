import React from "react"
import type { ResourceReadState } from "../lib/resource-read-state"
import { type RecoverySubject, UserRecoveryNotice } from "./UserRecoveryNotice"
import { Button } from "./ui/Button"

type Text = (ko: string, en: string) => string

export interface ResourceReadStatusNoticeProps<T> {
  state: ResourceReadState<T>
  subject: RecoverySubject
  text: Text
  onRefresh: () => void
}

export function ResourceReadStatusNotice<T>({
  state,
  subject,
  text,
  onRefresh,
}: ResourceReadStatusNoticeProps<T>) {
  if (state.status === "failed" && state.failure) {
    return (
      <UserRecoveryNotice
        projection={state.failure}
        subject={subject}
        text={text}
        onAction={state.failure.action === "refresh_state" ? onRefresh : undefined}
      />
    )
  }
  if (state.status === "stale" && state.failure && state.observedAt !== null) {
    return (
      <output className="block rounded-[var(--ui-surface-radius)] border border-amber-200 bg-amber-50 px-4 py-4 text-amber-950">
        <span className="block text-sm font-semibold">
          {text("이전 정보를 표시하고 있습니다", "Showing previously verified information")}
        </span>
        <span className="mt-1 block text-sm leading-6">
          {text(
            "최신 상태를 확인하지 못했습니다. 표시된 정보를 기준으로 변경하지 말고 상태를 새로고침하세요.",
            "The latest state could not be checked. Do not act on this view until you refresh it.",
          )}
        </span>
        <span className="mt-1 block text-xs text-amber-900">
          {text("마지막 확인", "Last verified")}: {formatObservedAt(state.observedAt)}
        </span>
        <span className="mt-3 block">
          <Button onClick={onRefresh}>{text("상태 새로고침", "Refresh state")}</Button>
        </span>
      </output>
    )
  }
  if (state.status === "loading" && state.data !== null && state.observedAt !== null) {
    return (
      <output className="block text-sm text-stone-600">
        {text(
          "최신 상태를 확인하는 동안 이전 정보를 유지합니다.",
          "Keeping the previous information while checking the latest state.",
        )}
      </output>
    )
  }
  return null
}

function formatObservedAt(observedAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(observedAt))
}
