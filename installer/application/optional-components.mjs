const PACKAGE_BY_TARGET = Object.freeze({
  "darwin-arm64": "@sponzey/yeonjang-darwin-arm64",
  "darwin-x64": "@sponzey/yeonjang-darwin-x64",
  "linux-x64": "@sponzey/yeonjang-linux-x64",
  "win32-arm64": "@sponzey/yeonjang-win32-arm64",
  "win32-x64": "@sponzey/yeonjang-win32-x64",
})

function blocked(reasonCode) {
  return { status: "blocked", reasonCode }
}

export function selectOptionalYeonjang(input) {
  if (input?.selected !== true) return { status: "disabled" }
  const inventory = input.inventory
  if (
    typeof input.target !== "string" ||
    !PACKAGE_BY_TARGET[input.target] ||
    inventory?.kind !== "knowbee.installer.bundle_inventory" ||
    inventory.schemaVersion !== 1
  ) {
    return blocked("installer_yeonjang_inventory_invalid")
  }
  if (inventory.target !== input.target) {
    return blocked("installer_yeonjang_target_mismatch")
  }
  if (inventory.yeonjang?.status !== "included") {
    return blocked("installer_yeonjang_not_verified")
  }
  if (
    inventory.yeonjang.target !== input.target ||
    inventory.yeonjang.packageName !== PACKAGE_BY_TARGET[input.target]
  ) {
    return blocked("installer_yeonjang_target_mismatch")
  }
  return {
    status: "ready",
    packageName: inventory.yeonjang.packageName,
    permissionAction: "none",
    launchAction: "deferred_until_initialized",
  }
}
