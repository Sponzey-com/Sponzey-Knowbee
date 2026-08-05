export const INTERNAL_LLM_DATA_MASK = "[internal-llm-data-hidden]"

const INTERNAL_LLM_STRUCTURED_KEYS = new Set([
  "completionreview",
  "diagnosis",
  "diagnosisreceipt",
  "evidenceenvelope",
  "evidencerecord",
  "intentenvelope",
  "llminput",
  "llmoutput",
  "hiddeninstructions",
  "personalmemory",
  "privatememory",
  "promptinput",
  "promptsource",
  "promptstack",
  "rawprompt",
  "rawinputrefs",
  "rawoutputpreview",
  "rawpreview",
  "rawresultrefs",
  "rawsystemprompt",
  "requestdiagnosis",
  "requestintent",
  "resultdiagnosis",
  "solutionplan",
  "stepplan",
  "stepresults",
  "structuredrequest",
  "subjectpayload",
  "systeminstructions",
  "systemprompt",
  "untrustedevidence",
  "workrecord",
])

const INTERNAL_LLM_TEXT_FIELD_PATTERN = new RegExp(
  `["']?(?:${[...INTERNAL_LLM_STRUCTURED_KEYS].join("|")})["']?\\s*:`,
  "iu",
)
const INTERNAL_LLM_SENSITIVE_PROSE_PATTERN =
  /\b(?:raw\s+system\s+prompt|system\s+prompt|hidden\s+(?:system\s+)?instructions?|(?:raw\s+)?prompt\s+(?:source|stack)|(?:private|personal)(?:\s+agent)?\s+memory)\s*:/iu

function normalizedStructuredKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, "").toLowerCase()
}

export function isInternalLlmStructuredDataKey(key: string): boolean {
  return INTERNAL_LLM_STRUCTURED_KEYS.has(normalizedStructuredKey(key))
}

export function containsInternalLlmStructuredDataText(value: string): boolean {
  const normalized = value.replace(/[_-]/gu, "")
  return (
    INTERNAL_LLM_TEXT_FIELD_PATTERN.test(normalized) ||
    INTERNAL_LLM_SENSITIVE_PROSE_PATTERN.test(value)
  )
}
