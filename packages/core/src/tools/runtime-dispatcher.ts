import type { ApprovalDecision, ApprovalKind } from "../events/index.js"
import {
  ToolDispatcher,
  type ToolApprovalDecisionCommandResult,
  type ToolDispatcherDependencies,
  type ToolRuntimeConfigSnapshot,
} from "./dispatcher.js"
import type { ResolveApprovalDecisionCommand } from "../runs/approval-decision-command.js"

let activeDispatcher: ToolDispatcher | null = null
let activeConfig: ToolRuntimeConfigSnapshot | null = null
let activeDependencies: Omit<ToolDispatcherDependencies, "config"> | null = null
const EMPTY_RUNTIME_DISPATCHER_DEPENDENCIES: Readonly<
  Omit<ToolDispatcherDependencies, "config">
> = Object.freeze({})

export function initializeToolDispatcher(
  config: ToolRuntimeConfigSnapshot,
  dependencies: Omit<ToolDispatcherDependencies, "config"> = EMPTY_RUNTIME_DISPATCHER_DEPENDENCIES,
): ToolDispatcher {
  if (activeDispatcher) {
    if (activeConfig !== config || activeDependencies !== dependencies) {
      throw new Error("Tool dispatcher is already initialized with a different config snapshot")
    }
    return activeDispatcher
  }
  activeConfig = config
  activeDependencies = dependencies
  activeDispatcher = new ToolDispatcher({ config, ...dependencies })
  return activeDispatcher
}

export function getToolDispatcher(): ToolDispatcher {
  if (!activeDispatcher) {
    throw new Error("Tool dispatcher is not initialized")
  }
  return activeDispatcher
}

export const toolDispatcher = new Proxy({} as ToolDispatcher, {
  get(_target, property) {
    const dispatcher = getToolDispatcher()
    const value = Reflect.get(dispatcher, property, dispatcher) as unknown
    return typeof value === "function" ? value.bind(dispatcher) : value
  },
})

export function grantRunApprovalScope(
  runId: string,
  toolName: string,
  params?: Record<string, unknown>,
): void {
  getToolDispatcher().grantRunApprovalScope(runId, toolName, params)
}

export function grantRunSingleApproval(
  runId: string,
  toolName: string,
  params?: Record<string, unknown>,
): void {
  getToolDispatcher().grantRunSingleApproval(runId, toolName, params)
}

export function resolvePendingInteraction(runId: string, decision: ApprovalDecision): boolean {
  return getToolDispatcher().resolvePendingInteraction(runId, decision)
}

export function resolveApprovalDecision(
  command: ResolveApprovalDecisionCommand,
): ToolApprovalDecisionCommandResult {
  return getToolDispatcher().resolveApprovalDecision(command)
}

export function listPendingInteractions(): Array<{
  runId: string
  toolName: string
  kind: ApprovalKind
  guidance?: string
}> {
  return getToolDispatcher().listPendingInteractions()
}
