# Recovery Prompt Section Text

## Purpose

Provide prompt-owned English section labels and reusable hint text for recovery prompts.

## Value

previous_result=Previous result:
previous_incomplete_result=Previous incomplete result:
current_text_result=Current text result:
successful_tool_executions=Successful tool executions:
already_delivered_files=Already delivered files:
preferred_alternatives=Preferred alternatives:
failed_command_records=Failed command records:
path_alias_candidates=Path alias candidates:
download_location_candidate=Download location candidate: {{downloadPath}}
download_location_phrase_hint=Treat download-like phrases as OS download folder candidates first.
preserve_explicit_paths=Preserve quoted folder names and explicit absolute paths exactly as provided.
failed_tools=Failed tools:
error_detail=Error detail:
failed_approach=Failed approach:
avoid_targets=Avoid these targets:
preferred_recovery_route=Preferred recovery route:
verification_reason=Verification reason:
current_target_paths=Current target paths:
missing_or_unchecked_items=Missing or unchecked items:
filesystem_mutation_note=A real file or folder mutation was detected, but there is no clear result summary to deliver to the user.
review_summary=Review summary:
review_reason=Review reason:
remaining_items=Remaining items:

## Out Of Scope

- This module does not own recovery candidate selection, error sanitization, tool evidence selection, path discovery, or final user response rendering.
