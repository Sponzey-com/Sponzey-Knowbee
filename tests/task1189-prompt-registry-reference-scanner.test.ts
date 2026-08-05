import { describe, expect, it } from "vitest"

import { scanPromptRegistryReferences } from "../scripts/self/lib/repository-reference-scanner.mjs"

describe("task1189 prompt registry reference scanner", () => {
  it("records required English and present optional locale files", () => {
    const result = scanPromptRegistryReferences({
      artifactIds: ["prompts/identity.md", "prompts/identity.ko.md"],
      definitions: [{
        sourceId: "identity",
        filenames: { en: "identity.md", ko: "identity.ko.md" },
      }],
    })

    expect(result).toEqual({
      complete: true,
      diagnostics: [],
      records: [
        {
          boundary: "registry",
          targetArtifactId: "prompts/identity.ko.md",
          owner: "prompt-registry:identity",
          detail: "locale:ko",
        },
        {
          boundary: "registry",
          targetArtifactId: "prompts/identity.md",
          owner: "prompt-registry:identity",
          detail: "locale:en",
        },
      ],
    })
  })

  it("fails closed when a required English prompt file is missing", () => {
    const result = scanPromptRegistryReferences({
      artifactIds: [],
      definitions: [{
        sourceId: "identity",
        filenames: { en: "identity.md", ko: "identity.ko.md" },
      }],
    })

    expect(result).toEqual({
      complete: false,
      records: [],
      diagnostics: [{
        code: "prompt_source_missing",
        owner: "prompt-registry:identity",
        reference: "prompts/identity.md",
      }],
    })
  })
})
