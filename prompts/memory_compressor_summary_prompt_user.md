# Memory Compressor Summary Prompt

## Purpose

Provide the legacy conversation compression prompt sent to the configured AI provider.

## Value

Summarize the following conversation concisely.
Preserve the conversation's dominant language when writing the summary.
Include important decisions, executed commands, and file changes.
Keep the summary under 200 characters when possible.

[Conversation]

## Out Of Scope

- This module does not own transcript rendering, message retention, database row compression, or the returned summary text.
