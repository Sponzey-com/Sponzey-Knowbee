#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const REQUIRED_CHECKS = [
  ["horizontalOverflow", false, "horizontal_overflow"],
  ["composerVisible", true, "composer_not_visible"],
  ["composerEditable", true, "composer_not_editable"],
  ["keyboardSubmitVerified", true, "keyboard_submit_unverified"],
  ["shiftEnterVerified", true, "shift_enter_unverified"],
  ["imeVerified", true, "ime_unverified"],
  ["focusVerified", true, "focus_unverified"],
  ["accessibleStatusPresent", true, "accessible_status_missing"],
  ["recoveryControlsPresent", true, "recovery_controls_missing"],
]

export function validateBrowserObservation(observation, expected) {
  const failures = []
  if (observation?.schemaVersion !== 1) failures.push("schema_version_invalid")
  if (observation?.baseUrl !== expected.baseUrl) failures.push("base_url_mismatch")
  if (observation?.gatewayUrl !== expected.gatewayUrl) failures.push("gateway_url_mismatch")

  const viewports = Array.isArray(observation?.viewports) ? observation.viewports : []
  for (const viewportId of expected.viewports) {
    const [width, height] = viewportId.split("x").map(Number)
    const viewport = viewports.find(
      (item) => item?.width === width && item?.height === height,
    )
    if (!viewport) {
      failures.push(`viewport_missing:${viewportId}`)
      continue
    }
    for (const [field, expectedValue, reasonCode] of REQUIRED_CHECKS) {
      if (viewport[field] !== expectedValue) failures.push(`${reasonCode}:${viewportId}`)
    }
  }
  return { ok: failures.length === 0, failures }
}

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("invalid_arguments")
    }
    values.set(key.slice(2), value)
  }
  const baseUrl = values.get("base-url")
  const gatewayUrl = values.get("gateway-url")
  const output = values.get("output")
  const viewports = values.get("viewports")?.split(",").filter(Boolean)
  if (!baseUrl || !gatewayUrl || !output || !viewports?.length) {
    throw new Error("required_arguments_missing")
  }
  return {
    baseUrl,
    gatewayUrl,
    output,
    viewports,
    observation:
      values.get("browser-observation")
      ?? ".tasks/conversation-webui-browser-observation.json",
  }
}

async function endpointStatus(url) {
  try {
    const response = await fetch(url, { redirect: "manual" })
    return response.ok ? "reachable" : "unreachable"
  } catch {
    return "unreachable"
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const raw = await readFile(resolve(options.observation), "utf8")
  const observation = JSON.parse(raw)
  const validation = validateBrowserObservation(observation, options)
  const webUiStatus = await endpointStatus(options.baseUrl)
  const gatewayStatus = await endpointStatus(`${options.gatewayUrl}/api/health`)
  const failures = [
    ...validation.failures,
    ...(webUiStatus === "reachable" ? [] : ["webui_unreachable"]),
    ...(gatewayStatus === "reachable" ? [] : ["gateway_unreachable"]),
  ]
  const evidence = {
    schemaVersion: 1,
    evidenceClass: "working_evidence_only",
    status: failures.length === 0 ? "passed" : "failed",
    baseUrl: options.baseUrl,
    gatewayUrl: options.gatewayUrl,
    viewports: options.viewports,
    endpointStatus: {
      webui: webUiStatus,
      gateway: gatewayStatus,
    },
    failures,
  }
  const outputPath = resolve(options.output)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8")
  if (failures.length > 0) process.exitCode = 1
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
