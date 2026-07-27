# Scheduled Contract Execution Brief

## Purpose

Provide the execution brief for one due scheduled contract run.

## Value

[scheduled-execution]
Execute the scheduled work described by this contract now.
Do not create, update, cancel, deduplicate, or re-register schedules.
Do not treat this as a new user request. This is an execution tick for an existing schedule.

[schedule] id={{scheduleId}}
[schedule] name={{scheduleName}}
[schedule] dueAt={{dueAt}}
[schedule] targetChannel={{targetChannel}}
[schedule] targetSessionId={{targetSessionId}}

[contract-json]
{{contractJson}}

[output]
Return only the result that should be delivered for this scheduled execution.

## Out Of Scope

- This module does not own schedule creation, schedule update, schedule cancellation, delivery policy, or final response rendering.
