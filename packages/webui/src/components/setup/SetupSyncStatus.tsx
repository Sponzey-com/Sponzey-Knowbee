import React, { useEffect, useRef } from "react"
import { useUiI18n } from "../../lib/ui-i18n"
import type { UserRecoveryProjection } from "../../lib/user-recovery"
import { UserRecoveryNotice } from "../UserRecoveryNotice"

export function SetupSyncStatus({
  saving,
  lastSavedAt,
  saveRecovery,
  onRecover,
}: {
  saving: boolean
  lastSavedAt: number | null
  saveRecovery: UserRecoveryProjection | null
  onRecover: () => void
}) {
  const { text, formatTime } = useUiI18n()
  const recoveryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (saveRecovery) recoveryRef.current?.focus()
  }, [saveRecovery])

  if (!saving && !lastSavedAt && !saveRecovery) return null

  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${saving ? "bg-amber-100 text-amber-800" : saveRecovery ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}
        >
          {saving
            ? text("저장 중", "Saving")
            : saveRecovery
              ? text("저장 실패", "Save failed")
              : text("로컬 저장 연결됨", "Local save connected")}
        </span>
        {lastSavedAt ? (
          <span className="text-stone-500">
            {text("마지막 저장", "Last saved")}{" "}
            {formatTime(lastSavedAt, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        ) : null}
      </div>
      {saveRecovery ? (
        <div ref={recoveryRef} className="mt-3 outline-none" tabIndex={-1}>
          <UserRecoveryNotice
            projection={saveRecovery}
            subject="settings"
            text={text}
            onAction={saveRecovery.action === "refresh_state" ? onRecover : undefined}
          />
        </div>
      ) : null}
    </div>
  )
}
