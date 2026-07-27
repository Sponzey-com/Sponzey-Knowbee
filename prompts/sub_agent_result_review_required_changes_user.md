# Sub-Agent Result Review Required Changes

## Purpose

Provide required-change directive templates for typed sub-agent result review issues.

## Value

required_output_missing=Submit required output {{outputId}} with status=satisfied.
required_output_not_satisfied=Revise output {{outputId}} until status=satisfied.
required_evidence_missing=Attach explicit evidence kind {{evidenceKind}} for {{outputId}}.
evidence_source_missing=Provide non-empty sourceRef for evidence kind {{evidenceKind}}.
artifact_missing=Attach the required artifact for {{outputId}}.
artifact_path_missing=Provide an artifact path for {{artifactId}}.
artifact_not_found=Regenerate or attach an existing artifact for {{artifactId}}.
reported_risk_or_gap=Resolve the reported risk or gap, or explicitly mark it as a non-blocking reviewed gap in a revised result.
impossible_reason_reported=Review the structured impossible reason and decide whether the parent can integrate a limited success.
result_report_failed=Retry the delegated work and return a non-failed ResultReport.
default=Return a completed ResultReport after addressing the typed completion criteria.

## Out Of Scope

- This module does not own issue detection, retry policy, review verdicts, or final response rendering.
