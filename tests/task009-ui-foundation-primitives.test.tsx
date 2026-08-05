import { readFileSync } from "node:fs"
import React from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"

import { Button } from "../packages/webui/src/components/ui/Button.js"
import { IconButton } from "../packages/webui/src/components/ui/IconButton.js"
import { StatusLabel } from "../packages/webui/src/components/ui/StatusLabel.js"
import {
  UI_TOKEN_CONTRACT,
  validateUiTokenContract,
} from "../packages/webui/src/lib/ui-tokens.js"

describe("task009 UI foundation primitives", () => {
  it("keeps primitive, semantic, and component token references layered and complete", () => {
    expect(validateUiTokenContract(UI_TOKEN_CONTRACT)).toEqual({ ok: true, diagnostics: [] })
    expect(UI_TOKEN_CONTRACT.component["control-min-height-mobile"]).toBe("44px")
    expect(UI_TOKEN_CONTRACT.component["control-min-height-desktop"]).toBe("40px")
    expect(UI_TOKEN_CONTRACT.component["surface-radius"]).toBe("8px")
  })

  it("renders pending and disabled button state without allowing another command", () => {
    const markup = renderToStaticMarkup(
      <Button variant="primary" pending>Save</Button>,
    )
    expect(markup).toContain("aria-busy=\"true\"")
    expect(markup).toContain("disabled=\"\"")
    expect(markup).toContain("Save")
    expect(markup).toContain("min-h-[44px]")
  })

  it("requires an accessible name for icon-only controls", () => {
    const markup = renderToStaticMarkup(
      <IconButton label="Close panel"><span aria-hidden="true">x</span></IconButton>,
    )
    expect(markup).toContain("aria-label=\"Close panel\"")
    expect(markup).toContain("min-h-[44px]")
    expect(markup).toContain("min-w-[44px]")
    expect(() => renderToStaticMarkup(
      <IconButton label=""><span aria-hidden="true">x</span></IconButton>,
    )).toThrow("IconButton label is required")
  })

  it("renders status with semantic text instead of color alone", () => {
    const markup = renderToStaticMarkup(<StatusLabel tone="warning">Permission required</StatusLabel>)
    expect(markup).toContain("role=\"status\"")
    expect(markup).toContain("Permission required")
    expect(markup).toContain("data-tone=\"warning\"")
    expect(() => renderToStaticMarkup(<StatusLabel tone="success">{""}</StatusLabel>))
      .toThrow("StatusLabel text is required")
  })

  it("keeps CSS variables synchronized and avoids side effects in token policy", () => {
    const css = readFileSync("packages/webui/src/index.css", "utf8")
    for (const name of Object.keys(UI_TOKEN_CONTRACT.semantic)) {
      expect(css).toContain(`--ui-${name}:`)
    }
    for (const name of Object.keys(UI_TOKEN_CONTRACT.component)) {
      expect(css).toContain(`--ui-${name}:`)
    }
    const source = readFileSync("packages/webui/src/lib/ui-tokens.ts", "utf8")
    expect(source).not.toMatch(/process\.env|fetch\(|console\.|logger\./)
  })
})
