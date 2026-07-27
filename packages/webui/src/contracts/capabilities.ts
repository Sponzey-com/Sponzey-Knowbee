import type { CapabilityCounts, FeatureCapability } from "@knowbee/core"

export type {
  CapabilityArea,
  CapabilityCounts,
  CapabilityStatus,
  FeatureCapability,
} from "@knowbee/core"

export function countCapabilities(items: FeatureCapability[]): CapabilityCounts {
  return items.reduce<CapabilityCounts>(
    (acc, item) => {
      acc[item.status] += 1
      return acc
    },
    { ready: 0, disabled: 0, planned: 0, error: 0 },
  )
}
