import * as React from "react"
import type {
  EnterpriseTopologyRunRecord,
  WorkOrderTemplatePreset,
  WorkOrderTemplateSimulationMode,
} from "../../lib/enterprise-topology-operations"
import type { TopologyRunTraceOverlayInput } from "./TopologyRunTraceOverlay"
import {
  TopologyRunStrip,
  type TopologyRunTargetState,
} from "./TopologyRunStrip"

export {
  TOPOLOGY_RUN_CONTEXT_PRESETS,
  TopologyRunStrip,
  buildTopologyRunRequestPayload,
  resolveTopologyRunTargetState,
  topologyRunEntryNodeIds,
  type TopologyRunTargetIssue,
  type TopologyRunTargetSource,
  type TopologyRunTargetState,
} from "./TopologyRunStrip"

export function TopologyRunLauncher({
  templates,
  selectedTemplateId,
  selectedContextPresetId,
  simulationMode,
  advancedInstruction,
  runTargetNodeId,
  targetState,
  recentRuns,
  selectedRunId,
  traceOverlay,
  loading = false,
  onSelectTemplate,
  onSelectContextPreset,
  onSelectSimulationMode,
  onAdvancedInstructionChange,
  onRun,
  onSelectRunHistory,
  onTraceLayerRequest,
  onStartNodeQuickFix,
}: {
  templates: WorkOrderTemplatePreset[]
  selectedTemplateId?: string
  selectedContextPresetId?: string
  simulationMode: WorkOrderTemplateSimulationMode
  advancedInstruction: string
  runTargetNodeId?: string | null
  targetState?: TopologyRunTargetState | null
  recentRuns?: EnterpriseTopologyRunRecord[]
  selectedRunId?: string | null
  traceOverlay?: TopologyRunTraceOverlayInput | null
  loading?: boolean
  onSelectTemplate?: (templateId: string) => void
  onSelectContextPreset?: (contextPresetId: string) => void
  onSelectSimulationMode?: (mode: WorkOrderTemplateSimulationMode) => void
  onAdvancedInstructionChange?: (value: string) => void
  onRun?: () => void
  onSelectRunHistory?: (topologyRunId: string) => void
  onTraceLayerRequest?: () => void
  onStartNodeQuickFix?: () => void
}) {
  return (
    <TopologyRunStrip
      templates={templates}
      selectedTemplateId={selectedTemplateId}
      selectedContextPresetId={selectedContextPresetId}
      simulationMode={simulationMode}
      advancedInstruction={advancedInstruction}
      runTargetNodeId={runTargetNodeId}
      targetState={targetState}
      recentRuns={recentRuns}
      selectedRunId={selectedRunId}
      traceOverlay={traceOverlay}
      loading={loading}
      onSelectTemplate={onSelectTemplate}
      onSelectContextPreset={onSelectContextPreset}
      onSelectSimulationMode={onSelectSimulationMode}
      onAdvancedInstructionChange={onAdvancedInstructionChange}
      onRun={onRun}
      onSelectRunHistory={onSelectRunHistory}
      onTraceLayerRequest={onTraceLayerRequest}
      onStartNodeQuickFix={onStartNodeQuickFix}
    />
  )
}
