# Prompt Source Assembly Context Labels

## Purpose

Provide prompt-owned English labels for prompt source assembly fragments and truncation notices.

## Value

fragment_header=[Prompt Source: {{sourceId}}:{{locale}}@{{version}}]
assembly_notice_header=[Prompt Source Assembly Notice]
truncation_notice=Earlier prompt source text was truncated to preserve final-stage runtime policies.

## Out Of Scope

- This module does not own prompt source registration, source priority, enabled state, runtime source selection, or prompt source file contents.
