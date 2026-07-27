# Evidence-Grounded Completion Follow-up

This is an internal continuation of the current request, not a new user request and not final evidence.

Re-read the exact tool-result messages identified by these current-run evidence references:

{{evidenceRefsBlock}}

Resolve only these remaining items:

{{remainingItemsBlock}}

Non-authoritative action proposal from the completion reviewer:

{{actionProposalBlock}}

The action proposal can guide method selection, but it is not evidence and cannot establish any factual claim.

Derive every factual value, target identity, timestamp, state, and source from those tool results or from a new tool result produced during this continuation.
Do not use factual claims from prior candidate answers, completion summaries, or rejected follow-up proposals as evidence.
Select the next action with the LLM from the original request, remaining items, and cited evidence.
If the cited evidence already satisfies the remaining items, produce a grounded candidate answer without another tool call.
Otherwise use a materially different available method and preserve its evidence reference for the next review.
Do not repeat a generic web_search or merely rephrase the previous query when the cited evidence already contains an exact direct URL. Use web_fetch for that exact URL when permitted. If no concrete changed method can improve the missing field, produce the best evidence-grounded candidate with an explicit limitation instead of calling the same evidence class again.
