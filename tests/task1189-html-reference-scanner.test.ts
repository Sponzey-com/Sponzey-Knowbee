import { describe, expect, it } from "vitest"

import { scanHtmlReferences } from "../scripts/lib/repository-reference-scanner.mjs"

describe("task1189 HTML reference scanner", () => {
  it("resolves package-root modules and Vite public assets", () => {
    const result = scanHtmlReferences({
      artifactIds: [
        "packages/webui/package.json",
        "packages/webui/index.html",
        "packages/webui/src/main.tsx",
        "packages/webui/public/favicon.svg",
      ],
      documents: [{
        owner: "packages/webui/index.html",
        content: [
          '<link rel="icon" href="/favicon.svg" />',
          '<script type="module" src="/src/main.tsx"></script>',
        ].join("\n"),
      }],
    })

    expect(result).toEqual({
      complete: true,
      diagnostics: [],
      records: [
        {
          boundary: "build",
          targetArtifactId: "packages/webui/public/favicon.svg",
          owner: "packages/webui/index.html",
          detail: "html:href",
        },
        {
          boundary: "build",
          targetArtifactId: "packages/webui/src/main.tsx",
          owner: "packages/webui/index.html",
          detail: "html:src",
        },
      ],
    })
  })

  it("fails closed for an unresolved local attribute", () => {
    const result = scanHtmlReferences({
      artifactIds: ["packages/webui/package.json", "packages/webui/index.html"],
      documents: [{
        owner: "packages/webui/index.html",
        content: '<script src="/src/missing.ts"></script>',
      }],
    })

    expect(result).toEqual({
      complete: false,
      records: [],
      diagnostics: [{
        code: "html_reference_unresolved",
        owner: "packages/webui/index.html",
        reference: "/src/missing.ts",
      }],
    })
  })
})
