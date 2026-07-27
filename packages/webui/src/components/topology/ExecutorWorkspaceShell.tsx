// biome-ignore lint/style/useImportType: this package still renders JSX through the React classic runtime in tests.
import * as React from "react"
import {
  type TopologyWorkspaceLayer,
  type TopologyWorkspaceLayerCopy,
  topologyWorkspaceVisibleLayers,
} from "../../lib/topology-workspace-copy"
import { useUiI18n } from "../../lib/ui-i18n"
import { projectUserTaskAction } from "../../lib/user-task-action"

export interface ExecutorWorkspaceRecommendedExecutor {
  id: string
  labelKo: string
  labelEn: string
  descriptionKo: string
  descriptionEn: string
}

export const EXECUTOR_WORKSPACE_RECOMMENDED_EXECUTORS: ExecutorWorkspaceRecommendedExecutor[] = [
  {
    id: "customer-intake",
    labelKo: "고객 접수 담당자",
    labelEn: "Customer intake sub-agent",
    descriptionKo: "요청을 접수하고 필요한 정보를 확인한다.",
    descriptionEn: "Receives the request and checks required information.",
  },
  {
    id: "reviewer",
    labelKo: "검토자",
    labelEn: "Reviewer",
    descriptionKo: "결과를 확인하고 다음 단계로 넘긴다.",
    descriptionEn: "Reviews the result and moves it to the next step.",
  },
  {
    id: "operator",
    labelKo: "운영 담당자",
    labelEn: "Operations sub-agent",
    descriptionKo: "정해진 절차에 따라 업무를 처리한다.",
    descriptionEn: "Handles work according to the agreed process.",
  },
  {
    id: "exception-handler",
    labelKo: "예외 처리 담당자",
    labelEn: "Exception handler",
    descriptionKo: "실패나 보류 상황을 확인하고 정리한다.",
    descriptionEn: "Handles failures or blocked cases.",
  },
]

export interface ExecutorWorkspaceShellProps {
  selectedLayer?: TopologyWorkspaceLayer
  visibleLayers?: TopologyWorkspaceLayerCopy[]
  savedStatusLabel?: string
  validationLabel?: string
  rootAgentLabel?: string
  executorCount?: number
  connectionCount?: number
  recommendedExecutors?: ExecutorWorkspaceRecommendedExecutor[]
  showFirstStart?: boolean
  showLeftRail?: boolean
  firstStartSlot?: React.ReactNode
  validateDisabled?: boolean
  prepareRunDisabled?: boolean
  saveDisabled?: boolean
  deleteDisabled?: boolean
  onSelectLayer?: (layer: TopologyWorkspaceLayer) => void
  onValidate?: () => void
  onPrepareRun?: () => void
  onSaveDraft?: () => void
  onAddExecutor?: () => void
  onDeleteExecutor?: () => void
  onAutoLayout?: () => void
  onAddSection?: () => void
  onStartRecommendedFlow?: () => void
  children?: React.ReactNode
}

export function ExecutorWorkspaceShell({
  selectedLayer = "build",
  visibleLayers = topologyWorkspaceVisibleLayers("simple"),
  savedStatusLabel,
  validationLabel,
  rootAgentLabel,
  executorCount = 0,
  connectionCount = 0,
  recommendedExecutors = EXECUTOR_WORKSPACE_RECOMMENDED_EXECUTORS,
  showFirstStart = true,
  showLeftRail = true,
  firstStartSlot,
  validateDisabled = false,
  prepareRunDisabled = false,
  saveDisabled = false,
  deleteDisabled,
  onSelectLayer,
  onValidate,
  onPrepareRun,
  onSaveDraft,
  onAddExecutor,
  onDeleteExecutor,
  onAutoLayout,
  onAddSection,
  onStartRecommendedFlow,
  children,
}: ExecutorWorkspaceShellProps) {
  const { text } = useUiI18n()
  const resolvedSavedLabel = savedStatusLabel ?? text("저장됨", "Saved")
  const resolvedValidationLabel = validationLabel ?? text("검증 대기", "Ready for validation")
  const rootAgentCopyLabel = workspaceShellRootAgentLabel(rootAgentLabel, text)
  const hasWorkflow = executorCount > 0 || connectionCount > 0
  const showEmptyStart = showFirstStart && !hasWorkflow
  const showManagementRail = showLeftRail && hasWorkflow
  const isDeleteDisabled = deleteDisabled ?? (!hasWorkflow || !onDeleteExecutor)
  const addAction = projectUserTaskAction({
    available: Boolean(onAddExecutor),
    outcome: "opens_sub_agent_editor",
  })
  const deleteAction = projectUserTaskAction({
    available: !isDeleteDisabled,
    outcome: "deletes_selected_sub_agent",
    blockedReason: !hasWorkflow ? "nothing_selected" : "command_unavailable",
  })
  const saveAction = projectUserTaskAction({
    available: !saveDisabled && Boolean(onSaveDraft || onValidate),
    outcome: "saves_sub_agent_setup",
    blockedReason: saveDisabled ? "validation_failed" : "command_unavailable",
  })
  const autoLayoutAction = projectUserTaskAction({
    available: Boolean(onAutoLayout) && hasWorkflow,
    outcome: "arranges_sub_agent_cards",
    blockedReason: !hasWorkflow ? "empty_workspace" : "command_unavailable",
  })
  const addSectionAction = projectUserTaskAction({
    available: Boolean(onAddSection),
    outcome: "adds_workspace_section",
  })
  const blockedTitle = (reasonCode: string | undefined) => {
    if (reasonCode === "validation_failed") return text("입력 내용을 확인해야 저장할 수 있습니다.", "Check the required fields before saving.")
    if (reasonCode === "nothing_selected") return text("삭제할 서브 에이전트가 없습니다.", "There is no sub-agent to delete.")
    if (reasonCode === "empty_workspace") return text("서브 에이전트를 추가한 뒤 정렬할 수 있습니다.", "Add a sub-agent before arranging the workspace.")
    return text("현재 사용할 수 없는 작업입니다.", "This action is currently unavailable.")
  }
  const guideSteps = [
    text("1. 서브 에이전트 추가", "1. Add sub-agent"),
    text("2. 서브 에이전트끼리 연결", "2. Connect sub-agents"),
    text("3. 요청이 오면 자동 실행", "3. Auto-run on request"),
  ]

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-stone-100 text-stone-950"
      data-testid="executor-workspace-shell"
    >
      <header
        className="shrink-0 border-b border-stone-200 bg-white px-4 py-3"
        data-testid="executor-workspace-topbar"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
              {text("서브 에이전트 설정", "Sub-agent settings")}
            </div>
            <h1 className="mt-0.5 text-lg font-semibold leading-6">
              {text("서브 에이전트 구성하기", "Configure sub-agents")}
            </h1>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {rootAgentLabel === undefined
                ? text(
                    "서브 에이전트를 추가하고 서로 선으로 연결하세요. 채널이나 사용자 요청이 오면 메인 에이전트가 이 구성으로 일을 위임합니다.",
                    "Add sub-agents and connect them with lines. The main agent delegates work through this setup when a channel or user request arrives.",
                  )
                : text(
                    `서브 에이전트를 추가하고 서로 선으로 연결하세요. 채널이나 사용자 요청이 오면 ${rootAgentCopyLabel} 기준으로 이 구성에 일을 위임합니다.`,
                    `Add sub-agents and connect them with lines. ${rootAgentCopyLabel} delegates work through this setup when a channel or user request arrives.`,
                  )}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {hasWorkflow ? (
              <>
                <span
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                  data-testid="executor-workspace-save-status"
                >
                  {resolvedSavedLabel}
                </span>
                <span
                  className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700"
                  data-testid="executor-workspace-validation-status"
                >
                  {resolvedValidationLabel}
                </span>
              </>
            ) : null}
            {!showEmptyStart ? (
              <>
                <button
                type="button"
                onClick={onAddExecutor}
                disabled={!onAddExecutor}
                className="min-h-8 min-w-0 whitespace-normal rounded-md bg-stone-900 px-3 py-1.5 text-xs font-semibold leading-4 text-white disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="executor-workspace-top-add-executor"
                data-user-task-state={addAction.state}
                data-user-task-reason={addAction.reasonCode}
                data-ui-priority="primary_action"
                title={addAction.state === "blocked" ? blockedTitle(addAction.reasonCode) : undefined}
              >
                {text("서브 에이전트 추가", "Add sub-agent")}
                </button>
                <button
              type="button"
              onClick={onDeleteExecutor}
              disabled={isDeleteDisabled}
              className="min-h-8 min-w-0 whitespace-normal rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold leading-4 text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="executor-workspace-top-delete-executor"
              data-user-task-state={deleteAction.state}
              data-user-task-reason={deleteAction.reasonCode}
              title={deleteAction.state === "blocked" ? blockedTitle(deleteAction.reasonCode) : undefined}
            >
              {text("삭제", "Delete")}
                </button>
                <button
              type="button"
              onClick={onSaveDraft ?? onValidate}
              disabled={saveDisabled || (!onSaveDraft && !onValidate)}
              className="min-h-8 min-w-0 whitespace-normal rounded-md bg-stone-900 px-3 py-1.5 text-xs font-semibold leading-4 text-white disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="executor-workspace-top-save"
              data-user-task-state={saveAction.state}
              data-user-task-reason={saveAction.reasonCode}
              title={saveAction.state === "blocked" ? blockedTitle(saveAction.reasonCode) : undefined}
            >
              {text("저장", "Save")}
                </button>
                <button
              type="button"
              onClick={onAutoLayout}
              disabled={!onAutoLayout || !hasWorkflow}
              className="min-h-8 min-w-0 whitespace-normal rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold leading-4 text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="executor-workspace-top-auto-layout"
              data-user-task-state={autoLayoutAction.state}
              data-user-task-reason={autoLayoutAction.reasonCode}
              title={autoLayoutAction.state === "blocked" ? blockedTitle(autoLayoutAction.reasonCode) : undefined}
            >
              {text("자동 정렬", "Auto layout")}
                </button>
              </>
            ) : null}
          </div>
        </div>
        {!showEmptyStart ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5" data-testid="executor-workspace-guide-steps">
              {guideSteps.map((step) => (
                <span
                  key={step}
                  className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700"
                >
                  {step}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <div
        className={
          showManagementRail
            ? "grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)]"
            : "flex min-h-0 flex-1 overflow-hidden"
        }
      >
        {showManagementRail ? (
          <aside
            className="min-h-0 overflow-y-auto border-r border-stone-200 bg-white p-3"
            data-testid="executor-workspace-left-rail"
          >
            <div className="grid gap-2">
              <button
                type="button"
                onClick={onAddExecutor}
                disabled={!onAddExecutor}
                className="min-h-10 min-w-0 whitespace-normal rounded-md bg-stone-900 px-3 py-2 text-left text-sm font-semibold leading-5 text-white"
                data-testid="executor-workspace-add-executor"
                data-user-task-state={addAction.state}
                data-user-task-reason={addAction.reasonCode}
              >
                {text("+ 서브 에이전트 추가", "+ Add sub-agent")}
              </button>
              <button
                type="button"
                onClick={onAddSection}
                disabled={!onAddSection}
                className="min-h-9 min-w-0 whitespace-normal rounded-md border border-stone-200 bg-white px-3 py-2 text-left text-xs font-semibold leading-4 text-stone-800"
                data-testid="executor-workspace-add-section"
                data-user-task-state={addSectionAction.state}
                data-user-task-reason={addSectionAction.reasonCode}
                title={addSectionAction.state === "blocked" ? blockedTitle(addSectionAction.reasonCode) : undefined}
              >
                {text("+ 영역 추가", "+ Add section")}
              </button>
            </div>

            <section className="mt-4" data-testid="executor-workspace-executor-list">
              <div className="text-xs font-semibold text-stone-950">
                {text("서브 에이전트 목록", "Sub-agents")}
              </div>
              <div className="mt-1 rounded-md border border-stone-200 bg-stone-50 px-2.5 py-2 text-[11px] leading-4 text-stone-600">
                {executorCount === 0
                  ? text("아직 서브 에이전트가 없습니다.", "No sub-agents yet.")
                  : text(
                      `${executorCount}개 서브 에이전트 / ${connectionCount}개 연결`,
                      `${executorCount} sub-agents / ${connectionCount} connections`,
                    )}
              </div>
            </section>

            <section className="mt-4" data-testid="executor-workspace-recommended-executors">
              <div className="text-xs font-semibold text-stone-950">
                {text("추천 서브 에이전트", "Recommended sub-agents")}
              </div>
              <div className="mt-2 grid gap-1.5">
                {recommendedExecutors.map((executor) => (
                  <button
                    key={executor.id}
                    type="button"
                    onClick={onAddExecutor}
                    disabled={!onAddExecutor}
                    title={text(executor.descriptionKo, executor.descriptionEn)}
                    className="min-w-0 break-words rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold leading-4 text-stone-700 [overflow-wrap:anywhere] hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`executor-workspace-recommended-${executor.id}`}
                    data-user-task-state={addAction.state}
                    data-user-task-reason={addAction.reasonCode}
                  >
                    {text(executor.labelKo, executor.labelEn)}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        ) : null}

        <main
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 md:overflow-hidden md:pb-0"
          data-testid="executor-workspace-main"
        >
          {showEmptyStart
            ? (firstStartSlot ?? (
                <ExecutorWorkspaceEmptyStart
                  recommendedExecutors={recommendedExecutors}
                  onAddExecutor={onAddExecutor}
                  onStartRecommendedFlow={onStartRecommendedFlow}
                />
              ))
            : null}
          {children}
        </main>
      </div>
    </div>
  )
}

function workspaceShellRootAgentLabel(
  value: string | undefined,
  text: ReturnType<typeof useUiI18n>["text"],
): string {
  const trimmed = value?.trim()
  if (!trimmed || isDefaultRootAgentAlias(trimmed)) return text("메인 에이전트", "the main agent")
  return trimmed
}

function isDefaultRootAgentAlias(value: string): boolean {
  const normalized = value.trim().normalize("NFKC").toLocaleLowerCase()
  return normalized === "knowbee" || normalized === "노비"
}

function ExecutorWorkspaceEmptyStart({
  recommendedExecutors,
  onAddExecutor,
  onStartRecommendedFlow,
}: {
  recommendedExecutors: ExecutorWorkspaceRecommendedExecutor[]
  onAddExecutor?: () => void
  onStartRecommendedFlow?: () => void
}) {
  const { text } = useUiI18n()
  const addAction = projectUserTaskAction({
    available: Boolean(onAddExecutor),
    outcome: "opens_sub_agent_editor",
  })
  const recommendedFlowAction = projectUserTaskAction({
    available: Boolean(onStartRecommendedFlow),
    outcome: "creates_recommended_flow",
  })
  return (
    <section
      className="border-b border-stone-200 bg-white px-4 py-3"
      data-testid="executor-workspace-first-start"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-stone-950">
            {text("첫 서브 에이전트 구성 만들기", "Create your first sub-agent setup")}
          </h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {recommendedExecutors.slice(0, 4).map((executor) => (
              <span
                key={executor.id}
                className="break-words rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold leading-4 text-stone-700 [overflow-wrap:anywhere]"
              >
                {text(executor.labelKo, executor.labelEn)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onAddExecutor}
            disabled={!onAddExecutor}
            className="min-h-9 min-w-0 whitespace-normal rounded-md bg-stone-900 px-3 py-2 text-xs font-semibold leading-4 text-white"
            data-testid="executor-workspace-first-add-executor"
            data-user-task-state={addAction.state}
            data-user-task-reason={addAction.reasonCode}
            data-ui-priority="primary_action"
          >
            {text("+ 서브 에이전트 추가", "+ Add sub-agent")}
          </button>
          {onStartRecommendedFlow ? (
            <button
              type="button"
              onClick={onStartRecommendedFlow}
              className="min-h-9 min-w-0 whitespace-normal rounded-md border border-stone-200 bg-white px-3 py-2 text-xs font-semibold leading-4 text-stone-800"
              data-testid="executor-workspace-start-recommended-flow"
              data-user-task-state={recommendedFlowAction.state}
              data-user-task-reason={recommendedFlowAction.reasonCode}
            >
              {text("추천 흐름으로 시작", "Start from recommended flow")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
