import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { resolveTrappedFocusIndex } from "../packages/webui/src/lib/focus-trap.ts"

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

describe("Task057 canonical accessibility structure", () => {
  it("provides one focusable main owner and a skip link in the shared layout", () => {
    const layout = source("../packages/webui/src/components/Layout.tsx")
    expect(layout).toContain('href="#main-content"')
    expect(layout).toContain('id="main-content"')
    expect(layout).toContain("tabIndex={-1}")
  })

  it.each([
    "AgentsPage.tsx",
    "SkillCatalogPage.tsx",
    "McpCatalogPage.tsx",
    "YeonjangCatalogPage.tsx",
  ])("does not nest a page main landmark inside Layout: %s", (file) => {
    expect(source(`../packages/webui/src/pages/${file}`)).not.toMatch(/<\/?main\b/u)
  })

  it("defines a global reduced-motion fallback for transitions and smooth scrolling", () => {
    const styles = source("../packages/webui/src/index.css")
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"))
    expect(reducedMotion).toContain("scroll-behavior: auto")
    expect(reducedMotion).toContain("transition-duration: 0.01ms")
    expect(reducedMotion).toContain("animation-duration: 0.01ms")
  })

  it("keeps drawer focus inside its boundary and restores the invoking control", () => {
    expect(resolveTrappedFocusIndex({ currentIndex: 1, focusableCount: 2, shiftKey: false })).toBe(
      0,
    )
    expect(resolveTrappedFocusIndex({ currentIndex: 0, focusableCount: 2, shiftKey: true })).toBe(1)
    const drawer = source("../packages/webui/src/components/ui/Drawer.tsx")
    expect(drawer).toContain("panelRef.current?.focus()")
    expect(drawer).toContain("returnFocusRef.current?.focus()")
    expect(drawer).toContain('event.key === "Escape"')
  })

  it("keeps semantic text tokens at WCAG AA contrast on the default surface", () => {
    const styles = source("../packages/webui/src/index.css")
    const surface = tokenHex(styles, "--ui-color-surface")
    for (const token of [
      "--ui-color-ink",
      "--ui-color-muted",
      "--ui-color-info",
      "--ui-color-success",
      "--ui-color-warning",
      "--ui-color-danger",
    ]) {
      expect(contrastRatio(tokenHex(styles, token), surface), token).toBeGreaterThanOrEqual(4.5)
    }
  })
})

function tokenHex(sourceText: string, token: string): string {
  const value = sourceText.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`, "u"))?.[1]
  if (!value) throw new Error(`missing_color_token:${token}`)
  return value
}

function contrastRatio(left: string, right: string): number {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  )
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
