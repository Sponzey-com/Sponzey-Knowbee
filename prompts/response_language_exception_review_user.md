# Response Language Exception Review Input

## Purpose

Provide the claimed response-language mode and original user request as data for exception review.

Claimed mode: {{requestedMode}}

Original request as a JSON string:
{{originalRequestJson}}

Apply the system decision contract to this data and return only the required JSON object.

## Out Of Scope

This module does not decide whether the exception is valid, render the final answer, or change the original request.
