const ACTIVE_WORK_STATUSES = new Set(["queued", "running", "awaiting_approval", "awaiting_user"])

export interface WorkListItem {
  key: string
  status: string
  createdAt?: number
  updatedAt: number
}

export function sortWorkItemsActiveFirst<T extends WorkListItem>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const activeOrder =
      Number(ACTIVE_WORK_STATUSES.has(right.status)) - Number(ACTIVE_WORK_STATUSES.has(left.status))
    if (activeOrder !== 0) return activeOrder
    const createdOrder = (right.createdAt ?? right.updatedAt) - (left.createdAt ?? left.updatedAt)
    if (createdOrder !== 0) return createdOrder
    const updatedOrder = right.updatedAt - left.updatedAt
    return updatedOrder !== 0 ? updatedOrder : left.key.localeCompare(right.key)
  })
}
