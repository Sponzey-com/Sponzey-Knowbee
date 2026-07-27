# UI Policy

## Purpose

Own user-convenience-first UI improvement rules.

## Rules

- Optimize UI changes for user convenience before decoration, implementation convenience, feature display, or dense internal information.
- Keep common tasks short, clear, recoverable, and predictable.
- Keyboard navigation, visible focus, accessible names, control-to-error association, and non-color state cues are required for every primary workflow.
- Show user-facing agent names and useful status, not internal IDs or raw system structures.
- Do not expose raw system prompt sources, hidden prompt internals, secrets, tokens, or private memory in ordinary UI.
- Keep advanced details behind purpose-specific review, debugging, administration, or prompt improvement workflows.
- Provide clear state, validation errors, recovery guidance, cancellation, undo, and next-action guidance whenever the corresponding action is available.
- Keep cards, sidebars, controls, and lower action areas inside the visible scrollable area.
- Organize settings around user tasks and outcomes, not internal module names, database fields, graph schemas, or runtime implementation boundaries.
- Show agent configuration as user-facing `agent_name`, role, capabilities, model selection, tool and external feature connection availability, permission status, parent-child relationship, and operational state.
- Hide `agent_id`, raw prompt stack, raw persona traits, hidden system instructions, internal topology metadata, and raw execution contracts from ordinary agent configuration screens.
- Agent-specific persona, tendency, and style settings must not appear as ordinary UI controls unless the user explicitly enters an authorized agent-persona editing workflow.
- If a screen uses graph or canvas views, show only user-actionable nodes and user-facing names; implicit platform roots do not need visible editable nodes.
- If beginner and advanced routes or panels exist, they must read and write one canonical settings model and one canonical save path.
- Do not maintain divergent beginner-only and advanced-only configuration semantics for the same setting.
- Button labels must match persistence behavior. If an action saves and moves forward, label it as save-and-continue or show equivalent explicit save status.
- Navigation-only actions must not silently persist changes. Save actions must show success, failure, and unsaved-change state.
- Disabled actions must show the missing requirement or blocked reason close to the control.
- Validation messages must state what is wrong, why it blocks the task, and the next action the user can take.
- Prefer sidebars, drawers, or inline panels for focused configuration details instead of replacing the whole screen with a large unrelated surface.
- Do not show raw system prompt text in UI by default; link to authorized review, debugging, administration, security review, audit, or prompt improvement workflows when disclosure is allowed.

## Out Of Scope

- This module does not own domain state transitions, persistence behavior, permission decisions, prompt improvement approval, result diagnosis, or final response wording.
