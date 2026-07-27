# Context Preflight Pruning Labels

## Purpose

Provide prompt-owned English labels for context preflight pruning placeholders.

## Value

tool_result_pruned_marker=[tool_result_pruned: original_chars={{originalChars}}]

## Out Of Scope

- This module does not own pruning thresholds, token estimation, context overflow decisions, compaction, provider calls, or diagnostic logging.
