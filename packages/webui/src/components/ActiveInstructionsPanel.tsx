import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { PromptImprovementHarnessInput, PromptSourceDocument, PromptSourceLocaleParityResult, PromptSourceMetadata, PromptSourceRegressionResult, PromptSourceWriteResult } from "../api/client"
import type { ActiveInstructionsResponse } from "../contracts/instructions"
import { useUiI18n } from "../lib/ui-i18n"

interface ActiveInstructionsPanelProps {
  allowRawPromptEditing?: boolean
}

export function ActiveInstructionsPanel({ allowRawPromptEditing = false }: ActiveInstructionsPanelProps = {}) {
  const { text, displayText } = useUiI18n()
  const [data, setData] = useState<ActiveInstructionsResponse | null>(null)
  const [promptSources, setPromptSources] = useState<PromptSourceMetadata[]>([])
  const [promptSourcesWorkDir, setPromptSourcesWorkDir] = useState("")
  const [promptParity, setPromptParity] = useState<PromptSourceLocaleParityResult | null>(null)
  const [promptRegression, setPromptRegression] = useState<PromptSourceRegressionResult | null>(null)
  const [selectedPromptSourceKey, setSelectedPromptSourceKey] = useState("")
  const [promptSourceDocument, setPromptSourceDocument] = useState<PromptSourceDocument | null>(null)
  const [promptSourceDraft, setPromptSourceDraft] = useState("")
  const [promptSourceResult, setPromptSourceResult] = useState<PromptSourceWriteResult | null>(null)
  const [promptSourceAction, setPromptSourceAction] = useState<"loading" | "saving" | "rollback" | null>(null)
  const [promptSourceError, setPromptSourceError] = useState<string | null>(null)
  const [rawEditorOpen, setRawEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [response, promptSourceResponse, promptParityResponse, promptRegressionResponse] = await Promise.all([
        api.instructionsActive(),
        api.promptSources(),
        api.promptSourcesParity(),
        api.promptSourcesRegression(),
      ])
      setData(response)
      const nextSources = promptSourceResponse.sources
      setPromptSources(nextSources)
      setPromptSourcesWorkDir(promptSourceResponse.workDir)
      setSelectedPromptSourceKey((current) => {
        if (current && nextSources.some((source) => promptSourceKey(source) === current)) return current
        return nextSources[0] ? promptSourceKey(nextSources[0]) : ""
      })
      setPromptParity(promptParityResponse.parity)
      setPromptRegression(promptRegressionResponse.regression)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!allowRawPromptEditing || !rawEditorOpen || !selectedPromptSourceKey) {
      setPromptSourceDocument(null)
      setPromptSourceDraft("")
      return
    }
    void loadPromptSourceDocument(selectedPromptSourceKey)
  }, [allowRawPromptEditing, rawEditorOpen, selectedPromptSourceKey])

  async function loadPromptSourceDocument(key = selectedPromptSourceKey) {
    const parsed = parsePromptSourceKey(key)
    if (!parsed) return
    setPromptSourceAction("loading")
    setPromptSourceError(null)
    try {
      const response = await api.promptSourceRaw(parsed.sourceId, parsed.locale, disclosureWorkDir(promptSourcesWorkDir))
      setPromptSourceDocument(response.source)
      setPromptSourceDraft(response.source.content)
    } catch (sourceError) {
      setPromptSourceError(sourceError instanceof Error ? sourceError.message : String(sourceError))
    } finally {
      setPromptSourceAction(null)
    }
  }

  async function savePromptSource() {
    if (!promptSourceDocument) return
    setPromptSourceAction("saving")
    setPromptSourceError(null)
    try {
      const result = await api.writePromptSource(promptSourceDocument.sourceId, promptSourceDocument.locale, {
        workDir: disclosureWorkDir(promptSourcesWorkDir),
        content: promptSourceDraft,
        createBackup: true,
        harnessInput: buildPromptSourceSaveHarnessInput(promptSourceDocument),
      })
      setPromptSourceResult(result)
      setPromptSourceDocument({ ...result.source, content: promptSourceDraft.trimEnd() })
      setPromptSources((sources) => sources.map((source) => promptSourceKey(source) === promptSourceKey(result.source) ? result.source : source))
      await load()
      await loadPromptSourceDocument(selectedPromptSourceKey)
    } catch (saveError) {
      setPromptSourceError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setPromptSourceAction(null)
    }
  }

  async function rollbackPromptSource() {
    const backup = promptSourceResult?.backup
    if (!backup) return
    setPromptSourceAction("rollback")
    setPromptSourceError(null)
    try {
      await api.rollbackPromptSource({
        workDir: disclosureWorkDir(promptSourcesWorkDir),
        sourceId: backup.sourceId,
        locale: backup.locale,
        backupId: backup.backupId,
        reason: "prompt_source_editor_rollback_requested",
      })
      setPromptSourceResult(null)
      await load()
      await loadPromptSourceDocument(selectedPromptSourceKey)
    } catch (rollbackError) {
      setPromptSourceError(rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
    } finally {
      setPromptSourceAction(null)
    }
  }

  function closeRawEditor() {
    setRawEditorOpen(false)
    setPromptSourceDocument(null)
    setPromptSourceDraft("")
    setPromptSourceResult(null)
    setPromptSourceError(null)
  }

  const activeInstructionsAreRaw = data?.disclosure.state === "raw_authorized"
  const hiddenValue = text("내부 세부 정보 숨김", "Internal details hidden")

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-900">{text("활성 지침", "Active Instructions")}</div>
          <div className="mt-1 text-xs text-stone-500">{text("현재 앱이 적용 중인 지침 묶음을 확인합니다.", "Review the instruction set currently applied by the app.")}</div>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700"
        >
          {text("새로고침", "Refresh")}
        </button>
      </div>

      {loading ? <div className="mt-4 text-sm text-stone-500">{text("불러오는 중...", "Loading...")}</div> : null}
      {error ? <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{displayText(error)}</div> : null}

      {!loading && !error && data ? (
        <div className="mt-4 space-y-4">
          <div className="space-y-2 text-sm text-stone-600">
            <StatusRow label={text("작업 위치", "Work location")} value={activeInstructionsAreRaw ? data.workDir : hiddenValue} mono={activeInstructionsAreRaw} />
            <StatusRow label={text("프로젝트 루트", "Project root")} value={activeInstructionsAreRaw ? data.gitRoot ?? "" : hiddenValue} mono={activeInstructionsAreRaw} />
            <StatusRow label={text("불러온 소스 수", "Loaded sources")} value={String(data.sources.length)} />
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{text("지침 파일", "Instruction files")}</div>
                  <div className="mt-1 text-xs text-stone-500">
                    {text("적용 상태와 안전 점검 결과를 확인합니다.", "Review applied state and safety checks.")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className={`rounded-full px-2 py-1 text-xs font-semibold ${promptParity?.ok === false ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {promptParity?.ok === false ? text("언어 점검 필요", "Language check needed") : text("언어 점검 정상", "Language check OK")}
                  </div>
                  <div className={`rounded-full px-2 py-1 text-xs font-semibold ${promptRegression?.ok === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {promptRegression?.ok === false ? text("변경 검증 실패", "Change check failed") : text("변경 검증 정상", "Change check OK")}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {promptSources.map((source, index) => (
                  <div key={`${source.sourceId}-${source.locale}`} className="rounded-lg bg-white px-3 py-2 text-xs text-stone-600">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-900">{text(`지침 파일 ${index + 1}`, `Instruction file ${index + 1}`)}</span>
                      <span className="text-[11px] text-stone-500">{source.checksum.startsWith("[") ? hiddenValue : text("검증 기준 연결됨", "Check baseline linked")}</span>
                    </div>
                    <div className="mt-1 break-all text-[11px] text-stone-400">
                      {source.path.startsWith("[") ? hiddenValue : text("저장 위치는 일반 화면에 표시하지 않습니다.", "Storage location is hidden in the default view.")}
                    </div>
                  </div>
                ))}
              </div>
              {promptParity?.issues.length ? (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  {promptParity.issues.slice(0, 5).map((issue) => issue.message).join(" / ")}
                </div>
              ) : null}
              {promptRegression ? (
                <div className={`mt-3 rounded-lg px-3 py-2 text-xs leading-5 ${promptRegression.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                  <div className="font-semibold">
                    {text("지침 변경 검증", "Instruction change check")}: {promptRegression.issues.length} {text("개 이슈", "issues")}
                  </div>
                  {promptRegression.issues.length ? (
                    <div className="mt-1 space-y-1">
                      {promptRegression.issues.slice(0, 6).map((issue, index) => (
                        <div key={`${issue.code}-${issue.sourceId ?? "assembly"}-${issue.locale ?? "all"}-${index}`}>
                          {displayText(issue.message)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1">
                      {text("책임 분리, 언어 구성, 변경 영향 확인이 모두 통과했습니다.", "Responsibility split, language coverage, and change-impact checks passed.")}
                    </div>
                  )}
                </div>
              ) : null}

              {allowRawPromptEditing ? (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{text("지침 편집", "Instruction editor")}</div>
                    <div className="mt-1 text-xs leading-5 text-stone-500">
                      {text("지침 원문은 명시적으로 편집기를 열 때만 불러옵니다.", "Instruction text is loaded only after the editor is explicitly opened.")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => rawEditorOpen ? closeRawEditor() : setRawEditorOpen(true)}
                    className="rounded-xl border border-stone-200 bg-stone-900 px-3 py-2 text-xs font-semibold text-white"
                  >
                    {rawEditorOpen ? text("편집 닫기", "Close editor") : text("편집 열기", "Open editor")}
                  </button>
                </div>
              ) : null}

              {allowRawPromptEditing && rawEditorOpen ? (
                <div className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <label className="min-w-0 flex-1 text-xs font-semibold text-stone-600">
                    {text("편집할 지침 선택", "Select instruction to edit")}
                    <select
                      value={selectedPromptSourceKey}
                      onChange={(event) => {
                        setPromptSourceResult(null)
                        setSelectedPromptSourceKey(event.target.value)
                      }}
                      className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
                    >
                      {promptSources.map((source) => (
                        <option key={promptSourceKey(source)} value={promptSourceKey(source)}>
                          {source.sourceId}:{source.locale} · {source.version}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void loadPromptSourceDocument()}
                      disabled={!selectedPromptSourceKey || promptSourceAction !== null}
                      className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 disabled:opacity-50"
                    >
                      {text("다시 불러오기", "Reload")}
                    </button>
                    <button
                      onClick={() => void savePromptSource()}
                      disabled={!promptSourceDocument || promptSourceAction !== null || promptSourceDraft.trim() === promptSourceDocument.content.trim()}
                      className="rounded-xl bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {promptSourceAction === "saving" ? text("저장 중", "Saving") : text("백업 후 저장", "Save with backup")}
                    </button>
                    <button
                      onClick={() => void rollbackPromptSource()}
                      disabled={!promptSourceResult?.backup || promptSourceAction !== null}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-40"
                    >
                      {promptSourceAction === "rollback" ? text("복구 중", "Rolling back") : text("직전 백업 복구", "Rollback")}
                    </button>
                  </div>
                </div>

                {promptSourceError ? <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{displayText(promptSourceError)}</div> : null}
                {promptSourceAction === "loading" ? <div className="mt-3 text-xs text-stone-500">{text("지침 불러오는 중...", "Loading instruction...")}</div> : null}

                {promptSourceDocument ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                      <span className="rounded-full bg-stone-50 px-2 py-1">{promptSourceDocument.sourceId}:{promptSourceDocument.locale}</span>
                      <span className="rounded-full bg-stone-50 px-2 py-1">{text("검증 기준 연결됨", "Check baseline linked")}</span>
                      <span className="rounded-full bg-stone-50 px-2 py-1">{promptSourceDocument.usageScope}</span>
                    </div>
                    <textarea
                      value={promptSourceDraft}
                      onChange={(event) => setPromptSourceDraft(event.target.value)}
                      className="mt-3 min-h-56 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 font-mono text-xs leading-5 text-stone-800 outline-none focus:border-stone-400"
                      spellCheck={false}
                    />
                  </>
                ) : null}

                {promptSourceResult ? (
                  <div className="mt-4 rounded-xl bg-stone-50 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                      <span className="font-semibold text-stone-900">{text("변경 결과", "Change result")}</span>
                      <span>{text("검증 기준 갱신됨", "Check baseline updated")}</span>
                    </div>
                    <div className="mt-3 max-h-64 overflow-auto rounded-lg bg-white p-2 font-mono text-[11px] leading-5 text-stone-700">
                      {promptSourceResult.diff.lines.filter((line) => line.kind !== "unchanged").slice(0, 80).map((line, index) => (
                        <div key={`${line.kind}-${line.beforeLine ?? ""}-${line.afterLine ?? ""}-${index}`} className={line.kind === "added" ? "text-emerald-700" : line.kind === "removed" ? "text-red-700" : "text-amber-700"}>
                          {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : "~"} {line.after ?? line.before ?? ""}
                        </div>
                      ))}
                      {promptSourceResult.diff.lines.every((line) => line.kind === "unchanged") ? <div>{text("변경 없음", "No changes")}</div> : null}
                    </div>
                  </div>
                ) : null}
              </div>
              ) : null}
            </div>

            {data.sources.length > 0 ? (
              data.sources.map((source) => (
                <div key={`${source.path}-${source.level}`} className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-900">{source.scope}</div>
                      <div className="mt-1 break-all text-xs text-stone-500">{activeInstructionsAreRaw ? source.path : hiddenValue}</div>
                    </div>
                    <div className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-stone-700">
                      L{source.level}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
                    <span className="rounded-full bg-white px-2 py-1">{source.loaded ? text("불러옴", "Loaded") : text("오류", "Error")}</span>
                    <span className="rounded-full bg-white px-2 py-1">{source.size} bytes</span>
                  </div>
                  {source.error ? <div className="mt-3 text-xs leading-5 text-red-700">{displayText(source.error)}</div> : null}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-5 text-sm text-stone-500">
                {text("활성 지침 파일이 없습니다.", "There are no active instruction files.")}
              </div>
            )}
          </div>

          {data.mergedText.trim() && data.disclosure.state === "raw_authorized" ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{text("병합 미리보기", "Merged Preview")}</div>
              <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-stone-700">
                {data.mergedText.slice(0, 2000)}
              </pre>
            </div>
          ) : (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs leading-5 text-stone-500">
              {text("병합된 시스템 지침 원문은 기본 화면에 표시하지 않습니다.", "Merged system instruction text is not shown in the default view.")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function StatusRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
      <span className="text-stone-500">{label}</span>
      <span className={`break-all text-right font-medium text-stone-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  )
}

function promptSourceKey(source: { sourceId: string; locale: "ko" | "en" }): string {
  return `${source.sourceId}::${source.locale}`
}

function disclosureWorkDir(workDir: string): string | undefined {
  const trimmed = workDir.trim()
  if (!trimmed || trimmed.startsWith("[")) return undefined
  return trimmed
}

function buildPromptSourceSaveHarnessInput(source: PromptSourceDocument): PromptImprovementHarnessInput {
  const sourceRef = `${source.sourceId}:${source.locale}`
  return {
    improvementGoal: `Save reviewed prompt source ${sourceRef}.`,
    improvementKind: "prompt_source",
    improvingAgentName: "Knowbee",
    improvingAgentType: "main",
    parentReviewerAgentName: "",
    triggerSource: "admin_request",
    targetPromptSources: [sourceRef],
    activeHarnessVersion: "prompt_improvement.md:active",
    targetHarnessSources: [],
    agentOwnedPromptScope: [source.sourceId],
    currentBehavior: "The active prompt source draft differs from the saved prompt source.",
    desiredBehavior: "The reviewed prompt source is saved as the next source-backed prompt version.",
    userReactionEvidence: ["User explicitly clicked save in the prompt source editor."],
    responseStrategyTarget: source.sourceId,
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not change unrelated prompt sources.", "Do not change runtime environment settings."],
    allowedChangeScope: [sourceRef],
    requiredInvariants: ["identity", "safety", "memory_isolation", "tool_policy", "prompt_visibility"],
    requiredTests: ["prompt-source-regression", "prompt-source-locale-parity"],
    approvalMode: "admin_required",
    approvalRecord: {
      approvedBy: "admin:prompt-source-editor",
      approvedAt: new Date().toISOString(),
      approvalScope: ["apply_change"],
      targetPromptSources: [sourceRef],
      targetHarnessSources: [],
      riskAccepted: "medium",
    },
    rollbackPlan: "Use the generated prompt source backup to restore the previous source.",
  }
}

function parsePromptSourceKey(key: string): { sourceId: string; locale: "ko" | "en" } | null {
  const [sourceId, locale] = key.split("::")
  if (!sourceId || (locale !== "ko" && locale !== "en")) return null
  return { sourceId, locale }
}
