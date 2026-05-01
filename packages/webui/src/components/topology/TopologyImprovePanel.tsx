import * as React from "react"
import type {
  EnterpriseEntityRef,
  EnterpriseRelationType,
  EnterpriseTopology,
} from "../../contracts/enterprise-topology"
import { ENTERPRISE_RELATION_TYPES } from "../../contracts/enterprise-topology"
import {
  ENTERPRISE_TOPOLOGY_GUI_DRAFT_SCHEMA_VERSION,
  createGuiDraftOperationBase,
  type EnterpriseTopologyGuiOperation,
  type EnterpriseTopologyQuickFixId,
  type EnterpriseTopologyQuickFixOperationPlan,
  type EnterpriseTopologyQuickFixOperationPreview,
  type EnterpriseTopologyObservedEdgeRecord,
} from "../../lib/enterprise-topology-operations"
import { useUiI18n } from "../../lib/ui-i18n"
import type { TopologyRunTraceOverlayInput } from "./TopologyRunTraceOverlay"

export interface TopologyImproveFindingView {
  id: string
  kind: string
  severity: string
  title: string
  detail: string
  targetId: string | null
  relatedEntities: EnterpriseEntityRef[]
  actionPlans: EnterpriseTopologyQuickFixOperationPlan[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function entityRef(value: unknown): EnterpriseEntityRef | null {
  if (!isRecord(value) || typeof value.entityType !== "string" || typeof value.id !== "string") return null
  return { entityType: value.entityType, id: value.id } as EnterpriseEntityRef
}

function entityRefKey(ref: EnterpriseEntityRef): string {
  return `${ref.entityType}:${ref.id}`
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]+/g, "-")
}

function relationType(value: unknown, fallback: EnterpriseRelationType = "delegates_to"): EnterpriseRelationType {
  return typeof value === "string" && ENTERPRISE_RELATION_TYPES.includes(value as EnterpriseRelationType)
    ? value as EnterpriseRelationType
    : fallback
}

function relationTypeForObservedEdge(edge: EnterpriseTopologyObservedEdgeRecord): EnterpriseRelationType {
  if (edge.edgeKind === "tool_call") return "uses_tool"
  if (edge.edgeKind === "observed_owner") return "owns"
  return "delegates_to"
}

function findingRecord(finding: unknown): Record<string, unknown> {
  return isRecord(finding) ? finding : {}
}

function findingDetailRecord(finding: Record<string, unknown>): Record<string, unknown> {
  return isRecord(finding.detail) ? finding.detail : {}
}

function relatedEntitiesFromFinding(finding: Record<string, unknown>): EnterpriseEntityRef[] {
  const relatedEntities = Array.isArray(finding.relatedEntities)
    ? finding.relatedEntities.map(entityRef).filter((ref): ref is EnterpriseEntityRef => Boolean(ref))
    : []
  if (relatedEntities.length > 0) return relatedEntities

  const nodeId = typeof finding.nodeId === "string"
    ? finding.nodeId
    : typeof finding.targetNodeId === "string"
      ? finding.targetNodeId
      : null
  if (nodeId) return [{ entityType: "node", id: nodeId }]
  return []
}

function targetIdForEntities(entities: readonly EnterpriseEntityRef[]): string | null {
  const firstNode = entities.find((entity) => entity.entityType === "node")
  if (firstNode) return `node:${firstNode.id}`
  const first = entities[0]
  return first ? `${first.entityType}:${first.id}` : null
}

function preview(operation: EnterpriseTopologyGuiOperation): EnterpriseTopologyQuickFixOperationPreview {
  if (operation.op === "createNode") {
    return {
      operationId: operation.operationId,
      op: operation.op,
      targetId: operation.nodeId,
      summary: `node 생성: ${operation.name ?? operation.nodeId}`,
    }
  }
  if (operation.op === "updateNode") {
    return {
      operationId: operation.operationId,
      op: operation.op,
      targetId: operation.nodeId,
      summary: `node 수정: ${operation.nodeId}`,
    }
  }
  if (operation.op === "createRelation") {
    return {
      operationId: operation.operationId,
      op: operation.op,
      targetId: operation.relationId,
      summary: `관계 후보: ${operation.from.id} -> ${operation.to.id}`,
    }
  }
  if (operation.op === "updateRelation") {
    return {
      operationId: operation.operationId,
      op: operation.op,
      targetId: operation.relationId,
      summary: `관계 수정: ${operation.relationId}`,
    }
  }
  return {
    operationId: operation.operationId,
    op: operation.op,
    targetId: "delete",
    summary: operation.label ?? operation.op,
  }
}

function plan(
  quickFixId: EnterpriseTopologyQuickFixId,
  label: string,
  operations: EnterpriseTopologyGuiOperation[],
): EnterpriseTopologyQuickFixOperationPlan {
  return {
    quickFixId,
    label,
    operations,
    preview: operations.map(preview),
  }
}

function createRelationPlan(input: {
  entities: EnterpriseEntityRef[]
  relationType: EnterpriseRelationType
  label: string
  at: number
}): EnterpriseTopologyQuickFixOperationPlan | null {
  const [from, to] = input.entities
  if (!from || !to) return null
  const relationId = sanitizeId(`relation:observed:${input.relationType}:${from.id}:${to.id}`)
  return plan("connect_selected_nodes", input.label, [{
    ...createGuiDraftOperationBase("createRelation", {
      operationId: `improve:connect-observed:${relationId}`,
      at: input.at,
      label: input.label,
    }),
    relationId,
    relationType: input.relationType,
    from,
    to,
    label: input.label,
  }])
}

function fallbackPlan(nodeId: string, at: number): EnterpriseTopologyQuickFixOperationPlan {
  const fallbackNodeId = sanitizeId(`node:fallback:${nodeId}`)
  const operations: EnterpriseTopologyGuiOperation[] = [
    {
      schemaVersion: ENTERPRISE_TOPOLOGY_GUI_DRAFT_SCHEMA_VERSION,
      operationId: `improve:fallback-node:${nodeId}`,
      op: "createNode",
      at,
      label: "fallback path 추가",
      nodeId: fallbackNodeId,
      name: "Fallback 처리",
      nodeType: "review_node",
    },
    {
      ...createGuiDraftOperationBase("createRelation", {
        operationId: `improve:fallback-relation:${nodeId}`,
        at,
        label: "fallback path 연결",
      }),
      relationId: sanitizeId(`relation:fallback:${nodeId}:${fallbackNodeId}`),
      relationType: "delegates_to",
      from: { entityType: "node", id: nodeId },
      to: { entityType: "node", id: fallbackNodeId },
      label: "fallback",
    },
    {
      ...createGuiDraftOperationBase("updateNode", {
        operationId: `improve:fallback-policy:${nodeId}`,
        at,
        label: "fallback 정책 설정",
      }),
      nodeId,
      patch: {
        failurePolicy: {
          failureReportRequired: true,
          allowPartialSuccess: true,
          maxRetryAttempts: 0,
          fallbackNodeIds: [fallbackNodeId],
        },
        recoveryPolicy: {
          retryAllowed: false,
          redelegationAllowed: true,
          fallbackAllowed: true,
          partialSuccessAllowed: true,
        },
      },
    },
  ]
  return plan("add_fallback_path", "fallback path 추가", operations)
}

function backupNodePlan(nodeId: string, at: number): EnterpriseTopologyQuickFixOperationPlan {
  const backupNodeId = sanitizeId(`node:backup:${nodeId}`)
  return plan("add_child_task", "backup node 연결", [
    {
      schemaVersion: ENTERPRISE_TOPOLOGY_GUI_DRAFT_SCHEMA_VERSION,
      operationId: `improve:backup-node:${nodeId}`,
      op: "createNode",
      at,
      label: "backup node 추가",
      nodeId: backupNodeId,
      name: "Backup 처리",
      nodeType: "function",
    },
    {
      ...createGuiDraftOperationBase("createRelation", {
        operationId: `improve:backup-relation:${nodeId}`,
        at,
        label: "backup node 연결",
      }),
      relationId: sanitizeId(`relation:backup:${nodeId}:${backupNodeId}`),
      relationType: "delegates_to",
      from: { entityType: "node", id: nodeId },
      to: { entityType: "node", id: backupNodeId },
      label: "backup",
    },
  ])
}

function approvalPlan(nodeId: string, at: number): EnterpriseTopologyQuickFixOperationPlan {
  const approvalNodeId = sanitizeId(`node:approval:${nodeId}`)
  return plan("add_approval_step", "승인 단계 추가", [
    {
      schemaVersion: ENTERPRISE_TOPOLOGY_GUI_DRAFT_SCHEMA_VERSION,
      operationId: `improve:approval-node:${nodeId}`,
      op: "createNode",
      at,
      label: "승인 단계 추가",
      nodeId: approvalNodeId,
      name: "승인 확인",
      nodeType: "approval_node",
    },
    {
      ...createGuiDraftOperationBase("createRelation", {
        operationId: `improve:approval-relation:${nodeId}`,
        at,
        label: "승인 단계 연결",
      }),
      relationId: sanitizeId(`relation:approval:${nodeId}:${approvalNodeId}`),
      relationType: "approves",
      from: { entityType: "node", id: approvalNodeId },
      to: { entityType: "node", id: nodeId },
      label: "승인",
    },
  ])
}

export function buildTopologyImproveActionPlans(input: {
  finding: unknown
  topology?: EnterpriseTopology | null
  now?: number
}): EnterpriseTopologyQuickFixOperationPlan[] {
  const record = findingRecord(input.finding)
  const detail = findingDetailRecord(record)
  const kind = String(record.findingKind ?? record.kind ?? detail.reasonCode ?? record.reasonCode ?? "gap_finding")
  const reasonCode = String(detail.reasonCode ?? record.reasonCode ?? kind)
  const entities = relatedEntitiesFromFinding(record)
  const targetNode = entities.find((entity) => entity.entityType === "node")
  const at = input.now ?? Date.now()
  const plans: EnterpriseTopologyQuickFixOperationPlan[] = []

  if (kind === "observed_only_relation" || reasonCode === "observed_relation_not_declared") {
    const relationPlan = createRelationPlan({
      entities,
      relationType: relationType(detail.relationType),
      label: "실제 경로를 연결 후보로 추가",
      at,
    })
    if (relationPlan) plans.push(relationPlan)
  }

  if (targetNode && (
    kind === "single_point_of_failure" ||
    kind === "missing_backup" ||
    reasonCode === "execution_node_without_backup" ||
    reasonCode === "failure_node_missing_fallback"
  )) {
    plans.push(fallbackPlan(targetNode.id, at), backupNodePlan(targetNode.id, at))
  }

  if (targetNode && (
    kind === "approval_bottleneck" ||
    reasonCode === "single_approver_multiple_targets" ||
    reasonCode === "approval_missing"
  )) {
    plans.push(approvalPlan(targetNode.id, at))
  }

  if (plans.length === 0 && targetNode) plans.push(fallbackPlan(targetNode.id, at))
  return plans
}

function findingViewFromGap(finding: unknown, index: number, topology?: EnterpriseTopology | null): TopologyImproveFindingView {
  const record = findingRecord(finding)
  const detail = findingDetailRecord(record)
  const kind = String(record.findingKind ?? record.kind ?? detail.reasonCode ?? record.reasonCode ?? "gap_finding")
  const severity = String(record.severity ?? "medium")
  const relatedEntities = relatedEntitiesFromFinding(record)
  return {
    id: String(record.findingId ?? `gap:${kind}:${index}`),
    kind,
    severity,
    title: String(record.summary ?? record.title ?? "개선 후보가 있습니다."),
    detail: String(record.recommendation ?? record.message ?? record.detail ?? detail.reasonCode ?? kind),
    targetId: targetIdForEntities(relatedEntities),
    relatedEntities,
    actionPlans: buildTopologyImproveActionPlans({ finding, topology }),
  }
}

function findingViewFromObservedEdge(edge: EnterpriseTopologyObservedEdgeRecord, index: number, topology?: EnterpriseTopology | null): TopologyImproveFindingView {
  const relation = relationTypeForObservedEdge(edge)
  const relatedEntities: EnterpriseEntityRef[] = [
    { entityType: "node", id: edge.fromNodeId },
    { entityType: relation === "uses_tool" ? "enterprise_tool" : "node", id: edge.toNodeId },
  ]
  const synthetic = {
    findingId: `observed:${edge.edgeId}`,
    findingKind: "observed_only_relation",
    severity: "medium",
    summary: `실제 실행 연결 후보: ${edge.fromNodeId} -> ${edge.toNodeId}`,
    recommendation: "실제 실행 경로가 맞다면 선언된 관계 후보로 추가하세요.",
    relatedEntities,
    detail: { reasonCode: "observed_relation_not_declared", relationType: relation },
  }
  return {
    ...findingViewFromGap(synthetic, index, topology),
    targetId: `observed:${edge.edgeId}`,
  }
}

export function buildTopologyImproveFindings(input: {
  gapFindings?: unknown[]
  observedEdges?: EnterpriseTopologyObservedEdgeRecord[]
  topology?: EnterpriseTopology | null
}): TopologyImproveFindingView[] {
  const gapViews = (input.gapFindings ?? []).map((finding, index) =>
    findingViewFromGap(finding, index, input.topology)
  )
  const gapKeys = new Set(gapViews.map((finding) => finding.relatedEntities.map(entityRefKey).join("->")))
  const observedViews = (input.observedEdges ?? [])
    .map((edge, index) => findingViewFromObservedEdge(edge, index, input.topology))
    .filter((finding) => !gapKeys.has(finding.relatedEntities.map(entityRefKey).join("->")))
  return [...gapViews, ...observedViews]
}

function severityClassName(severity: string): string {
  if (severity === "critical" || severity === "high") return "border-red-200 bg-red-50 text-red-950"
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-950"
  return "border-stone-200 bg-stone-50 text-stone-800"
}

function previewText(plan: EnterpriseTopologyQuickFixOperationPlan): string {
  return plan.preview.map((item) => item.summary).join(" / ")
}

export function TopologyImprovePanel({
  topology,
  traceOverlay,
  gapFindings = [],
  observedEdges = [],
  onSelectTarget,
  onApplyQuickFix,
  onRunLayerRequest,
}: {
  topology?: EnterpriseTopology | null
  traceOverlay?: TopologyRunTraceOverlayInput | null
  gapFindings?: unknown[]
  observedEdges?: EnterpriseTopologyObservedEdgeRecord[]
  onSelectTarget?: (targetId: string) => void
  onApplyQuickFix?: (operations: EnterpriseTopologyGuiOperation[]) => void
  onRunLayerRequest?: () => void
}) {
  const { text } = useUiI18n()
  const findings = React.useMemo(
    () => buildTopologyImproveFindings({ gapFindings, observedEdges, topology }),
    [gapFindings, observedEdges, topology],
  )

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4" data-testid="topology-improve-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-950">
            {text("Improve", "Improve")}
          </div>
          <div className="mt-1 text-xs leading-5 text-stone-500">
            {text("실행 결과에서 설계와 다른 점을 찾고, 적용 전 미리보기합니다.", "Find drift from runtime evidence and preview changes before applying.")}
          </div>
        </div>
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
          {findings.length}
        </span>
      </div>

      {!traceOverlay?.run ? (
        <div className="mt-3 rounded-lg border border-dashed border-stone-200 bg-stone-50 p-3 text-xs text-stone-600" data-testid="topology-improve-empty-state">
          <div className="font-semibold text-stone-800">
            {text("아직 개선할 실행 기록이 없습니다.", "No run evidence yet.")}
          </div>
          <div className="mt-1 leading-5">
            {text("먼저 실행 레이어에서 한 번 실행하면 실제 경로와 gap을 확인할 수 있습니다.", "Run once from the run layer to inspect observed paths and gaps.")}
          </div>
          <button
            type="button"
            onClick={onRunLayerRequest}
            className="mt-3 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white"
            data-testid="topology-improve-run-cta"
          >
            {text("실행으로 이동", "Go to run")}
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {findings.length === 0 ? (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
              {text("현재 실행에서 확인된 gap이 없습니다.", "No gaps were found in the current run.")}
            </div>
          ) : null}
          {findings.map((finding) => {
            const primaryPlan = finding.actionPlans[0]
            return (
              <div
                key={finding.id}
                className={`rounded-lg border p-3 ${severityClassName(finding.severity)}`}
                data-testid="topology-improve-gap-finding"
                data-target-id={finding.targetId ?? undefined}
              >
                <button
                  type="button"
                  onClick={() => finding.targetId ? onSelectTarget?.(finding.targetId) : undefined}
                  className="block w-full text-left"
                  data-testid="topology-improve-gap-target"
                >
                  <span className="block text-xs font-semibold text-stone-950">{finding.title}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-stone-600">{finding.detail}</span>
                </button>
                <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-stone-500">
                  <span>{finding.kind}</span>
                  <span>{finding.severity}</span>
                  {finding.targetId ? <span>{finding.targetId}</span> : null}
                </div>
                {primaryPlan ? (
                  <div className="mt-2 rounded-md border border-white/70 bg-white/80 p-2" data-testid="topology-improve-action-preview">
                    <div className="text-[11px] font-semibold text-stone-700">
                      {text("미리보기", "Preview")}: {primaryPlan.label}
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-stone-500">
                      {previewText(primaryPlan)}
                    </div>
                    <button
                      type="button"
                      onClick={() => onApplyQuickFix?.(primaryPlan.operations)}
                      className="mt-2 rounded-md bg-stone-900 px-2.5 py-1 text-[11px] font-semibold text-white"
                      data-testid={`topology-improve-action-${primaryPlan.quickFixId}`}
                    >
                      {text("적용", "Apply")}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
