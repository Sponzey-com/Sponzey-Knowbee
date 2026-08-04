export const WEBUI_BUILD_BASELINE_SCHEMA_VERSION = "knowbee.webui.build-baseline:v1"

export const WEBUI_BUILD_BUDGET = Object.freeze({
  initialSharedGzipBytes: 180 * 1024,
  routeGzipBytes: 120 * 1024,
})

function manifestFile(manifest, reference) {
  const entry = manifest[reference]
  return entry && typeof entry.file === "string" ? entry.file : null
}

function compareStableText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function resolveRouteManifestEntry(manifest, binding) {
  if (binding.source) {
    const entry = manifest[binding.source]
    return entry ? { key: binding.source, entry } : null
  }
  if (!binding.chunkName) return null
  const matches = Object.entries(manifest).filter(
    ([, entry]) => entry?.name === binding.chunkName && entry?.isDynamicEntry === true,
  )
  return matches.length === 1 ? { key: `chunk:${binding.chunkName}`, entry: matches[0][1] } : null
}

function resolveManifestReferences(manifest, references, diagnostics) {
  const files = []
  for (const reference of references ?? []) {
    const file = manifestFile(manifest, reference)
    if (!file) {
      diagnostics.push({ reasonCode: "manifest_import_missing", reference })
      continue
    }
    files.push(file)
  }
  return files.sort(compareStableText)
}

export function buildWebUiBuildBaseline(input) {
  const diagnostics = []
  const manifestEntries = Object.entries(input.manifest)
  const entry = manifestEntries.find(([, value]) => value?.isEntry === true)
  const entryFile = entry?.[1]?.file ?? null

  if (!entryFile) diagnostics.push({ reasonCode: "entry_manifest_missing", reference: "index" })

  const assets = manifestEntries
    .filter(([, value]) => typeof value?.file === "string")
    .map(([source, value]) => {
      const file = value.file
      const metric = input.assetMetrics[file]
      if (!metric) diagnostics.push({ reasonCode: "asset_metric_missing", reference: file })
      return {
        file,
        source,
        bytes: metric?.bytes ?? 0,
        gzipBytes: metric?.gzipBytes ?? 0,
        imports: resolveManifestReferences(input.manifest, value.imports, diagnostics),
        dynamicImports: resolveManifestReferences(
          input.manifest,
          value.dynamicImports,
          diagnostics,
        ),
      }
    })
    .sort((left, right) => compareStableText(left.file, right.file))

  const metricsByFile = new Map(assets.map((asset) => [asset.file, asset]))
  const routes = input.routeBindings
    .map((binding) => {
      const resolvedRouteEntry = resolveRouteManifestEntry(input.manifest, binding)
      const routeEntry = resolvedRouteEntry?.entry
      const sourceReference = binding.source ?? `chunk:${binding.chunkName ?? "unknown"}`
      if (!routeEntry || typeof routeEntry.file !== "string") {
        diagnostics.push({
          reasonCode: "route_source_missing",
          reference: sourceReference,
          route: binding.route,
        })
        return null
      }
      const direct = metricsByFile.get(routeEntry.file)
      const importedGzipBytes = (routeEntry.imports ?? []).reduce((total, reference) => {
        const file = manifestFile(input.manifest, reference)
        return total + (file ? (metricsByFile.get(file)?.gzipBytes ?? 0) : 0)
      }, 0)
      return {
        route: binding.route,
        source: resolvedRouteEntry.key,
        file: routeEntry.file,
        directGzipBytes: direct?.gzipBytes ?? 0,
        importedGzipBytes,
      }
    })
    .filter(Boolean)
    .sort((left, right) => compareStableText(left.route, right.route))

  diagnostics.sort((left, right) => {
    const reasonOrder = {
      entry_manifest_missing: 0,
      asset_metric_missing: 1,
      manifest_import_missing: 2,
      route_source_missing: 3,
    }
    const order = (reasonOrder[left.reasonCode] ?? 99) - (reasonOrder[right.reasonCode] ?? 99)
    if (order !== 0) return order
    return compareStableText(String(left.reference), String(right.reference))
  })

  return {
    schemaVersion: WEBUI_BUILD_BASELINE_SCHEMA_VERSION,
    mode: input.mode,
    complete: diagnostics.length === 0,
    diagnostics,
    entry: entryFile,
    assets,
    routes,
  }
}

export function evaluateWebUiBuildBudget(baseline) {
  const diagnostics = []
  const entryAsset = baseline.assets.find((asset) => asset.file === baseline.entry)
  if (entryAsset && entryAsset.gzipBytes > WEBUI_BUILD_BUDGET.initialSharedGzipBytes) {
    diagnostics.push({
      actualBytes: entryAsset.gzipBytes,
      ceilingBytes: WEBUI_BUILD_BUDGET.initialSharedGzipBytes,
      file: entryAsset.file,
      reasonCode: "initial_gzip_budget_exceeded",
    })
  }
  for (const route of baseline.routes) {
    if (route.directGzipBytes <= WEBUI_BUILD_BUDGET.routeGzipBytes) continue
    diagnostics.push({
      actualBytes: route.directGzipBytes,
      ceilingBytes: WEBUI_BUILD_BUDGET.routeGzipBytes,
      reasonCode: "route_gzip_budget_exceeded",
      route: route.route,
    })
  }
  return { ok: diagnostics.length === 0, diagnostics }
}
