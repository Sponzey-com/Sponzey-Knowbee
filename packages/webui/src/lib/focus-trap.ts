export function resolveTrappedFocusIndex(input: {
  currentIndex: number
  focusableCount: number
  shiftKey: boolean
}): number {
  if (input.focusableCount < 1) return -1
  if (input.shiftKey)
    return input.currentIndex <= 0 ? input.focusableCount - 1 : input.currentIndex - 1
  return input.currentIndex >= input.focusableCount - 1 ? 0 : input.currentIndex + 1
}
