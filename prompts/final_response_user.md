# Final Response Rewrite Input

## Purpose

Provide the input envelope for final user-facing response rewriting.

## Input

[Final Response Rewrite Input]

Original user request:
{{originalRequest}}

Raw completion text:
{{rawText}}

Raw text source: {{textSource}}

## Contract

- Treat the original user request as the language and intent source.
- Treat raw completion text as reviewed evidence to rewrite, not as text to forward unchanged.
- Keep unsupported claims out of the final answer.
- If raw completion text is a structured final-report JSON envelope, preserve each supplied result and fact string exactly as required by the final response policy.

## Out Of Scope

- This module does not own final response policy, identity policy, result diagnosis, or delivery provenance.
