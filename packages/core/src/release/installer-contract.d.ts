export declare const INSTALLER_TARGETS: readonly ["darwin-arm64", "darwin-x64", "linux-x64", "win32-arm64", "win32-x64"];
export type InstallerTarget = (typeof INSTALLER_TARGETS)[number];
export type InstallerArchive = "tar.gz" | "zip";
interface InstallerArtifactBase {
    readonly target: InstallerTarget;
    readonly archive: InstallerArchive;
    readonly name: string;
    readonly sizeBytes: number;
    readonly sha256: string;
    readonly entrypoint: string;
    readonly nodeModuleAbi: number;
}
export interface LinuxInstallerArtifact extends InstallerArtifactBase {
    readonly target: "linux-x64";
    readonly archive: "tar.gz";
    readonly libc: "glibc";
}
export interface NonLinuxInstallerArtifact extends InstallerArtifactBase {
    readonly target: Exclude<InstallerTarget, "linux-x64">;
}
export type InstallerArtifact = LinuxInstallerArtifact | NonLinuxInstallerArtifact;
/** Unsigned installer manifests deliberately carry artifact integrity, not publisher identity. */
export interface UnsignedInstallerManifestV2 {
    readonly kind: "knowbee.install.manifest";
    readonly schemaVersion: 2;
    readonly releaseVersion: string;
    readonly channel: "stable";
    readonly node: {
        readonly version: string;
        readonly moduleAbi: number;
    };
    readonly artifacts: readonly InstallerArtifact[];
}
export type InstallerManifestRejectionReason = "manifest_invalid" | "schema_version_unsupported" | "node_version_unsupported" | `artifact_target_missing:${InstallerTarget}` | `artifact_target_duplicate:${InstallerTarget}` | `artifact_abi_mismatch:${InstallerTarget}`;
export type UnsignedInstallerManifestParseResult = {
    readonly status: "accepted";
    readonly manifest: UnsignedInstallerManifestV2;
} | {
    readonly status: "rejected";
    readonly reasonCode: InstallerManifestRejectionReason;
};
export interface DarwinInstallerHostSnapshot {
    readonly os: "darwin";
    readonly nativeArch: "arm64" | "x64" | string;
    readonly processArch: string;
    readonly osVersion: string;
}
export interface LinuxInstallerHostSnapshot {
    readonly os: "linux";
    readonly nativeArch: "x64" | string;
    readonly processArch: string;
    readonly kernelVersion: string;
    readonly libc: {
        readonly family: "glibc" | "musl" | string;
        readonly version: string;
    };
    readonly libstdcxxVersion: string;
    readonly session: {
        readonly kind: "desktop" | "headless" | string;
        readonly systemdUser: boolean;
        readonly dbus: boolean;
    };
}
export interface WindowsInstallerHostSnapshot {
    readonly os: "win32";
    readonly nativeArch: "arm64" | "x64" | string;
    readonly processArch: string;
    readonly osBuild: number;
    readonly powershell: {
        readonly version: string;
        readonly languageMode: string;
    };
}
export interface UnknownInstallerHostSnapshot {
    readonly os: string;
    readonly nativeArch: string;
    readonly processArch: string;
}
export type InstallerHostSnapshot = DarwinInstallerHostSnapshot | LinuxInstallerHostSnapshot | WindowsInstallerHostSnapshot | UnknownInstallerHostSnapshot;
export type InstallerHostRejectionReason = "host_os_unsupported" | "host_arch_unsupported" | "macos_version_unsupported" | "linux_kernel_version_unsupported" | "linux_libc_unsupported" | "linux_glibc_version_unsupported" | "linux_libstdcxx_version_unsupported" | "linux_desktop_session_required" | "linux_systemd_user_required" | "linux_dbus_required" | "windows_version_unsupported" | "powershell_version_unsupported" | "powershell_language_mode_unsupported" | `artifact_target_unavailable:${InstallerTarget}`;
export type InstallerArtifactSelectionResult = {
    readonly status: "ready";
    readonly target: InstallerTarget;
    readonly artifact: InstallerArtifact;
    readonly node: UnsignedInstallerManifestV2["node"];
} | {
    readonly status: "blocked";
    readonly reasonCode: InstallerHostRejectionReason;
};
/** Parses only schema v2 so a caller cannot silently downgrade unsigned delivery to signed v1. */
export declare function parseUnsignedInstallerManifest(input: unknown): UnsignedInstallerManifestParseResult;
export declare function selectInstallerArtifact(input: {
    readonly manifest: UnsignedInstallerManifestV2;
    readonly host: InstallerHostSnapshot;
}): InstallerArtifactSelectionResult;
export {};
//# sourceMappingURL=installer-contract.d.ts.map