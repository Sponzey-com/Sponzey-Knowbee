# Prompt Bundle Context Labels

## Purpose

Provide prompt-owned English labels for prompt bundle and prompt policy source blocks.

## Value

agent_prompt_bundle_header=[AgentPromptBundle]
safety_boundaries_header=[Safety Boundaries]
active_profile_fragments_header=[Active Profile Fragments]
blocked_prompt_bundle_issues_header=[Blocked Prompt Bundle Issues]
runtime_prompt_policy_sources_header=[Runtime Prompt Policy Sources]
diagnosis_prompt_sources_header=[Diagnosis Prompt Sources]
unavailable_status=status: unavailable
runtime_sources_missing_reason=reason: no enabled runtime prompt policy sources were loaded
diagnosis_sources_missing_reason=reason: no enabled diagnosis prompt sources were loaded

## Out Of Scope

- This module does not own prompt source selection, source metadata, fragment content, safety rules, validation, cache keys, or diagnosis provider behavior.
