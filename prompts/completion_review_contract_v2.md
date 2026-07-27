# Completion Review Contract v2

## Purpose

Define the machine-validated output contract for one completion-review LLM call.

This contract supersedes any earlier output shape stated by another completion-review prompt fragment.
Always output valid JSON only. Do not output markdown or explanatory prose.

Return one object with this shape:

{
  "status": "complete | followup | ask_user | blocked | paths_exhausted",
  "summary": "short summary in the original request language",
  "reason": "why this status follows from the evidence",
  "followup_prompt": "required only when status = followup",
  "followup_evidence_refs": ["exact supplied evidence refs supporting the follow-up"],
  "followup_execution_mode": "tool | response_only",
  "followup_required_tool_names": ["exact tool names required by the selected follow-up strategy"],
  "followup_target_refs": ["exact URLs or target refs selected for the follow-up strategy"],
  "user_message": "required only when status = ask_user",
  "remaining_items": ["concrete unresolved items"],
  "blocker_evidence_refs": ["verified blocker evidence refs; blocked only"],
  "evaluated_alternative_evidence_refs": ["evidence refs for materially different evaluated alternatives"],
  "excluded_candidate_evidence_refs": ["every evaluated candidate exclusion ref; paths_exhausted only"],
  "criterion_assessments": [
    {
      "criterion_key": "existence | accuracy | completeness | freshness | target_match | constraint_compliance | delivery",
      "applicable": true,
      "verdict": "satisfied | unsatisfied | uncertain",
      "evidence_refs": ["exact source_ref supplied in execution evidence"],
      "uncertainty": "concise uncertainty or empty string",
      "reason": "concise criterion-specific reason"
    }
  ],
  "condition_assessments": [
    {
      "condition_id": "exact supplied conditionId",
      "verdict": "satisfied | unsatisfied | uncertain",
      "evidence_refs": ["exact source_ref supplied in execution evidence"],
      "uncertainty": "concise uncertainty or empty string",
      "reason": "concise condition-specific reason"
    }
  ]
}

## Contract Rules

- Return exactly one criterion_assessments item for each of these keys: existence, accuracy, completeness, freshness, target_match, constraint_compliance, delivery.
- Keep every human-language field to one short sentence. Keep each remaining_items entry concise.
- Do not repeat evidence content, the candidate answer, or the request inside summary, reason, uncertainty, or assessment reasons. Cite exact evidence refs instead.
- Decide applicability with the LLM from the request, candidate result, and evidence.
- Use only exact source_ref values present in the supplied evidence allowlist. Never invent an evidence reference.
- When status is complete, every applicable criterion and every expected condition must cite at least one exact supplied evidence ref.
- Return exactly one condition_assessments item for every supplied expected condition ID. Do not omit, add, rewrite, or invent IDs.
- When status is complete, every expected condition must be satisfied.
- Do not mark an execution request complete merely because the candidate explains why execution did not occur.
- If an applicable criterion or expected condition is unsatisfied or uncertain, choose followup, ask_user, blocked, or paths_exhausted and list the unresolved item.
- followup_prompt is mandatory for followup. user_message is mandatory for ask_user.
- Always return followup_execution_mode, followup_required_tool_names, and followup_target_refs. Keep the arrays empty unless status is followup; use an empty string for followup_execution_mode unless status is followup.
- For followup, set followup_execution_mode to tool when another tool call is required, or response_only when the existing evidence only needs a corrected final response.
- A tool-mode followup must contain at least one exact runtime tool name in followup_required_tool_names. A response_only followup must keep followup_required_tool_names empty.
- response_only is invalid while any applicable existence, accuracy, freshness, or target_match criterion is unsatisfied or uncertain. Use tool mode with the required tool names, or choose blocked when no executable evidence path remains.
- response_only is also invalid when an applicable freshness assessment cites evidence outside the supplied freshness-valid evidence refs. A search collection timestamp is not freshness-valid proof of a source value's basis time.
- When followup_prompt requires a specific tool, put its exact runtime tool name in followup_required_tool_names. Do not put capability names, prose, or unavailable tool names there.
- When the follow-up selects a concrete source or target already present in supplied evidence, put its exact URL or target reference in followup_target_refs.
- blocked is terminal for the current run and requires verified blocker_evidence_refs plus evaluated_alternative_evidence_refs. It does not claim that every current candidate was excluded.
- paths_exhausted is terminal for the current scope. It requires evaluated_alternative_evidence_refs and an exactly matching excluded_candidate_evidence_refs set proving every evaluated candidate was excluded.
- Keep all three terminal evidence arrays empty for complete, followup, and ask_user. Use only exact allowlisted evidence refs.
- When status is followup and supplied evidence exists, followup_evidence_refs must contain only exact allowlisted refs that support the unresolved items and next action.
- Do not copy factual values from the candidate answer into followup_prompt. The next execution must re-read facts from followup_evidence_refs.

## Out Of Scope

- This contract does not define domain review policy, execute tools, alter evidence, or render user-facing output.
