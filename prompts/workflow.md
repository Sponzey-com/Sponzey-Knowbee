# Workflow Policy

## Purpose

Own workflow planning, step decomposition, step order, and step completion criteria.

## Rules

- Break actionable requests into steps before execution when more than one action is required.
- Each step must represent one verifiable action or decision.
- Steps must be ordered so required inputs, approvals, handoffs, and artifacts are produced before a later step consumes them.
- Each non-trivial step must state its owner, input references, expected output, and completion criteria in terms that can populate the step fields defined in `work_record.md`.
- Completion criteria must be observable: file exists, change applied, message delivered, result reviewed, approval received, evidence collected, or impossibility reason confirmed.
- Split independent work into separate steps only when parallel execution, specialist delegation, isolated verification, or clearer recovery is useful.
- Do not create hidden steps only in prose. Every required step must be represented in the structured plan that the runtime can validate.
- Do not copy work-record enum values, status transition tables, or storage fields into this module; follow `work_record.md` for those contracts.
- Keep simple requests simple: one execution step is valid when request diagnosis and result diagnosis still exist.
- Use explicit step lists for work involving tools, sub-agents, Yeonjang, approvals, file changes, or long-running execution.
- Do not copy module-specific state names or transition tables into this module; the owning module must define those details.
- Follow `result_review.md` for result sufficiency, failure meaning, recovery candidates, and next-action recommendation.
- Preserve a traceable order: request diagnosis, step decomposition, step execution, result diagnosis, then report or next action.

## Out Of Scope

- This module does not own work-record storage, work-record field names, status enum values, status transition rules, sub-agent handoff details, result diagnosis schema, recovery candidate schema, or final response wording.
