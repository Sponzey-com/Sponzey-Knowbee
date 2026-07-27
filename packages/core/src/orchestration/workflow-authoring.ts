import type {
  AgentExecutionDecision,
  AgentExecutionRequiredOutput,
} from "./execution-decision-contract.js"
import type { StructuredTaskScope } from "../contracts/sub-agent-orchestration.js"

export interface AuthoredWorkflowDependency {
  fromScopeIndex: number
  toScopeIndex: number
  reasonCode: "workflow_unit_dependency"
}

export interface AuthoredWorkflowDraft {
  state: "ready"
  taskScopes: StructuredTaskScope[]
  dependencies: AuthoredWorkflowDependency[]
  reasonCodes: string[]
}

export interface RejectedWorkflowDraft {
  state: "rejected"
  taskScopes: []
  dependencies: []
  reasonCodes: string[]
}

export type WorkflowAuthoringResult = AuthoredWorkflowDraft | RejectedWorkflowDraft

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function outputsFor(
  unitOutputs: AgentExecutionRequiredOutput[] | undefined,
  decisionOutputs: AgentExecutionRequiredOutput[],
  successCriteria: string[],
): StructuredTaskScope["expectedOutputs"] {
  return (unitOutputs?.length ? unitOutputs : decisionOutputs).map((output) => ({
    outputId: output.id,
    kind: "text",
    description: output.label,
    required: true,
    acceptance: {
      requiredEvidenceKinds: [],
      artifactRequired: false,
      reasonCodes: unique(output.acceptance_criteria?.length
        ? output.acceptance_criteria
        : successCriteria),
    },
  }))
}

function validateStepOutputs(scopes: StructuredTaskScope[]): string[] {
  const reasons: string[] = []
  for (const scope of scopes) {
    const outputIds = new Set<string>()
    for (const output of scope.expectedOutputs) {
      const outputId = output.outputId.trim()
      if (!outputId || !output.description.trim()) reasons.push("workflow_output_invalid")
      if (outputId && outputIds.has(outputId)) reasons.push("workflow_output_id_duplicate")
      if (outputId) outputIds.add(outputId)
      if (unique(output.acceptance.reasonCodes).length === 0) {
        reasons.push("workflow_verification_missing")
      }
    }
  }
  return unique(reasons)
}

function topologicalOrder(
  nodeCount: number,
  dependencies: AuthoredWorkflowDependency[],
): number[] | undefined {
  const outgoing = new Map<number, number[]>()
  const indegree = Array.from({ length: nodeCount }, () => 0)
  for (const edge of dependencies) {
    outgoing.set(edge.fromScopeIndex, [...(outgoing.get(edge.fromScopeIndex) ?? []), edge.toScopeIndex])
    indegree[edge.toScopeIndex] = (indegree[edge.toScopeIndex] ?? 0) + 1
  }
  const queue = indegree.flatMap((degree, index) => degree === 0 ? [index] : [])
  const order: number[] = []
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    order.push(current)
    for (const next of outgoing.get(current) ?? []) {
      indegree[next] = (indegree[next] ?? 0) - 1
      if (indegree[next] === 0) queue.push(next)
    }
  }
  return order.length === nodeCount ? order : undefined
}

export function authorWorkflowFromExecutionDecision(
  decision: AgentExecutionDecision | undefined,
): WorkflowAuthoringResult | undefined {
  if (!decision || decision.task_profile.task_units.length <= 1) return undefined
  const units = decision.task_profile.task_units
  const successCriteria = unique(decision.task_profile.success_criteria)
  const reasons: string[] = []
  if (successCriteria.length === 0) reasons.push("completion_contract_missing")

  const indexById = new Map<string, number>()
  units.forEach((unit, index) => {
    const id = unit.id.trim()
    if (!id || indexById.has(id)) reasons.push("workflow_unit_id_invalid")
    else indexById.set(id, index)
  })

  const dependencies: AuthoredWorkflowDependency[] = []
  units.forEach((unit, toScopeIndex) => {
    for (const dependencyId of unique(unit.depends_on_unit_ids ?? [])) {
      const fromScopeIndex = indexById.get(dependencyId)
      if (fromScopeIndex === undefined) reasons.push("dependency_missing")
      else dependencies.push({ fromScopeIndex, toScopeIndex, reasonCode: "workflow_unit_dependency" })
    }
  })
  const order = topologicalOrder(units.length, dependencies)
  if (!order) reasons.push("dependency_cycle")

  const sourceTaskScopes = units.map((unit): StructuredTaskScope => ({
    goal: unit.goal.trim(),
    intentType: decision.domain,
    actionType: unit.title.trim(),
    constraints: unique(decision.task_profile.constraints ?? []),
    expectedOutputs: outputsFor(unit.required_outputs, decision.required_outputs, successCriteria),
    reasonCodes: ["llm_authored_workflow", `workflow_unit:${unit.id.trim()}`],
  }))
  if (sourceTaskScopes.some((scope) => !scope.goal || !scope.actionType)) reasons.push("workflow_unit_invalid")
  if (sourceTaskScopes.some((scope) => scope.expectedOutputs.length === 0)) reasons.push("completion_contract_missing")
  reasons.push(...validateStepOutputs(sourceTaskScopes))

  if (reasons.length > 0) {
    return { state: "rejected", taskScopes: [], dependencies: [], reasonCodes: unique(reasons) }
  }
  const stableOrder = order ?? units.map((_, index) => index)
  const projectedIndexBySource = new Map(stableOrder.map((sourceIndex, index) => [sourceIndex, index]))
  const taskScopes = stableOrder.map((sourceIndex) => sourceTaskScopes[sourceIndex]!)
  const orderedDependencies = dependencies.map((edge) => ({
    fromScopeIndex: projectedIndexBySource.get(edge.fromScopeIndex)!,
    toScopeIndex: projectedIndexBySource.get(edge.toScopeIndex)!,
    reasonCode: edge.reasonCode,
  }))
  return {
    state: "ready",
    taskScopes,
    dependencies: orderedDependencies,
    reasonCodes: ["llm_workflow_authored", "workflow_contract_valid"],
  }
}
