import {
  buildSafeProductParameterDefaults,
  validateProductParameterDefaults,
  type ProductParameterDefaults,
} from "../contracts/product-parameters.js"

export type ProductMemoryWriteTrigger =
  | "explicit_user_save_request"
  | "general_chat"
  | "trusted_setting"
  | "parent_review_accepted"
  | "learning_event_approved"
  | "admin_review_approved"

export type ProductMemoryWriteDecisionKind = "long_term_allowed" | "short_term_only"

export interface ProductMemoryWritePolicyInput {
  trigger: ProductMemoryWriteTrigger
  runtimeLongTermRetentionConfigured?: boolean
  defaults?: ProductParameterDefaults
}

export interface ProductMemoryWritePolicyDecision {
  decision: ProductMemoryWriteDecisionKind
  longTermAllowed: boolean
  reasonCode:
    | "explicit_user_save_request"
    | "general_chat_requires_explicit_save_request"
    | "runtime_long_term_retention_configured"
    | "runtime_long_term_retention_missing"
    | "product_parameter_defaults_invalid"
  notes: string[]
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

export function decideProductMemoryWritePolicy(
  input: ProductMemoryWritePolicyInput,
): ProductMemoryWritePolicyDecision {
  const safe = safeDefaultsOrFallback(input.defaults ?? buildSafeProductParameterDefaults())
  const notes = [
    `product_parameter_defaults=${safe.defaults.decisionState}`,
    `general_chat_long_term_policy=${safe.defaults.generalChatMemory.longTermWritePolicy}`,
    `long_term_memory_without_runtime_config=${safe.defaults.agentMemory.longTermMemoryWhenRuntimeConfigMissing}`,
    ...(safe.issueCodes.length
      ? [`product_parameter_defaults_recovered_from_invalid=${[...new Set(safe.issueCodes)].sort().join(",")}`]
      : []),
  ]

  if (safe.issueCodes.length > 0) {
    return {
      decision: "short_term_only",
      longTermAllowed: false,
      reasonCode: "product_parameter_defaults_invalid",
      notes,
    }
  }

  if (input.runtimeLongTermRetentionConfigured !== true) {
    return {
      decision: "short_term_only",
      longTermAllowed: false,
      reasonCode: "runtime_long_term_retention_missing",
      notes,
    }
  }

  if (input.trigger === "general_chat") {
    return {
      decision: "short_term_only",
      longTermAllowed: false,
      reasonCode: "general_chat_requires_explicit_save_request",
      notes,
    }
  }

  if (input.trigger === "explicit_user_save_request") {
    return {
      decision: "long_term_allowed",
      longTermAllowed: true,
      reasonCode: "explicit_user_save_request",
      notes,
    }
  }

  return {
    decision: "long_term_allowed",
    longTermAllowed: true,
    reasonCode: "runtime_long_term_retention_configured",
    notes,
  }
}
