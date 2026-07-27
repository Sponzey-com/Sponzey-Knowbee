# Diagnosis JSON Instruction

## Purpose

Provide the compact JSON-only instruction for LLM diagnosis adapter payloads.

## Value

Call exactly one diagnosis response tool required by the harness. Put the complete
diagnosis object in the tool input. Do not emit plain JSON, Markdown, or prose.
The response-tool schema is the sole output-shape authority.

## Out Of Scope

- This module does not own diagnosis schemas, schema repair policy, result review, or final response rendering.
