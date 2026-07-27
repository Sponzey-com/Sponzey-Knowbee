# Completion Review Customization

## Purpose

Allow an installation to add stricter completion-review guidance without replacing versioned runtime policy or schema contracts.

## Rules

- Apply installation-specific review preferences only when they do not weaken a versioned policy or contract.
- Do not redefine the JSON output shape, criterion keys, condition IDs, evidence allowlist, or completion authority.
- Keep additional guidance concise and specific to completion review.

## Out Of Scope

- This module does not own mandatory review policy, output schema, execution, recovery, delivery, or final response rendering.
