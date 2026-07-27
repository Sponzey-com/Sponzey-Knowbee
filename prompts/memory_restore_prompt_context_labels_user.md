# Memory Restore Prompt Context Labels

## Purpose

Provide prompt-owned English labels for memory context blocks used during restore, recall, journal, and compaction flows.

## Value

latest_capsule_header=[latest_compacted_capsule]
rollup_capsule_header=[rollup_capsule]
recent_capsules_header=[recent_capsules]
maintenance_restore_header=[maintenance_restore]
prompt_time_recall_header=[prompt_time_recall]
execution_reference_memory_header=[Execution Reference Memory]
pinned_working_set_header=[pinned_working_set]
pinned_working_set_retrieval_only_header=[pinned_working_set_retrieval_only]
retrieval_only_context_header=[retrieval_only_context]
previous_conversation_summary_header=[Previous Conversation Summary]
conversation_header=[conversation]
summary_label=summary:
confirmed_facts_label=confirmed_facts:
pending_items_label=pending_items:
latest_instruction_summary_label=latest_instruction_summary:
latest_successful_summary_label=latest_successful_summary:
latest_target_context_label=latest_target_context:
query_label=query:
same_session_evidence_only_label=same_session_evidence_only:
active_objectives_label=active_objectives
constraints_label=constraints
decisions_label=decisions
artifact_refs_label=artifact_refs
recovery_hints_label=recovery_hints
retrieval_snippets_label=retrieval_snippets
transcript_user_label=User
transcript_assistant_label=Assistant
transcript_speaker_separator=:
transcript_tool_calls_results_label=[Tool calls/results]
structured_tool_use_label=tool_use
structured_tool_result_label=tool_result

## Out Of Scope

- This module does not own capsule contents, memory search, journal records, recall filtering, task continuity, compaction transcripts, diagnostic trace writes, or response rendering.
