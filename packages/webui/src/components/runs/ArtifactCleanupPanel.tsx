import React from "react"
import type { AdminArtifactCleanupDisplay } from "../../api/client"
import { CollapsibleText } from "./CollapsibleText"

export interface ArtifactCleanupPanelProps {
  display: AdminArtifactCleanupDisplay | null
  loading: boolean
  running: boolean
  message: string
  releaseOutputDir: string
  onReleaseOutputDirChange: (value: string) => void
  onPreview: () => void
  onExecute: () => void
  text: (ko: string, en: string) => string
  displayText: (value: string) => string
  formatTime: (value: number) => string
}

function cleanupStatusClassName(status: AdminArtifactCleanupDisplay["targets"][number]["status"]): string {
  switch (status) {
    case "cleaned":
      return "border-emerald-100 bg-emerald-50 text-emerald-800"
    case "ready":
      return "border-amber-100 bg-amber-50 text-amber-800"
    case "attention_required":
      return "border-rose-100 bg-rose-50 text-rose-800"
    case "empty":
      return "border-stone-200 bg-stone-50 text-stone-600"
  }
}

function cleanupStatusLabel(
  status: AdminArtifactCleanupDisplay["targets"][number]["status"],
  text: (ko: string, en: string) => string,
): string {
  switch (status) {
    case "cleaned":
      return text("정리됨", "Cleaned")
    case "ready":
      return text("정리 가능", "Ready")
    case "attention_required":
      return text("확인 필요", "Needs check")
    case "empty":
      return text("정리할 항목 없음", "Empty")
  }
}

export function ArtifactCleanupPanel({
  display,
  loading,
  running,
  message,
  releaseOutputDir,
  onReleaseOutputDirChange,
  onPreview,
  onExecute,
  text,
  displayText,
  formatTime,
}: ArtifactCleanupPanelProps) {
  const disabled = loading || running
  const canExecute =
    Boolean(display?.targets.some((target) => target.deleteEligibleFiles > 0)) && !disabled
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-900">
            {text("결과물 정리", "Artifact cleanup")}
          </div>
          <div className="mt-1 text-xs leading-5 text-stone-500">
            {text(
              "오래된 진단 내보내기와 외부 서명 요청 파일을 정리합니다.",
              "Cleans old diagnostic exports and external signing request files.",
            )}
          </div>
        </div>
        {display ? (
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
            {formatTime(display.generatedAt)}
          </span>
        ) : null}
      </div>

      <label className="mt-4 grid gap-1.5 text-xs font-semibold text-stone-700">
        {text("릴리스 출력 폴더", "Release output folder")}
        <input
          type="text"
          value={releaseOutputDir}
          onChange={(event) => onReleaseOutputDirChange(event.target.value)}
          placeholder={text("선택 입력", "Optional")}
          className="min-h-11 rounded-xl border border-stone-200 px-3 py-2 text-sm font-normal text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-900/10"
        />
        <span className="text-[11px] font-normal leading-4 text-stone-500">
          {text(
            "비워두면 기본 보관 위치만 확인합니다.",
            "Leave blank to inspect the default retained artifact locations.",
          )}
        </span>
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPreview}
          disabled={disabled}
          className="min-h-11 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-400"
        >
          {loading ? text("확인 중", "Checking") : text("정리 미리보기", "Preview cleanup")}
        </button>
        <button
          type="button"
          onClick={onExecute}
          disabled={!canExecute}
          className="min-h-11 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-400"
        >
          {running ? text("정리 중", "Cleaning") : text("정리 실행", "Run cleanup")}
        </button>
      </div>

      {message ? (
        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">
          <CollapsibleText
            value={displayText(message)}
            threshold={140}
            clampLines={2}
            showMoreLabel={text("전체 보기", "Show more")}
            showLessLabel={text("접기", "Show less")}
            className="break-words [overflow-wrap:anywhere]"
            buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-2">
        {display?.targets.length ? (
          display.targets.map((target) => (
            <article
              key={target.kind}
              className={`rounded-xl border px-3 py-3 ${cleanupStatusClassName(target.status)}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">{displayText(target.label)}</div>
                <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold">
                  {cleanupStatusLabel(target.status, text)}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                <span>{text("정리 가능", "Eligible")} {target.deleteEligibleFiles}</span>
                <span>{displayText(target.deletedLabel)}</span>
                <span>{displayText(target.verifiedLabel)}</span>
                <span>{displayText(target.skippedLabel)}</span>
                <span>{displayText(target.attentionLabel)}</span>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-3 text-xs text-stone-500">
            {loading
              ? text("정리 대상을 확인하는 중입니다.", "Checking cleanup targets.")
              : text("정리 미리보기를 먼저 실행하세요.", "Run preview first.")}
          </div>
        )}
      </div>
    </section>
  )
}
