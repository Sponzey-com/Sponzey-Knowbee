import React from "react"
import { getBackendDisplayLabel } from "../../lib/ai-display"
import { useUiI18n } from "../../lib/ui-i18n"

export function formatRunTargetLabel(targetId: string | undefined, targetLabel: string | undefined, language: "ko" | "en", text: (ko: string, en: string) => string): string {
  if (!targetId && !targetLabel?.trim()) return text("실행 대상 미선정", "No target selected")
  if (targetLabel?.trim()) return getBackendDisplayLabel(targetId, targetLabel, language)
  const knownBackendLabel = getBackendDisplayLabel(targetId, undefined, language)
  if (targetId && knownBackendLabel && knownBackendLabel !== targetId) return knownBackendLabel
  return text("실행 대상 미선정", "No target selected")
}

export function hasUserFacingRunTargetLabel(targetId: string | undefined, targetLabel: string | undefined, language: "ko" | "en"): boolean {
  if (targetLabel?.trim()) return true
  const knownBackendLabel = getBackendDisplayLabel(targetId, undefined, language)
  return Boolean(targetId && knownBackendLabel && knownBackendLabel !== targetId)
}

export function RunTargetBadge({ targetId, targetLabel }: { targetId?: string; targetLabel?: string }) {
  const { text, language } = useUiI18n()

  return (
    <span className="inline-flex items-center rounded-full bg-stone-900 px-2.5 py-1 text-[11px] font-medium text-white">
      {formatRunTargetLabel(targetId, targetLabel, language, text)}
    </span>
  )
}
