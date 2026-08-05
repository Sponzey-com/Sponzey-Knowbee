import { detectPrimaryMessageLanguage } from "../channels/language.js"

export type IntakeNormalizedRequestLanguage = "ko" | "en" | "unknown"

export interface IntakeNormalizedRequest {
  sourceLanguage: IntakeNormalizedRequestLanguage
  originalMessage: string
  normalizedEnglish: string
}

function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/gu, " ")
}

function detectSourceLanguage(text: string): IntakeNormalizedRequestLanguage {
  return detectPrimaryMessageLanguage(text)
}

// Preserve the latest user message for intake without language-bound semantic rewriting.
export function normalizeRequestForIntake(message: string): IntakeNormalizedRequest {
  const originalMessage = normalizeWhitespace(message)
  const sourceLanguage = detectSourceLanguage(originalMessage)

  return {
    sourceLanguage,
    originalMessage,
    normalizedEnglish: originalMessage,
  }
}
