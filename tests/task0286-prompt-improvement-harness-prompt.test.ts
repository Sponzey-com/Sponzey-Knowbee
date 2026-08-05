import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const REQUIRED_MARKERS = [
  "## Entry Contract",
  "Casual conversation, vague dissatisfaction, or a request to \"be smarter\" must not change prompt sources.",
  "block the harness entry with `needs_clarification`",
  "A sub-agent prompt improvement requires the sub-agent name, exact target prompt scope, and parent reviewer agent name before apply or activation.",
  "## Harness Change Contract",
  "A harness change may start only from an explicit user or administrator request for a harness rule, harness state machine, harness test fixture, or prompt metadata change.",
  "Every harness change is high risk.",
  "Ordinary prompt-source improvements must leave `targetHarnessSources`, `harnessChangeScope`, and `harnessGuardrailsToPreserve` empty.",
  "Harness changes require approval that covers apply-change and activation scopes.",
  "A changed harness must not control the current run until validation, approval, and runtime activation are confirmed.",
  "must not remove or weaken entry conditions, required inputs, invariants, approval, tests, audit logs, rollback, or activation confirmation.",
  "## State Machine Contract",
  "Recursive prompt improvement must be represented as a state machine, not loose flag combinations.",
  "Allowed harness states:",
  "`idle`",
  "`rolled_back`",
  "Allowed harness events:",
  "`start_requested`",
  "`cancel_requested`",
  "Allowed transitions:",
  "`idle -> intake`",
  "`reporting -> completed`",
  "`completed`, `blocked`, and `rolled_back` are terminal states.",
  "## Baseline Capture Contract",
  "Baseline capture must include:",
  "`runId`",
  "`rollbackTarget`",
  "`sourceChecksums` must be computed from target prompt sources before write.",
  "`rollbackTarget` must be a backup path, source-control revision, reverse patch, or previous prompt registry version; if no rollback target is available, stop before writing.",
  "## Approval Request Contract",
  "Medium-risk and high-risk prompt improvements require an approval request before apply-change.",
  "Approval requests must include `target_files`, `change_summary`, `risk_level`, `invariants_affected`, `tests_to_run`, `rollback_plan`, `activation_method`, `harness_change_scope`, and `harness_guardrails_to_preserve`.",
  "Apply-change approval does not include activation unless `activation` is named in the requested and granted approval scopes.",
  "## Activation Confirmation Contract",
  "Prompt source writes and runtime activation are separate actions.",
  "Activation confirmation must identify `active_prompt_versions`, `loaded_by_process`, `loaded_by_agent_name`, `activated_at`, `activation_method`, `tests_before_activation`, and `rollback_path`.",
  "A harness report must remain `activation_pending` unless a complete activation confirmation record is present.",
  "## Rollback Contract",
  "Allowed rollback sources are source-control revision, prompt registry version, timestamped backup file, reverse patch, or release artifact version.",
  "Rollback is required after a written source when tests fail, invariants fail, activation loads the wrong version, a user or administrator requests rollback, or the changed prompt source is missing, corrupt, or unsafe.",
  "If no prompt source was written, the harness must not perform file rollback and must report the blocked reason instead.",
  "## Audit Record Contract",
  "Every recursive prompt improvement run must produce an audit record with:",
  "`run_id`",
  "`summary`",
  "Product Log events must include only minimal start, approval, change, activation, rollback, and final-result status.",
  "Field Debug Log and Development Log details must not be included in ordinary product log projection.",
  "## Harness Output Contract",
  "Every completed, blocked, activation-pending, or rolled-back run must report state, inspected prompt sources, changed prompt sources, change reason, invariants checked, tests passed or failed, activation state, reload or restart need, and rollback path.",
  "If no prompt source changed, the output must explicitly state that the prompt source was unchanged.",
  "## Proposal Contract",
  "Every prompt improvement proposal must include:",
  "`problem`",
  "`module_boundary_review`",
  "`clarity_review` must confirm the prompt states actor, condition, allowed behavior, forbidden behavior, and completion criteria without ambiguous wording.",
  "## Diff Limit Contract",
  "Reject a diff that duplicates a rule already owned by another canonical prompt module.",
  "Reject a diff that removes or weakens safety, permission, identity, memory, delegation, Yeonjang, approval, audit, rollback, activation, or stop-condition rules.",
  "Reject a diff that introduces unverifiable wording such as \"appropriately\", \"as needed\", \"improve later\", \"if possible\", \"well\", \"enough\", or \"automatically decide\".",
] as const

describe("task0286 prompt improvement harness prompt contract", () => {
  it("documents entry, harness change, and state machine rules", () => {
    const prompt = readFileSync(join(process.cwd(), "prompts", "prompt_improvement.md"), "utf-8")

    for (const marker of REQUIRED_MARKERS) {
      expect(prompt).toContain(marker)
    }
  })
})
