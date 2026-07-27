export interface UiTokenContract {
  primitive: Readonly<Record<string, string>>
  semantic: Readonly<Record<string, string>>
  component: Readonly<Record<string, string>>
}

export const UI_TOKEN_CONTRACT: UiTokenContract = {
  primitive: {
    "color-ink": "#1c1917",
    "color-muted": "#57534e",
    "color-surface": "#ffffff",
    "color-subtle": "#f5f5f4",
    "color-border": "#d6d3d1",
    "color-focus": "#2563eb",
    "color-info": "#0369a1",
    "color-success": "#047857",
    "color-warning": "#a16207",
    "color-danger": "#b91c1c",
  },
  semantic: {
    "text-primary": "var(--ui-color-ink)",
    "text-muted": "var(--ui-color-muted)",
    "surface-default": "var(--ui-color-surface)",
    "surface-subtle": "var(--ui-color-subtle)",
    "border-default": "var(--ui-color-border)",
    "focus-ring": "var(--ui-color-focus)",
    "status-info": "var(--ui-color-info)",
    "status-success": "var(--ui-color-success)",
    "status-warning": "var(--ui-color-warning)",
    "status-danger": "var(--ui-color-danger)",
  },
  component: {
    "control-min-height-mobile": "44px",
    "control-min-height-desktop": "40px",
    "surface-radius": "8px",
    "focus-shadow": "0 0 0 3px var(--ui-focus-ring)",
  },
} as const

export type UiTokenDiagnostic = {
  layer: "primitive" | "semantic" | "component"
  token: string
  reasonCode: "primitive_references_token" | "semantic_reference_invalid" | "component_value_invalid"
}

function referencedToken(value: string): string | null {
  return value.match(/^var\(--ui-([a-z0-9-]+)\)$/)?.[1] ?? null
}

export function validateUiTokenContract(
  contract: UiTokenContract,
): { ok: boolean; diagnostics: UiTokenDiagnostic[] } {
  const diagnostics: UiTokenDiagnostic[] = []
  for (const [token, value] of Object.entries(contract.primitive)) {
    if (value.includes("var(--ui-")) {
      diagnostics.push({ layer: "primitive", token, reasonCode: "primitive_references_token" })
    }
  }
  for (const [token, value] of Object.entries(contract.semantic)) {
    const reference = referencedToken(value)
    if (!reference || !(reference in contract.primitive)) {
      diagnostics.push({ layer: "semantic", token, reasonCode: "semantic_reference_invalid" })
    }
  }
  for (const [token, value] of Object.entries(contract.component)) {
    const validDimension = /^(8|40|44)px$/.test(value)
    const semanticReferences = [...value.matchAll(/var\(--ui-([a-z0-9-]+)\)/g)]
      .map((match) => match[1] ?? "")
    const validReferences = semanticReferences.every((reference) => reference in contract.semantic)
    if ((!validDimension && semanticReferences.length === 0) || !validReferences) {
      diagnostics.push({ layer: "component", token, reasonCode: "component_value_invalid" })
    }
  }
  return { ok: diagnostics.length === 0, diagnostics }
}
