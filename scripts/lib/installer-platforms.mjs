export const INSTALLER_NODE_RUNTIME = Object.freeze({
  version: "24.18.0",
  moduleAbi: 137,
})

export const INSTALLER_PLATFORM_PROFILES = Object.freeze([
  Object.freeze({
    target: "darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    archive: "tar.gz",
    nodeRuntimeArchive: `node-v${INSTALLER_NODE_RUNTIME.version}-darwin-arm64.tar.gz`,
    nodeRuntimeSha256: "e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1",
    yeonjangPackage: "@sponzey/yeonjang-darwin-arm64",
    binaryName: "knowbee-yeonjang",
  }),
  Object.freeze({
    target: "darwin-x64",
    os: "darwin",
    cpu: "x64",
    archive: "tar.gz",
    nodeRuntimeArchive: `node-v${INSTALLER_NODE_RUNTIME.version}-darwin-x64.tar.gz`,
    nodeRuntimeSha256: "dfd0dbd3e721503434df7b7205e719f61b3a3a31b2bcf9729b8b91fea240f080",
    yeonjangPackage: "@sponzey/yeonjang-darwin-x64",
    binaryName: "knowbee-yeonjang",
  }),
  Object.freeze({
    target: "linux-x64",
    os: "linux",
    cpu: "x64",
    libc: "glibc",
    archive: "tar.gz",
    nodeRuntimeArchive: `node-v${INSTALLER_NODE_RUNTIME.version}-linux-x64.tar.xz`,
    nodeRuntimeSha256: "55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742",
    yeonjangPackage: "@sponzey/yeonjang-linux-x64",
    binaryName: "knowbee-yeonjang",
  }),
  Object.freeze({
    target: "win32-arm64",
    os: "win32",
    cpu: "arm64",
    archive: "zip",
    nodeRuntimeArchive: `node-v${INSTALLER_NODE_RUNTIME.version}-win-arm64.zip`,
    nodeRuntimeSha256: "f274669adb93b1fd0fbf8f21fd078609e9dcc84333d4f2718d2dde3f9a161a01",
    yeonjangPackage: "@sponzey/yeonjang-win32-arm64",
    binaryName: "knowbee-yeonjang.exe",
  }),
  Object.freeze({
    target: "win32-x64",
    os: "win32",
    cpu: "x64",
    archive: "zip",
    nodeRuntimeArchive: `node-v${INSTALLER_NODE_RUNTIME.version}-win-x64.zip`,
    nodeRuntimeSha256: "0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821",
    yeonjangPackage: "@sponzey/yeonjang-win32-x64",
    binaryName: "knowbee-yeonjang.exe",
  }),
])

export const INSTALLER_PLATFORM_BY_TARGET = Object.freeze(
  Object.fromEntries(INSTALLER_PLATFORM_PROFILES.map((profile) => [profile.target, profile])),
)
