import React from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"

import { FormField } from "../packages/webui/src/components/ui/FormField.js"
import { InlineNotice } from "../packages/webui/src/components/ui/InlineNotice.js"
import { Tabs } from "../packages/webui/src/components/ui/Tabs.js"

describe("task010 form and feedback primitives", () => {
  it("renders one route-driven active tab with accessible state and touch targets", () => {
    const html = renderToStaticMarkup(<Tabs
      label="Capability type"
      activeId="mcp"
      items={[
        { id: "skills", label: "Skills", href: "/capabilities/skills" },
        { id: "mcp", label: "MCP integrations and connection management", href: "/capabilities/mcp" },
      ]}
    />)
    expect(html).toContain("role=\"tablist\"")
    expect(html).toContain("aria-current=\"page\"")
    expect(html).toContain("href=\"/capabilities/mcp\"")
    expect(html).toContain("min-h-[44px]")
    expect(() => renderToStaticMarkup(<Tabs label="Bad" activeId="none" items={[
      { id: "one", label: "One", href: "/one" },
    ]} />)).toThrow("Tabs require exactly one active item")
  })

  it("connects a visible label and nearby error to its input", () => {
    const html = renderToStaticMarkup(
      <FormField id="server-name" label="Server name" required help="Shown in the list" error="Name is required">
        <input />
      </FormField>,
    )
    expect(html).toContain("for=\"server-name\"")
    expect(html).toContain("id=\"server-name\"")
    expect(html).toContain("aria-invalid=\"true\"")
    expect(html).toContain("aria-describedby=\"server-name-error\"")
    expect(html).toContain("role=\"alert\"")
  })

  it("keeps persistent notice meaning in title and body text", () => {
    const html = renderToStaticMarkup(
      <InlineNotice tone="success" title="Saved">설정이 저장되었습니다. Settings were saved.</InlineNotice>,
    )
    expect(html).toContain("role=\"status\"")
    expect(html).toContain("Saved")
    expect(html).toContain("설정이 저장되었습니다. Settings were saved.")
    expect(() => renderToStaticMarkup(
      <InlineNotice tone="warning" title="">Missing permission</InlineNotice>,
    )).toThrow("InlineNotice title and body are required")
  })
})
