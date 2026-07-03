import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { MemoryRouter } from "../packages/webui/node_modules/react-router-dom/dist/index.mjs"
import { afterEach, describe, expect, it } from "vitest"
import { Layout } from "../packages/webui/src/components/Layout.tsx"
import { useSetupStore } from "../packages/webui/src/stores/setup"

function source(path: string): string {
  return readFileSync(path, "utf8")
}

function routeBlock(appSource: string, routePath: string): string {
  const start = appSource.indexOf(`path="${routePath}"`)
  if (start < 0) return ""
  return appSource.slice(start, start + 420)
}

const initialSetupState = useSetupStore.getState().state

afterEach(() => {
  useSetupStore.setState({ state: initialSetupState })
})

describe("task005 route tree and layout integration", () => {
  it("connects major advanced settings and sub-agent routes to the unified route resolver", () => {
    const appSource = source("packages/webui/src/App.tsx")

    expect(appSource).toContain("resolveUnifiedRoute")
    expect(appSource).toContain("function UnifiedRouteRedirect")
    expect(routeBlock(appSource, "/advanced/topology")).toContain("<UnifiedRouteRedirect")
    expect(routeBlock(appSource, "/advanced/topology/*")).toContain("<UnifiedRouteRedirect")
    expect(routeBlock(appSource, "/advanced/orchestration")).toContain("<UnifiedRouteRedirect")
    expect(routeBlock(appSource, "/advanced/orchestration/*")).toContain("<UnifiedRouteRedirect")
    expect(routeBlock(appSource, "/advanced/settings")).toContain("<UnifiedRouteRedirect")
    expect(routeBlock(appSource, "/advanced/settings/*")).toContain("<UnifiedRouteRedirect")
    expect(routeBlock(appSource, "/advanced/enterprise-topology")).toContain("<UnifiedRouteRedirect")
    expect(routeBlock(appSource, "/advanced/enterprise-topology/*")).toContain("<UnifiedRouteRedirect")
    expect(appSource).not.toContain('to="/advanced/topology?mode=build"')
  })

  it("removes beginner and advanced mode selector UI from the shared layout shell", () => {
    const layoutSource = source("packages/webui/src/components/Layout.tsx")

    expect(layoutSource).not.toContain("handlePreferredModeChange")
    expect(layoutSource).not.toContain("resolveModeSwitchRoute")
    expect(layoutSource).not.toContain("layout.currentMode")
    expect(layoutSource).not.toContain("layout.mode.beginner")
    expect(layoutSource).not.toContain("layout.mode.advanced")
    expect(layoutSource).not.toContain("setPreferredMode")
  })

  it("keeps route and layout integration free of hidden environment or storage mutation", () => {
    const appSource = source("packages/webui/src/App.tsx")
    const layoutSource = source("packages/webui/src/components/Layout.tsx")
    const combined = `${appSource}\n${layoutSource}`

    expect(combined).not.toMatch(/process\.env/)
    expect(combined).not.toMatch(/localStorage\.setItem|sessionStorage\.setItem/)
    expect(combined).not.toMatch(/document\.cookie/)
  })

  it("turns the sidebar into a static setup status panel while initial setup is incomplete", () => {
    useSetupStore.setState({
      state: {
        version: 1,
        completed: false,
        currentStep: "welcome",
        skipped: { telegram: false, remoteAccess: false },
      },
    })

    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/setup"] },
        createElement(Layout, null, createElement("main", null, "setup body")),
      ),
    )

    expect(html).toContain('data-layout-setup-status-panel="true"')
    expect(html).toContain('data-layout-setup-locked-command="true"')
    expect(html).not.toContain('href="/chat"')
    expect(html).not.toContain('href="/setup"')
    expect(html).not.toContain('href="/sub-agents"')
    expect(html).not.toContain('href="/tasks"')
    expect(html).not.toContain('href="/status"')
  })
})
