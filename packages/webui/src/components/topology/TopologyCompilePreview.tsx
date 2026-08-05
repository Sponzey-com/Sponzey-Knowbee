import * as React from "react"
import type {
  EnterpriseTopologyGuiDraftCompiledPreviewResponse,
  EnterpriseTopologyRuntimeProfilePreview,
} from "../../lib/enterprise-topology-operations"
import { useUiI18n } from "../../lib/ui-i18n"

export function compiledDelegationNodeIds(
  preview: EnterpriseTopologyGuiDraftCompiledPreviewResponse | null | undefined,
): string[] {
  if (!preview?.ok) return []
  return Object.keys(preview.delegationTree.edges)
    .flatMap((parentId) => [parentId, ...(preview.delegationTree.edges[parentId] ?? [])])
    .filter((nodeId, index, values) => values.indexOf(nodeId) === index)
}

function runtimeProfileTypeLabel(nodeType: string): string {
  if (nodeType === "review_node") return "검토 서브 에이전트"
  if (nodeType === "approval_node") return "승인 서브 에이전트"
  if (nodeType === "decision_node") return "판단 서브 에이전트"
  if (nodeType === "automation_node") return "자동화 서브 에이전트"
  if (nodeType === "function" || nodeType === "work_node") return "업무 서브 에이전트"
  return "서브 에이전트"
}

function runtimeProfileLabelMap(
  profiles: EnterpriseTopologyRuntimeProfilePreview[],
): Map<string, string> {
  return new Map(profiles.map((profile) => [profile.nodeId, profile.name || "이름 없는 서브 에이전트"]))
}

function nodeDisplayLabel(
  nodeId: string | null | undefined,
  labelByNodeId: Map<string, string>,
): string {
  if (!nodeId) return "-"
  return labelByNodeId.get(nodeId) ?? "알 수 없는 서브 에이전트"
}

function nodeDisplayLabels(nodeIds: string[], labelByNodeId: Map<string, string>): string {
  return nodeIds.map((nodeId) => nodeDisplayLabel(nodeId, labelByNodeId)).join(", ") || "-"
}

function compileIssueMessage(issue: { reasonCode?: string; message?: string }): string {
  if (issue.reasonCode === "tool_permission_missing") {
    return "서브 에이전트가 필요한 도구 권한을 갖고 있지 않습니다."
  }
  if (issue.reasonCode === "system_permission_missing") {
    return "서브 에이전트가 필요한 시스템 권한을 갖고 있지 않습니다."
  }
  if (issue.reasonCode === "approval_authority_missing") {
    return "승인이 필요한 연결에 승인 담당자가 없습니다."
  }
  if (issue.reasonCode === "missing_success_criteria") {
    return "완료 여부를 판단할 기준이 없습니다."
  }
  if (issue.reasonCode === "invalid_relation_endpoint") {
    return "연결 대상에 맞는 연결 종류로 수정해야 합니다."
  }
  return issue.message
    ?.replace(/\bNode\b/g, "서브 에이전트")
    .replace(/\bnode\b/g, "서브 에이전트")
    ?? "실행 준비 문제를 확인해야 합니다."
}

function RuntimeProfileCard({ profile }: { profile: EnterpriseTopologyRuntimeProfilePreview }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="text-xs font-semibold text-stone-950">{profile.name}</div>
      <div className="mt-1 text-[11px] text-stone-500">
        {runtimeProfileTypeLabel(profile.nodeType)}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] font-semibold text-stone-600">
        <span className="rounded-md bg-white px-2 py-1">하위 서브 에이전트 {profile.childNodeIds.length}</span>
        <span className="rounded-md bg-white px-2 py-1">도구 {profile.allowedToolIds.length}</span>
        <span className="rounded-md bg-white px-2 py-1">
          시스템 {profile.allowedSystemIds.length}
        </span>
        <span className="rounded-md bg-white px-2 py-1">
          실패 보고 {profile.failureReportRequired ? "켬" : "끔"}
        </span>
      </div>
    </div>
  )
}

export function TopologyCompilePreview({
  preview,
  loading = false,
}: {
  preview?: EnterpriseTopologyGuiDraftCompiledPreviewResponse | null
  loading?: boolean
}) {
  const { text } = useUiI18n()
  const labelByNodeId = preview?.ok
    ? runtimeProfileLabelMap(preview.runtimeProfiles)
    : new Map<string, string>()

  return (
    <section
      className="rounded-lg border border-stone-200 bg-white p-4"
      data-testid="enterprise-topology-compile-preview"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-950">
            {text("실행 구조 미리보기", "Execution preview")}
          </div>
          <div className="mt-1 text-xs text-stone-500">
            {text(
              "실행 전 위임 구조와 실행 프로필을 읽기 전용으로 확인합니다.",
              "Read-only sub-agent handoff structure and runtime profile before execution.",
            )}
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            preview?.ok
              ? "bg-emerald-100 text-emerald-800"
              : preview
                ? "bg-amber-100 text-amber-800"
                : "bg-stone-100 text-stone-700"
          }`}
        >
          {loading
            ? text("로딩", "Loading")
            : preview?.ok
              ? text("실행 가능", "Ready to run")
              : preview
                ? text("차단", "Blocked")
                : text("대기", "Waiting")}
        </span>
      </div>

      {!preview ? (
        <div className="mt-3 rounded-lg border border-dashed border-stone-200 p-3 text-xs leading-5 text-stone-500">
          {text("검증 후 미리보기가 표시됩니다.", "Preview appears after validation.")}
        </div>
      ) : preview.ok ? (
        <div className="mt-3 grid gap-3">
          <div className="rounded-lg border border-sky-100 bg-sky-50 p-3">
            <div className="text-xs font-semibold text-sky-900">
              {text("서브 에이전트 전달 구조", "Sub-agent handoff structure")}
            </div>
            <div className="mt-2 grid gap-1 text-[11px] font-semibold text-sky-900">
              <span>
                {text("시작", "Entry")}:{" "}
                {nodeDisplayLabel(preview.delegationTree.entryNodeId, labelByNodeId)}
              </span>
              <span>
                {text("최상위", "Roots")}:{" "}
                {nodeDisplayLabels(preview.delegationTree.rootNodeIds, labelByNodeId)}
              </span>
              <span>
                {text("종료", "Exits")}:{" "}
                {nodeDisplayLabels(preview.delegationTree.exitNodeIds, labelByNodeId)}
              </span>
            </div>
            <div className="mt-2 grid gap-1 text-[11px] text-sky-800">
              {Object.entries(preview.delegationTree.edges).map(([parentId, childIds]) => (
                <div key={parentId} data-testid="compiled-delegation-edge">
                  {nodeDisplayLabel(parentId, labelByNodeId)} -&gt;{" "}
                  {nodeDisplayLabels(childIds, labelByNodeId)}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase text-stone-500">
              {text("실행 프로필 스냅샷", "Runtime profile snapshot")}
            </div>
            <div className="mt-2 grid gap-2">
              {preview.runtimeProfiles.slice(0, 3).map((profile) => (
                <RuntimeProfileCard key={profile.nodeId} profile={profile} />
              ))}
            </div>
          </div>

          {preview.workOrderPreview ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <div className="text-xs font-semibold text-stone-950">
                {text("작업 지시 미리보기", "Work instruction preview")}
              </div>
              <div className="mt-2 grid gap-1 text-[11px] text-stone-600">
                <span>
                  {text("대상", "Target")}:{" "}
                  {nodeDisplayLabel(preview.workOrderPreview.to.id, labelByNodeId)}
                </span>
                <span>
                  {text("목표", "Objective")}: {preview.workOrderPreview.objective}
                </span>
                <span>
                  {text("완료 기준", "Criteria")}: {preview.workOrderPreview.successCriteria.length}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"
          data-testid="enterprise-topology-compile-blocked"
        >
          <div className="font-semibold">
            {text("실행 준비가 막혔습니다.", "Execution preparation is blocked by setup issues.")}
          </div>
          <div className="mt-1">
            {preview.issues
              .map((issue) => compileIssueMessage(issue))
              .slice(0, 2)
              .join(" / ")}
          </div>
        </div>
      )}
    </section>
  )
}
