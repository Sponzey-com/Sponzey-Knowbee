import * as React from "react"
import { useLocation } from "react-router-dom"
import { EnterpriseTopologyPage } from "./EnterpriseTopologyPage"
import {
  TOPOLOGY_WORKSPACE_LAYER_COPY,
} from "../lib/topology-workspace-copy"
import {
  buildTopologyWorkspaceModel,
  buildTopologyWorkspaceSnapshot,
  selectTopologyWorkspaceLayer,
  type TopologyWorkspaceLayer,
  type TopologyWorkspaceModel,
} from "../lib/topology-workspace"
import { useUiI18n } from "../lib/ui-i18n"

const TOPOLOGY_WORKSPACE_LAYER_SET = new Set<TopologyWorkspaceLayer>([
  "build",
  "run",
  "trace",
  "improve",
  "resources",
])

export function resolveTopologyWorkspaceInitialLayer(search: string): TopologyWorkspaceLayer {
  const normalizedSearch = search.startsWith("?") ? search : `?${search}`
  const params = new URLSearchParams(normalizedSearch)
  const requested = params.get("mode") ?? params.get("layer")
  return requested && TOPOLOGY_WORKSPACE_LAYER_SET.has(requested as TopologyWorkspaceLayer)
    ? requested as TopologyWorkspaceLayer
    : "build"
}

export interface TopologyWorkspaceRouteShellProps {
  initialLayer?: TopologyWorkspaceLayer
  children?: React.ReactNode | ((model: TopologyWorkspaceModel, actions: TopologyWorkspaceRouteShellActions) => React.ReactNode)
}

export interface TopologyWorkspaceRouteShellActions {
  selectLayer: (layer: TopologyWorkspaceLayer) => void
}

export function TopologyWorkspaceRouteShell({
  initialLayer = "build",
  children,
}: TopologyWorkspaceRouteShellProps) {
  const { text } = useUiI18n()
  const [model, setModel] = React.useState(() => buildTopologyWorkspaceModel({
    snapshot: buildTopologyWorkspaceSnapshot({ topologyId: "workspace:draft" }),
    selectedLayer: initialLayer,
  }))
  React.useEffect(() => {
    setModel((current) =>
      current.selectedLayer === initialLayer ? current : selectTopologyWorkspaceLayer(current, initialLayer)
    )
  }, [initialLayer])
  const selectLayer = React.useCallback((layer: TopologyWorkspaceLayer) => {
    setModel((current) => selectTopologyWorkspaceLayer(current, layer))
  }, [])
  const actions = React.useMemo(() => ({ selectLayer }), [selectLayer])
  const renderedChildren = typeof children === "function" ? children(model, actions) : children
  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-100 text-stone-950" data-testid="topology-workspace-route-shell">
      <header className="shrink-0 border-b border-stone-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
              {text("토폴로지", "Topology")}
            </div>
            <h1 className="mt-1 text-2xl font-semibold">
              {text("Topology Workspace", "Topology Workspace")}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={text("토폴로지 작업 모드", "Topology workspace modes")}>
            {TOPOLOGY_WORKSPACE_LAYER_COPY.map((layer) => (
              <button
                key={layer.layer}
                type="button"
                role="tab"
                aria-selected={layer.layer === model.selectedLayer}
                onClick={() => selectLayer(layer.layer)}
                title={text(layer.tooltipKo, layer.tooltipEn)}
                className={`h-9 rounded-lg border px-3 text-xs font-semibold ${
                  layer.layer === model.selectedLayer
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-700"
                }`}
                data-testid={`topology-workspace-layer-${layer.layer}`}
              >
                {text(layer.labelKo, layer.labelEn)}
              </button>
            ))}
          </div>
        </div>
      </header>
      <output
        className="sr-only"
        aria-live="polite"
        data-testid="topology-workspace-model-state"
        data-topology-id={model.topologyId}
        data-selected-layer={model.selectedLayer}
        data-selection-kind={model.selection.kind}
      >
        {model.topologyId}:{model.selectedLayer}:{model.selection.kind}
      </output>
      <div className="min-h-0 flex-1 overflow-hidden">
        {renderedChildren}
      </div>
    </div>
  )
}

export function TopologyWorkspacePage() {
  const location = useLocation()
  const initialLayer = React.useMemo(
    () => resolveTopologyWorkspaceInitialLayer(location.search),
    [location.search],
  )
  return (
    <TopologyWorkspaceRouteShell initialLayer={initialLayer}>
      {(model, actions) => (
        <EnterpriseTopologyPage
          workspaceLayer={model.selectedLayer}
          onWorkspaceLayerChange={actions.selectLayer}
        />
      )}
    </TopologyWorkspaceRouteShell>
  )
}
