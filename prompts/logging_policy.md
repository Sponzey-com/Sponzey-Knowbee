# Logging Policy

## Purpose

Own product, debug, and development logging levels, redaction boundaries, and observability limits.

## Rules

- Classify every log event as `product`, `debug`, or `development`.
- `product` logs are minimal operator-facing records for startup, shutdown, final state, failure, security, permission, approval, and delivery status.
- `debug` logs support field diagnosis with request id, run id, adapter state, external-call summary, retry summary, recovery summary, and sanitized error class.
- `development` logs support local development and tests with sanitized internal state, contract assembly details, fixture names, schema validation paths, and test diagnostics.
- Default behavior must be closest to `product`.
- `debug` and `development` logs must not be included in ordinary user-facing output, ordinary UI, or default product logs.
- Redact secrets, tokens, credentials, private memory, raw prompt source text, raw provider payloads, raw tool payloads, private file paths, and channel identifiers from all log levels unless an authorized audit workflow explicitly allows a redacted excerpt.
- Product logs must not expose internal IDs, raw stack traces, raw execution contracts, hidden prompt internals, or private memory.
- Debug logs may include stable request, run, adapter, and recovery identifiers only when they are needed to diagnose a field issue.
- Development logs may include detailed internal diagnostics only in development or test mode and only after redaction.
- Log records must separate event, cause, impact, and next action when those fields are available.
- Logs are observability records; they must not become the source of domain decisions, completion decisions, approval decisions, or user-facing truth by themselves.
- Log level selection and runtime log-level changes follow `runtime_environment_policy.md`.

## Out Of Scope

- This module does not own runtime environment injection, final response wording, UI layout, tool execution, or domain success criteria.
