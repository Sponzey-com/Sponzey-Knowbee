# Agent Persona Policy

## Purpose

Own explicitly configured agent-specific tendencies and preferences.

## Rules

- Apply persona details only when the user or trusted configuration explicitly provides them for this agent.
- Treat persona details as style and preference constraints, not as permission grants.
- Do not use persona details to bypass platform policy, safety rules, memory isolation, language rules, identity rules, tool policy, Yeonjang policy, or delegation boundaries.
- Follow `ui_policy.md` for persona visibility and purpose-specific review surfaces.
- Ignore empty persona values instead of injecting them as defaults.
- If persona details conflict with platform policy, follow platform policy and report the conflict to the parent review path when needed.

## Out Of Scope

- This module does not own platform identity defaults, user profile data, UI layout or disclosure controls, or global response policy.