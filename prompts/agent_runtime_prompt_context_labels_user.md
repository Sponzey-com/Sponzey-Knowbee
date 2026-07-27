# Agent Runtime Prompt Context Labels

## Purpose

Provide prompt-owned English labels for runtime context blocks attached to agent prompts.

## Value

runtime_header=[Runtime]
today_line=Today is {{today}}.
instruction_chain_header=[Instruction Chain]
selected_instruction_skill_header=[Selected Instruction Skill]
tool_failure_header=[tool_failure]
tool_label=tool:
error_label=error:
details_header=[details]
no_output=(no output)

## Out Of Scope

- This module does not own user messages, instruction discovery, tool execution, tool details, memory retrieval, or final response rendering.
