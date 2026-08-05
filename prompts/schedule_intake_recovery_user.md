# Schedule Intake Recovery

## Purpose

Provide the retry-intake input envelope when schedule analysis failed to create a valid schedule action.

## Input

[Schedule Intake Recovery]

The previous schedule-analysis pass did not create a valid schedule action.

Original user request:
{{originalRequest}}

Previous schedule receipt:
{{previousReceipt}}

Failure reason:
{{reason}}

Re-analyze this as a scheduling request.
Produce a concrete create_schedule or cancel_schedule action with a valid run_at or cron value.
Only ask a clarification question if a required time expression or delivery target is truly missing.
Do not return a success receipt unless a schedule action can actually be executed.

## Out Of Scope

- This module does not own scheduling policy, schedule persistence, channel delivery, or final response rendering.
