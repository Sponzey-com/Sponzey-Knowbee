# Profile Context User Header

## Purpose

Render the header and interpretation rule for user setup profile context.

## Value

[User Profile]
The following values come from the user's setup profile.
`userName` is the only user-name field in this context.
Use them to interpret address style, default language, timezone, and workspace unless the user explicitly overrides them.

## Out Of Scope

- This module does not own profile storage, profile field labels, agent identity, or final response rendering.
- This module does not define `displayName` or `profileName` prompt fields.
