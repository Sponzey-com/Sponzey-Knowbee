# Runtime Environment Policy

## Purpose

Own external configuration intake, startup runtime context, environment-variable boundaries, explicit setting delivery, and log-level change boundaries.

## Rules

- Keep external configuration files minimal and limited to values that differ by user, deployment, machine, credential boundary, or runtime connection.
- Domain rules, architecture boundaries, validators, prompt ownership, and safety gates must not be bypassed through external configuration files.
- Read environment variables and external environment constants only during process startup or an explicit bootstrap stage.
- After bootstrap, do not read, inject, or mutate `process.env`, hidden mutable config, singleton config, or global runtime constants to change behavior.
- Pass accepted environment values through explicit settings objects, constructor arguments, use-case input, command options, dependency injection, or runtime context objects.
- Do not turn an environment-derived value into a hidden program constant after startup.
- Runtime changes after startup must use an explicit administrator API, command argument, saved user setting, or validated runtime contract, not environment-variable mutation.
- Prompt-only changes must not mutate runtime environment values, hidden runtime instructions, permissions, memory, tool access, external feature connection access, Yeonjang policy, or log level.
- Log level is chosen during bootstrap. Runtime log-level changes require an explicit administrator contract and must preserve the product, debug, and development log boundaries.
- Tests should prefer explicit fixtures, constructor arguments, dependency injection, and context objects over direct environment mutation.
- If a test or edge adapter must set an environment variable for an external library, limit the scope, restore the previous value, and document the adapter boundary.
- Do not expose environment-derived secrets, tokens, credentials, private paths, or channel identifiers in user-facing output or ordinary UI.

## Out Of Scope

- This module does not own domain behavior, tool permissions, prompt improvement approval, memory policy, UI layout, or final response wording.
