export const INSTALLER_TARGETS = [
    "darwin-arm64",
    "darwin-x64",
    "linux-x64",
    "win32-arm64",
    "win32-x64",
];
const ROOT_KEYS = ["kind", "schemaVersion", "releaseVersion", "channel", "node", "artifacts"];
const NODE_KEYS = ["version", "moduleAbi"];
const ARTIFACT_KEYS = [
    "target",
    "archive",
    "name",
    "sizeBytes",
    "sha256",
    "entrypoint",
    "nodeModuleAbi",
];
const LINUX_ARTIFACT_KEYS = [...ARTIFACT_KEYS, "libc"];
const TARGET_SET = new Set(INSTALLER_TARGETS);
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value, expected) {
    const keys = Object.keys(value);
    return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
function isPositiveSafeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function isInstallerTarget(value) {
    return typeof value === "string" && TARGET_SET.has(value);
}
function isSafeArchiveName(value) {
    return (typeof value === "string" &&
        value.length > 0 &&
        value.length <= 200 &&
        /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value));
}
function isSafeRelativePath(value) {
    if (typeof value !== "string" || value.length === 0 || value.length > 200)
        return false;
    if (value.startsWith("/") || value.startsWith("\\") || value.includes("\\"))
        return false;
    const segments = value.split("/");
    return segments.every((segment) => segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        /^[a-zA-Z0-9._-]+$/.test(segment));
}
function parseArtifact(input) {
    if (!isRecord(input) || !isInstallerTarget(input.target))
        return undefined;
    const linux = input.target === "linux-x64";
    if (!hasExactKeys(input, linux ? LINUX_ARTIFACT_KEYS : ARTIFACT_KEYS))
        return undefined;
    if (input.archive !== (input.target.startsWith("win32-") ? "zip" : "tar.gz"))
        return undefined;
    if (!isSafeArchiveName(input.name))
        return undefined;
    if (!isPositiveSafeInteger(input.sizeBytes) || input.sizeBytes > 10_000_000_000)
        return undefined;
    if (typeof input.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.sha256))
        return undefined;
    if (!isSafeRelativePath(input.entrypoint))
        return undefined;
    if (!isPositiveSafeInteger(input.nodeModuleAbi))
        return undefined;
    const common = {
        target: input.target,
        archive: input.archive,
        name: input.name,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        entrypoint: input.entrypoint,
        nodeModuleAbi: input.nodeModuleAbi,
    };
    if (linux) {
        if (input.libc !== "glibc")
            return undefined;
        return { ...common, target: "linux-x64", archive: "tar.gz", libc: "glibc" };
    }
    return common;
}
function parseVersionParts(value) {
    if (!/^\d+(?:\.\d+)*$/.test(value))
        return undefined;
    const parts = value.split(".").map(Number);
    return parts.every((part) => Number.isSafeInteger(part)) ? parts : undefined;
}
function versionAtLeast(value, minimum) {
    const parts = parseVersionParts(value);
    if (!parts)
        return false;
    const length = Math.max(parts.length, minimum.length);
    for (let index = 0; index < length; index += 1) {
        const actual = parts[index] ?? 0;
        const required = minimum[index] ?? 0;
        if (actual > required)
            return true;
        if (actual < required)
            return false;
    }
    return true;
}
/** Parses only schema v2 so a caller cannot silently downgrade unsigned delivery to signed v1. */
export function parseUnsignedInstallerManifest(input) {
    if (!isRecord(input))
        return { status: "rejected", reasonCode: "manifest_invalid" };
    if (input.schemaVersion !== 2) {
        return { status: "rejected", reasonCode: "schema_version_unsupported" };
    }
    if (!hasExactKeys(input, ROOT_KEYS) ||
        input.kind !== "knowbee.install.manifest" ||
        input.channel !== "stable" ||
        typeof input.releaseVersion !== "string" ||
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.releaseVersion) ||
        !isRecord(input.node) ||
        !hasExactKeys(input.node, NODE_KEYS) ||
        typeof input.node.version !== "string" ||
        !/^24\.\d+\.\d+$/.test(input.node.version) ||
        !isPositiveSafeInteger(input.node.moduleAbi) ||
        !Array.isArray(input.artifacts)) {
        if (isRecord(input.node) &&
            typeof input.node.version === "string" &&
            /^\d+\.\d+\.\d+$/.test(input.node.version) &&
            !/^24\./.test(input.node.version)) {
            return { status: "rejected", reasonCode: "node_version_unsupported" };
        }
        return { status: "rejected", reasonCode: "manifest_invalid" };
    }
    const artifacts = [];
    for (const candidate of input.artifacts) {
        const artifact = parseArtifact(candidate);
        if (!artifact)
            return { status: "rejected", reasonCode: "manifest_invalid" };
        artifacts.push(artifact);
    }
    for (const target of INSTALLER_TARGETS) {
        const matches = artifacts.filter((artifact) => artifact.target === target);
        if (matches.length > 1) {
            return { status: "rejected", reasonCode: `artifact_target_duplicate:${target}` };
        }
        const artifact = matches[0];
        if (!artifact)
            return { status: "rejected", reasonCode: `artifact_target_missing:${target}` };
        if (artifact.nodeModuleAbi !== input.node.moduleAbi) {
            return { status: "rejected", reasonCode: `artifact_abi_mismatch:${target}` };
        }
    }
    return {
        status: "accepted",
        manifest: {
            kind: "knowbee.install.manifest",
            schemaVersion: 2,
            releaseVersion: input.releaseVersion,
            channel: "stable",
            node: { version: input.node.version, moduleAbi: input.node.moduleAbi },
            artifacts,
        },
    };
}
function selectDarwinTarget(host) {
    if (host.nativeArch !== "arm64" && host.nativeArch !== "x64")
        return "host_arch_unsupported";
    if (!versionAtLeast(host.osVersion, [13, 5]))
        return "macos_version_unsupported";
    return `darwin-${host.nativeArch}`;
}
function selectLinuxTarget(host) {
    if (host.nativeArch !== "x64")
        return "host_arch_unsupported";
    if (!versionAtLeast(host.kernelVersion, [4, 18]))
        return "linux_kernel_version_unsupported";
    if (host.libc.family !== "glibc")
        return "linux_libc_unsupported";
    if (!versionAtLeast(host.libc.version, [2, 28]))
        return "linux_glibc_version_unsupported";
    if (!versionAtLeast(host.libstdcxxVersion, [3, 4, 25])) {
        return "linux_libstdcxx_version_unsupported";
    }
    if (host.session.kind !== "desktop")
        return "linux_desktop_session_required";
    if (!host.session.systemdUser)
        return "linux_systemd_user_required";
    if (!host.session.dbus)
        return "linux_dbus_required";
    return "linux-x64";
}
function selectWindowsTarget(host) {
    if (host.nativeArch !== "arm64" && host.nativeArch !== "x64")
        return "host_arch_unsupported";
    if (!Number.isSafeInteger(host.osBuild) || host.osBuild < 22_000) {
        return "windows_version_unsupported";
    }
    const powershellParts = parseVersionParts(host.powershell.version);
    const supportedPowerShell = powershellParts !== undefined &&
        ((powershellParts[0] === 5 && (powershellParts[1] ?? 0) >= 1) || (powershellParts[0] ?? 0) >= 7);
    if (!supportedPowerShell)
        return "powershell_version_unsupported";
    if (host.powershell.languageMode !== "FullLanguage") {
        return "powershell_language_mode_unsupported";
    }
    return `win32-${host.nativeArch}`;
}
export function selectInstallerArtifact(input) {
    let selection;
    if (input.host.os === "darwin" && "osVersion" in input.host) {
        selection = selectDarwinTarget(input.host);
    }
    else if (input.host.os === "linux" && "kernelVersion" in input.host) {
        selection = selectLinuxTarget(input.host);
    }
    else if (input.host.os === "win32" && "osBuild" in input.host) {
        selection = selectWindowsTarget(input.host);
    }
    else {
        selection = "host_os_unsupported";
    }
    if (!isInstallerTarget(selection))
        return { status: "blocked", reasonCode: selection };
    const target = selection;
    const artifact = input.manifest.artifacts.find((candidate) => candidate.target === target);
    if (!artifact) {
        return { status: "blocked", reasonCode: `artifact_target_unavailable:${target}` };
    }
    return { status: "ready", target, artifact, node: input.manifest.node };
}
//# sourceMappingURL=installer-contract.js.map