import React, { createRef } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { Drawer } from "../packages/webui/src/components/ui/Drawer.js"
import { resolveTrappedFocusIndex } from "../packages/webui/src/lib/focus-trap.js"
import { SaveBar, transitionSaveState } from "../packages/webui/src/components/ui/SaveBar.js"
import { Skeleton } from "../packages/webui/src/components/ui/Skeleton.js"

describe("task011 overlay save and loading primitives", () => {
  it("renders a named modal drawer with a close command and focus return contract", () => {
    const html = renderToStaticMarkup(<Drawer open title="Edit agent" onClose={() => {}} returnFocusRef={createRef()}><p>Fields</p></Drawer>)
    expect(html).toContain("role=\"dialog\"")
    expect(html).toContain("aria-modal=\"true\"")
    expect(html).toContain("aria-label=\"Close Edit agent\"")
    expect(html).toContain("max-sm:inset-0")
    expect(resolveTrappedFocusIndex({ currentIndex: 1, focusableCount: 2, shiftKey: false })).toBe(0)
    expect(resolveTrappedFocusIndex({ currentIndex: 0, focusableCount: 2, shiftKey: true })).toBe(1)
  })

  it("allows only explicit save-state transitions", () => {
    expect(transitionSaveState("clean", "edit")).toBe("dirty")
    expect(transitionSaveState("dirty", "save")).toBe("saving")
    expect(transitionSaveState("saving", "succeed")).toBe("saved")
    expect(() => transitionSaveState("clean", "succeed")).toThrow("Invalid save state transition")
    const html = renderToStaticMarkup(<SaveBar state="failed" onSave={() => {}} message="Could not save" />)
    expect(html).toContain("role=\"alert\"")
    expect(html).toContain("Could not save")
    expect(html).toContain("disabled=\"\"")
  })

  it("requires stable skeleton dimensions and disables motion when requested", () => {
    const html = renderToStaticMarkup(<Skeleton width="12rem" height="2.5rem" label="Loading capabilities" />)
    expect(html).toContain("width:12rem")
    expect(html).toContain("height:2.5rem")
    expect(html).toContain("motion-reduce:animate-none")
    expect(() => renderToStaticMarkup(<Skeleton width="" height="" label="Loading" />)).toThrow("Skeleton dimensions are required")
  })
})
