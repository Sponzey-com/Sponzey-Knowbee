import {
  type ProductParameterDefaults,
  YEONJANG_SENSITIVE_OPERATIONS,
  type YeonjangSensitiveOperation,
  buildSafeProductParameterDefaults,
  validateProductParameterDefaults,
} from "../contracts/product-parameters.js"
import type {
  AgentExecutionPermissionPolicy,
  AgentExecutionRiskBoundaryKind,
  AgentExecutionRiskPolicy,
} from "./execution-decision-contract.js"

export type ProductSubAgentDelegationAction =
  | "use_preconfigured_direct_child"
  | "create_runtime_child_sub_agent"

export type ProductSubAgentDelegationStatus =
  | "allowed"
  | "selected_executor_not_direct_child"
  | "runtime_child_creation_disallowed"

export interface ProductSubAgentDelegationPolicy {
  childSubAgentPolicy: ProductParameterDefaults["subAgentDelegation"]["childSubAgentPolicy"]
  canCreateChildSubAgentsAtRuntime: false
  notes: string[]
}

export interface ProductSubAgentDelegationPolicyDecision {
  ok: boolean
  status: ProductSubAgentDelegationStatus
  notes: string[]
}

export const BASE_AGENT_EXECUTION_APPROVAL_RISK_KINDS: readonly AgentExecutionRiskBoundaryKind[] = [
  "privacy",
  "permission",
  "delete",
  "payment",
  "external_transfer",
  "local_system_control",
] as const

export const YEONJANG_OPERATION_RISK_KINDS: Record<
  YeonjangSensitiveOperation,
  readonly AgentExecutionRiskBoundaryKind[]
> = {
  file_change: ["permission", "local_system_control"],
  app_execution: ["local_system_control"],
  terminal_command: ["local_system_control"],
  screen_control: ["privacy", "local_system_control"],
  keyboard_input: ["local_system_control"],
  mouse_input: ["local_system_control"],
  external_network_call: ["external_transfer"],
} as const

export const YEONJANG_SENSITIVE_TOOL_OPERATIONS: Readonly<
  Record<string, YeonjangSensitiveOperation>
> = Object.freeze({
  file_write: "file_change",
  file_patch: "file_change",
  file_delete: "file_change",
  app_launch: "app_execution",
  shell_exec: "terminal_command",
  process_kill: "terminal_command",
  screen_capture: "screen_control",
  screen_find_text: "screen_control",
  yeonjang_camera_capture: "screen_control",
  window_focus: "screen_control",
  keyboard_type: "keyboard_input",
  keyboard_shortcut: "keyboard_input",
  keyboard_action: "keyboard_input",
  mouse_move: "mouse_input",
  mouse_click: "mouse_input",
  mouse_action: "mouse_input",
})

function uniqueRiskKinds(
  values: readonly AgentExecutionRiskBoundaryKind[],
): AgentExecutionRiskBoundaryKind[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function safeDefaultsOrFallback(defaults: ProductParameterDefaults): {
  defaults: ProductParameterDefaults
  issueCodes: string[]
} {
  const validation = validateProductParameterDefaults(defaults)
  if (validation.ok) return { defaults, issueCodes: [] }
  return {
    defaults: buildSafeProductParameterDefaults(),
    issueCodes: validation.issues.map((issue) => issue.code),
  }
}

function productParameterPolicyNotes(input: {
  defaults: ProductParameterDefaults
  issueCodes: string[]
}): string[] {
  return [
    `product_parameter_defaults=${input.defaults.decisionState}`,
    `sub_agent_child_policy=${input.defaults.subAgentDelegation.childSubAgentPolicy}`,
    `sub_agent_runtime_child_creation_allowed=${String(input.defaults.subAgentDelegation.canCreateChildSubAgentsAtRuntime)}`,
    ...(input.issueCodes.length
      ? [
          `product_parameter_defaults_recovered_from_invalid=${[...new Set(input.issueCodes)].sort().join(",")}`,
        ]
      : []),
  ]
}

export function productParameterYeonjangOperationRequiresApproval(
  operation: YeonjangSensitiveOperation,
  defaults: ProductParameterDefaults = buildSafeProductParameterDefaults(),
): boolean {
  const safe = safeDefaultsOrFallback(defaults).defaults
  return safe.yeonjangPermissions.some(
    (item) => item.operation === operation && item.approval === "approval_required",
  )
}

export function getYeonjangSensitiveOperationForTool(
  toolName: string,
): YeonjangSensitiveOperation | null {
  return YEONJANG_SENSITIVE_TOOL_OPERATIONS[toolName] ?? null
}

export function requiresDefaultYeonjangToolApproval(
  toolName: string,
  defaults: ProductParameterDefaults = buildSafeProductParameterDefaults(),
): boolean {
  const operation = getYeonjangSensitiveOperationForTool(toolName)
  return (
    operation !== null && productParameterYeonjangOperationRequiresApproval(operation, defaults)
  )
}

export function executionRiskKindsForYeonjangOperation(
  operation: YeonjangSensitiveOperation,
): AgentExecutionRiskBoundaryKind[] {
  return [...YEONJANG_OPERATION_RISK_KINDS[operation]]
}

export function productParameterRuntimeChildSubAgentCreationAllowed(
  defaults: ProductParameterDefaults = buildSafeProductParameterDefaults(),
): boolean {
  const safe = safeDefaultsOrFallback(defaults).defaults
  return safe.subAgentDelegation.canCreateChildSubAgentsAtRuntime
}

export function buildDefaultSubAgentDelegationPolicy(
  defaults: ProductParameterDefaults = buildSafeProductParameterDefaults(),
): ProductSubAgentDelegationPolicy {
  const safe = safeDefaultsOrFallback(defaults)
  return {
    childSubAgentPolicy: safe.defaults.subAgentDelegation.childSubAgentPolicy,
    canCreateChildSubAgentsAtRuntime: false,
    notes: productParameterPolicyNotes(safe),
  }
}

export function decideProductSubAgentDelegationPolicy(input: {
  action: ProductSubAgentDelegationAction
  selectedExecutorIsPreconfiguredDirectChild?: boolean
  defaults?: ProductParameterDefaults
}): ProductSubAgentDelegationPolicyDecision {
  const policy = buildDefaultSubAgentDelegationPolicy(input.defaults)
  if (input.action === "create_runtime_child_sub_agent") {
    return {
      ok: false,
      status: "runtime_child_creation_disallowed",
      notes: [
        ...policy.notes,
        "decision=runtime_child_sub_agent_creation_requires_preconfiguration",
      ],
    }
  }
  if (!input.selectedExecutorIsPreconfiguredDirectChild) {
    return {
      ok: false,
      status: "selected_executor_not_direct_child",
      notes: [...policy.notes, "decision=selected_executor_must_be_preconfigured_direct_child"],
    }
  }
  return {
    ok: true,
    status: "allowed",
    notes: [...policy.notes, "decision=preconfigured_direct_child_allowed"],
  }
}

export function buildDefaultAgentExecutionRiskPolicy(
  defaults: ProductParameterDefaults = buildSafeProductParameterDefaults(),
): AgentExecutionRiskPolicy {
  const safe = safeDefaultsOrFallback(defaults)
  const approvalRequiredOperations = YEONJANG_SENSITIVE_OPERATIONS.filter((operation) =>
    productParameterYeonjangOperationRequiresApproval(operation, safe.defaults),
  )
  const operationRiskKinds = approvalRequiredOperations.flatMap((operation) =>
    executionRiskKindsForYeonjangOperation(operation),
  )

  return {
    approval_required_for: uniqueRiskKinds([
      ...BASE_AGENT_EXECUTION_APPROVAL_RISK_KINDS,
      ...operationRiskKinds,
    ]),
    blocked_without_approval: uniqueRiskKinds(["external_transfer", "local_system_control"]),
    notes: [
      ...productParameterPolicyNotes(safe),
      `yeonjang_approval_required_operations=${approvalRequiredOperations.join(",")}`,
    ],
  }
}

export function buildDefaultAgentExecutionPermissionPolicy(
  defaults: ProductParameterDefaults = buildSafeProductParameterDefaults(),
): AgentExecutionPermissionPolicy {
  const safe = safeDefaultsOrFallback(defaults)
  const approvalRequiredOperations = YEONJANG_SENSITIVE_OPERATIONS.filter((operation) =>
    productParameterYeonjangOperationRequiresApproval(operation, safe.defaults),
  )

  return {
    allowed_tool_ids: [],
    notes: [
      ...productParameterPolicyNotes(safe),
      `yeonjang_approval_required_operations=${approvalRequiredOperations.join(",")}`,
    ],
  }
}
