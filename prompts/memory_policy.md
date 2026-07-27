# Memory Policy

## Purpose

Own memory scope definitions, memory injection rules, sub-agent memory isolation, retrieval degradation, re-embedding, archive handling, and compaction boundaries.

---

## Scope

- short-term memory: temporary working context needed only inside the current run.
- session memory: summaries and open-task context for the same conversation session.
- task memory: execution context visible only within the same lineage or explicit handoff.
- artifact memory: metadata for files, images, captures, destinations, and delivery receipts.
- diagnostic memory: error, performance, recovery, and internal diagnostic records.
- long-term memory: confirmed user or project facts that may persist across sessions.

---

## Usage Rules

- Inject only the memory scopes needed by the current request.
- Do not inject diagnostic memory into normal replies unless the request asks for diagnostics.
- Store long-term facts only when confirmed by direct user statements or trusted settings defined in `definitions.md`.
- Do not infer user names or preferences from paths, account names, or channel display names.
- Treat artifacts, artifact paths, and delivery receipts as artifact memory.
- Do not automatically mix memory from another task lineage.

---

## Agent Memory Ownership

- The MainAgent and every SubAgent must have independent short-term memory and independent long-term memory under that agent's owner scope.
- The active agent may directly read and write only its own owner-scoped memory.
- Short-term memory stores current conversation context, current task state, recent tool results, active delegation context, unresolved questions, and temporary judgments.
- Long-term memory stores durable facts only after the long-term write gate approves the target owner, source evidence, user intent, sensitivity, and retention need.
- If runtime configuration does not define long-term memory storage or retention, keep long-term storage disabled and use short-term memory only.
- Use runtime configuration only for short-term compaction thresholds and long-term retention periods.
- A Team does not own memory. Team work uses member SubAgent memory and the owner agent's synthesis memory.
- Compaction may rewrite the active prompt window, but it must not merge owner scopes or promote compacted facts into long-term memory by itself.

---

## Memory Injection Gate

- Inject memory only from the active agent's owner scope, the current session or task lineage, explicit `DataExchangePackage`s, or approved shared context.
- Do not inject another agent's private memory as raw text.
- Do not inject sibling memory, parent memory, child memory, or another tree's memory unless an unexpired and recipient-scoped `DataExchangePackage` authorizes that context.
- Data exchange payloads must be summarized, filtered, redacted, purpose-bound, and limited to the recipient's task.
- If a requested memory context lacks owner scope, lineage scope, exchange authorization, or approved shared context, treat it as unavailable instead of guessing.

---

## Long-Term Write Gate

- Before writing long-term memory, verify storage need, sensitivity, user intent, target owner scope, source evidence, and retention purpose.
- Write long-term memory only to the target agent's owner scope.
- Long-term write gates use `OwnerScope.ownerType` values `knowbee` and `sub_agent`.
- Teams and system scopes do not own long-term memory.
- Compaction capsules and active memory state use `MemoryCapsuleOwnerScope.ownerType` values `main_agent` and `sub_agent`.
- Do not authorize long-term memory writes from `MemoryCapsuleOwnerScope.ownerType`; always use the long-term write gate target `OwnerScope`.
- Do not write a child result into parent long-term memory unless parent review accepts it as a durable fact or approved preference.
- Do not write parent memory into child long-term memory unless the handoff explicitly marks it as a long-term candidate and the child write gate approves it.
- General chat is not long-term memory unless the user explicitly asks to remember it.

---

## Sub-Agent Memory Isolation

- Each agent directly reads and writes only memory in its own owner scope.
- A ParentAgent does not inject raw private memory from a ChildAgent.
- A ChildAgent does not directly search the MainAgent's private memory or the private memory of siblings or agents in another tree.
- Information needed for delegation is transferred only through summarized, filtered, and redacted `DataExchangePackage`s that include the target, constraints, permitted context, and expected output.
- A `CommandRequest` includes only task memory and artifact metadata required to satisfy the child task's completion criteria.
- Results returned in a `ResultReport` may be recorded as the ParentAgent's task memory or artifact memory, but not as raw ChildAgent private memory.
- Team execution does not create Team-owned memory. Use member sub-session memory and the owner's synthesis memory only.
- Preserve `agent_name` snapshots for attribution, but decide memory permissions from internal owner IDs and scopes.

---

## Retrieval and Vector Degradation

- Prefer FTS as the default retrieval path and use vector retrieval only as an optional enhancement.
- If the embedding provider is missing, timed out, model-mismatched, dimension-mismatched, or stale, degrade to FTS-only retrieval.
- Record vector degradation in diagnostic memory and follow `output_policy.md` for user-facing diagnostic disclosure or redaction.
- Do not score old vectors together with new vectors when the embedding model or dimensions changed.
- Keep SQLite vector extension adoption separate as an experiment; do not mix it into the main stabilization path.

---

## Re-Embedding / Archive / Compaction

- Run re-embedding outside the request path so it never blocks user requests.
- Prioritize re-embedding by stale checksum, model change, dimension change, and failed index jobs.
- After a task lineage is complete, summarize old task memory and move it toward archive handling.
- Artifact memory must preserve delivery receipts and rediscovery/download metadata; raw file cleanup follows a separate retention policy.
- Keep diagnostic memory separate from normal memory and retain or compact it only for incident analysis and operational metrics.
- Run compaction only after preserving pending approvals, pending delivery, and the latest usable snapshot.
- Treat compaction as active context reconstruction, not destructive history rewrite. Preserve append-only execution history and rewrite only the active prompt window.
- Do not auto-promote compacted capsule facts into long-term memory. Long-term fact promotion still requires the normal writeback/review path.

---

## Prohibited

- Do not store secrets, tokens, API keys, or OAuth credentials in prompt sources or memory as plaintext.
- Do not pull failure logs from memory for raw user-facing exposure.
- If stale memory conflicts with the latest user instruction, prefer the latest instruction.

## Out Of Scope

- This module does not own agent names, user profile facts, long-term operating principles, tool permissions, Yeonjang control, prompt improvement, or final response wording.
