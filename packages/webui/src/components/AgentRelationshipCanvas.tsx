import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import React, { useMemo } from "react"
import type { AgentRelationshipProjection, AgentWorkspaceItem } from "../contracts/agents"
import {
  type AgentRelationshipCanvasNode,
  buildAgentRelationshipCanvasModel,
} from "../lib/agent-relationship-viewmodel"
import { useUiI18n } from "../lib/ui-i18n"

interface RelationshipNodeData extends Record<string, unknown> {
  item: AgentRelationshipCanvasNode
  selected: boolean
  onSelect(agentRef: string): void
}

function RelationshipNode(props: NodeProps<Node<RelationshipNodeData>>) {
  const { item, selected, onSelect } = props.data
  return (
    <button
      type="button"
      data-testid="agent-relationship-node"
      data-agent-ref={item.agentRef}
      aria-pressed={selected}
      onClick={() => onSelect(item.agentRef)}
      className={`min-h-24 w-56 rounded-[var(--ui-surface-radius)] border bg-white px-4 py-3 text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-900 ${
        selected ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-stone-500" />
      <span className="block truncate text-xs font-semibold text-stone-500">
        {item.parentLabel}
      </span>
      <strong className="mt-2 block truncate text-sm text-stone-950">{item.name}</strong>
      <span className="mt-1 block truncate text-xs text-stone-600">{item.role}</span>
      <Handle type="source" position={Position.Right} className="!bg-stone-500" />
    </button>
  )
}

const nodeTypes = { relationshipAgent: RelationshipNode }

export function AgentRelationshipCanvas(props: {
  agents: readonly AgentWorkspaceItem[]
  projection: AgentRelationshipProjection
  selectedRef?: string | null
  onSelect(agentRef: string): void
}) {
  const { text } = useUiI18n()
  const model = useMemo(
    () => buildAgentRelationshipCanvasModel({ agents: props.agents, projection: props.projection }),
    [props.agents, props.projection],
  )
  const nodes = useMemo<Array<Node<RelationshipNodeData>>>(
    () =>
      model.nodes.map((item) => ({
        id: item.agentRef,
        type: "relationshipAgent",
        position: { x: item.x, y: item.y },
        data: { item, selected: props.selectedRef === item.agentRef, onSelect: props.onSelect },
        draggable: false,
        connectable: false,
        selectable: false,
      })),
    [model.nodes, props.onSelect, props.selectedRef],
  )
  const edges = useMemo<Array<Edge>>(
    () =>
      model.edges.map((edge) => ({
        id: edge.relationshipRef,
        source: edge.parentRef,
        target: edge.childRef,
        type: "smoothstep",
        style: { stroke: "#78716c", strokeWidth: 1.5 },
      })),
    [model.edges],
  )

  if (nodes.length === 0)
    return (
      <div
        className="flex h-full min-h-[32rem] items-center justify-center bg-white px-5 text-sm text-stone-500"
        data-testid="agent-relationship-empty"
      >
        {text("관계를 표시할 에이전트가 없습니다.", "No agent relationships to display.")}
      </div>
    )

  return (
    <div
      className="h-full min-h-[32rem] overflow-hidden bg-white"
      data-testid="agent-relationship-canvas"
      data-node-count={nodes.length}
      data-edge-count={edges.length}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView={nodes.length <= 12}
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          defaultViewport={{ x: 24, y: 24, zoom: 1 }}
          minZoom={0.35}
          maxZoom={1.2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          nodesFocusable
          edgesFocusable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#d6d3d1" gap={24} />
          <Controls position="top-left" showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}
