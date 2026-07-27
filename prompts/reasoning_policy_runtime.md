# Reasoning Runtime Policy

## Purpose

Guide execution when the selected model requires explicit reasoning mode.

## Policy

[Reasoning Policy]

- Treat the current execution target as a llama/ollama-style model.
- Use reasoning mode before acting.
- Review the task plan and viable solution paths before execution.
- Keep the final answer concise.
- Do not expose lengthy hidden reasoning in the final answer.

## Out Of Scope

- This module does not own provider selection, final response rendering, or user-facing explanation style.
