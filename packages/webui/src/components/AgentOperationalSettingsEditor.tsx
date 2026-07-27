import React from "react"
import type { AgentOperationalSettingsProjection } from "../contracts/agents"
import {
  type AgentOperationalSettingsDraft,
  type AgentOperationalSettingsSection,
  operationalPermissionElevation,
  operationalSettingsSectionDirty,
  validateOperationalSettingsDraft,
} from "../lib/agent-operational-settings-draft"
import { Button } from "./ui/Button"
import { InlineNotice } from "./ui/InlineNotice"

const RISK_LEVELS = ["safe", "moderate", "external", "sensitive", "dangerous"] as const

export function AgentOperationalSettingsEditor({
  section,
  projection,
  draft,
  saving,
  elevationConfirmed,
  onDraft,
  onElevationConfirmed,
  onSave,
  text,
}: {
  section: AgentOperationalSettingsSection
  projection: AgentOperationalSettingsProjection
  draft: AgentOperationalSettingsDraft
  saving: boolean
  elevationConfirmed: boolean
  onDraft(draft: AgentOperationalSettingsDraft): void
  onElevationConfirmed(confirmed: boolean): void
  onSave(): void
  text: (ko: string, en: string) => string
}) {
  const dirty = operationalSettingsSectionDirty(section, draft, projection)
  const validationCode = validateOperationalSettingsDraft(section, draft)
  const elevation = section === "permissions" && operationalPermissionElevation(draft, projection)
  const fieldClass =
    "min-h-11 w-full rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm"
  const patchModel = (value: Partial<AgentOperationalSettingsDraft["model"]>) =>
    onDraft({ ...draft, model: { ...draft.model, ...value } })
  const patchMemory = (value: Partial<AgentOperationalSettingsDraft["memory"]>) =>
    onDraft({ ...draft, memory: { ...draft.memory, ...value } })
  const patchPermission = (value: Partial<AgentOperationalSettingsDraft["permission"]>) => {
    onDraft({ ...draft, permission: { ...draft.permission, ...value } })
    onElevationConfirmed(false)
  }

  return (
    <div className="grid min-w-0 gap-4" data-testid={`agent-${section}-settings-form`}>
      {section === "ai" ? (
        <>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
            <span>{text("개별 모델 사용", "Use a dedicated model")}</span>
            <input
              type="checkbox"
              checked={draft.model.configured}
              disabled={saving}
              onChange={(event) => patchModel({ configured: event.target.checked })}
              className="h-5 w-5"
            />
          </label>
          {draft.model.configured ? (
            <div className="grid gap-3">
              {[
                ["provider", text("제공자", "Provider"), "providerName"],
                ["model", text("모델", "Model"), "modelName"],
                ["effort", text("추론 강도", "Effort"), "effort"],
                ["fallback", text("대체 모델", "Fallback model"), "fallbackModelName"],
              ].map(([id, label, key]) => (
                <label key={id} className="grid gap-1 text-sm font-medium">
                  <span>{label}</span>
                  <input
                    aria-label={label}
                    value={draft.model[key as keyof typeof draft.model] as string}
                    disabled={saving}
                    onChange={(event) => patchModel({ [key]: event.target.value })}
                    className={fieldClass}
                  />
                </label>
              ))}
            </div>
          ) : (
            <InlineNotice tone="info" title={text("공통 모델 사용", "Using the shared model")}>
              {text(
                "저장하면 이 에이전트의 개별 모델 설정이 해제됩니다.",
                "Saving removes this agent's dedicated model setting.",
              )}
            </InlineNotice>
          )}
        </>
      ) : null}

      {section === "memory" ? (
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            <span>{text("보존 정책", "Retention")}</span>
            <select
              value={draft.memory.retentionPolicy}
              disabled={saving}
              onChange={(event) =>
                patchMemory({
                  retentionPolicy: event.target.value as typeof draft.memory.retentionPolicy,
                })
              }
              className={fieldClass}
            >
              <option value="session">session</option>
              <option value="short_term">short_term</option>
              <option value="long_term">long_term</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            <span>{text("압축 방식", "Compact mode")}</span>
            <select
              value={draft.memory.capsuleMode}
              disabled={saving}
              onChange={(event) =>
                patchMemory({ capsuleMode: event.target.value as typeof draft.memory.capsuleMode })
              }
              className={fieldClass}
            >
              <option value="session_compaction">session_compaction</option>
              <option value="rolling_summary">rolling_summary</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              <span>{text("최근 대화 유지", "Raw window")}</span>
              <input
                type="number"
                min={1}
                value={draft.memory.rawWindowSize}
                disabled={saving}
                onChange={(event) => patchMemory({ rawWindowSize: Number(event.target.value) })}
                className={fieldClass}
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              <span>{text("압축 기준", "Compact threshold")}</span>
              <input
                type="number"
                min={2}
                value={draft.memory.compactThreshold}
                disabled={saving}
                onChange={(event) => patchMemory({ compactThreshold: Number(event.target.value) })}
                className={fieldClass}
              />
            </label>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
            <span>{text("메모리 반영 전 검토", "Review memory writeback")}</span>
            <input
              type="checkbox"
              checked={draft.memory.writebackReviewRequired}
              disabled={saving}
              onChange={(event) => patchMemory({ writebackReviewRequired: event.target.checked })}
              className="h-5 w-5"
            />
          </label>
        </div>
      ) : null}

      {section === "permissions" ? (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              <span>{text("위험 상한", "Risk ceiling")}</span>
              <select
                value={draft.permission.riskCeiling}
                disabled={saving}
                onChange={(event) =>
                  patchPermission({
                    riskCeiling: event.target.value as typeof draft.permission.riskCeiling,
                  })
                }
                className={fieldClass}
              >
                {RISK_LEVELS.map((risk) => (
                  <option key={risk}>{risk}</option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              <span>{text("승인 시작", "Approval from")}</span>
              <select
                value={draft.permission.approvalRequiredFrom}
                disabled={saving}
                onChange={(event) =>
                  patchPermission({
                    approvalRequiredFrom: event.target
                      .value as typeof draft.permission.approvalRequiredFrom,
                  })
                }
                className={fieldClass}
              >
                {RISK_LEVELS.map((risk) => (
                  <option key={risk}>{risk}</option>
                ))}
              </select>
            </label>
          </div>
          {[
            ["allowExternalNetwork", text("외부 네트워크", "External network")],
            ["allowFilesystemWrite", text("파일 쓰기", "Filesystem write")],
            ["allowShellExecution", text("명령 실행", "Shell execution")],
            ["allowScreenControl", text("화면 제어", "Screen control")],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--ui-surface-radius)] border border-stone-200 px-3 text-sm font-medium"
            >
              <span>{label}</span>
              <input
                type="checkbox"
                checked={draft.permission[key as keyof typeof draft.permission] as boolean}
                disabled={saving}
                onChange={(event) => patchPermission({ [key]: event.target.checked })}
                className="h-5 w-5"
              />
            </label>
          ))}
          <p className="text-sm text-stone-600">
            {text("허용 경로", "Allowed paths")}: {projection.permission.allowedPathCount}
          </p>
          {elevation ? (
            <label className="flex min-h-11 items-start gap-3 rounded-[var(--ui-surface-radius)] border border-amber-300 bg-amber-50 p-3 text-sm">
              <input
                type="checkbox"
                checked={elevationConfirmed}
                disabled={saving}
                onChange={(event) => onElevationConfirmed(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <span>
                {text(
                  "권한이 확대되는 변경임을 확인했습니다.",
                  "I confirm this permission expansion.",
                )}
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      {validationCode ? (
        <InlineNotice tone="danger" title={text("입력값 확인", "Review values")}>
          {validationCode === "memory_compact_threshold_invalid"
            ? text(
                "압축 기준은 최근 대화 유지 값보다 커야 합니다.",
                "Compact threshold must be greater than the raw window.",
              )
            : text("필수 값을 입력해 주세요.", "Enter all required values.")}
        </InlineNotice>
      ) : null}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-stone-200 bg-white py-3">
        <span className="text-sm text-stone-600">
          {dirty ? text("저장되지 않은 변경", "Unsaved changes") : text("저장됨", "Saved")}
        </span>
        <Button
          variant="primary"
          pending={saving}
          disabled={!dirty || Boolean(validationCode) || (elevation && !elevationConfirmed)}
          onClick={onSave}
        >
          {text("설정 저장", "Save settings")}
        </Button>
      </div>
    </div>
  )
}
