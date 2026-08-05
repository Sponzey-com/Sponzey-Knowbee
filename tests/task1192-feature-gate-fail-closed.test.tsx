import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { beforeEach, describe, expect, it } from "vitest"
import { FeatureGate } from "../packages/webui/src/components/FeatureGate.tsx"
import { useCapabilitiesStore } from "../packages/webui/src/stores/capabilities.ts"

describe("task1192 feature gate fail-closed policy", () => {
  beforeEach(() => {
    useCapabilitiesStore.setState({
      items: [],
      initialized: true,
      loading: false,
      lastError: "",
    })
  })

  it("does not expose a feature when the canonical capability is missing", () => {
    const html = renderToStaticMarkup(
      createElement(
        FeatureGate,
        { capabilityKey: "platform.execution", title: "Execution" },
        createElement("button", { type: "button" }, "Run dangerous action"),
      ),
    )

    expect(html).not.toContain("Run dangerous action")
    expect(html).toContain("Execution")
  })
})
