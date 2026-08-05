import React from "react"
import type { SetupChecksResponse } from "../../api/adapters/types"
import { useUiI18n } from "../../lib/ui-i18n"

export function SetupChecksPanel({
  checks,
  loading,
  onRefresh,
}: {
  checks: SetupChecksResponse | null
  loading: boolean
  onRefresh: () => void
}) {
  const { text } = useUiI18n()

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-stone-900">{text("초기 설정 점검", "Initial setup check")}</div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? text("갱신 중...", "Refreshing...") : text("다시 확인", "Refresh")}
        </button>
      </div>

      {checks ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <CheckStat label={text("초기 설정 완료", "Initial setup complete")} value={checks.setupCompleted ? text("예", "Yes") : text("아니오", "No")} tone={checks.setupCompleted ? "ready" : "disabled"} />
            <CheckStat label={text("텔레그램 연결 정보", "Telegram connection")} value={checks.telegramConfigured ? text("입력됨", "Entered") : text("비어 있음", "Empty")} tone={checks.telegramConfigured ? "ready" : "disabled"} />
            <CheckStat label={text("화면 접속 보호", "Web app protection")} value={checks.authEnabled ? text("켜짐", "On") : text("꺼짐", "Off")} tone={checks.authEnabled ? "ready" : "disabled"} />
            <CheckStat label={text("예약 실행", "Scheduled execution")} value={checks.schedulerEnabled ? text("사용 가능", "Available") : text("준비 안 됨", "Not ready")} tone={checks.schedulerEnabled ? "ready" : "disabled"} />
          </div>
          <div className="space-y-3 rounded-2xl bg-stone-50 p-4 text-sm text-stone-700">
            <StorageStatusRow label={text("로컬 저장소", "Local storage")} ready={hasStorageSignal(checks.stateDir)} readyText={text("사용 준비됨", "Ready")} missingText={text("확인 필요", "Needs check")} />
            <StorageStatusRow label={text("설정 저장", "Settings storage")} ready={hasStorageSignal(checks.configFile)} readyText={text("저장됨", "Saved")} missingText={text("아직 없음", "Not created yet")} />
            <StorageStatusRow label={text("진행 상태 저장", "Progress storage")} ready={hasStorageSignal(checks.setupStateFile)} readyText={text("보존됨", "Saved")} missingText={text("아직 없음", "Not created yet")} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CheckStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "ready" | "disabled"
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${tone === "ready" ? "bg-emerald-500" : "bg-stone-300"}`} />
        <span className="text-sm font-semibold text-stone-900">{value}</span>
      </div>
    </div>
  )
}

function StorageStatusRow({
  label,
  ready,
  readyText,
  missingText,
}: {
  label: string
  ready: boolean
  readyText: string
  missingText: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`text-sm font-semibold ${ready ? "text-emerald-700" : "text-amber-700"}`}>
        {ready ? readyText : missingText}
      </div>
    </div>
  )
}

function hasStorageSignal(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0
}
