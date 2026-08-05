export interface VersionEnvironmentSnapshot {
    displayVersion: string | null;
    gitVersion: string | null;
}
export declare function createVersionEnvironmentSnapshot(env: Readonly<Record<string, string | undefined>>): VersionEnvironmentSnapshot;
export declare function getWorkspaceRootPath(): string;
export declare function getWorkspacePackageJsonPath(): string;
export declare function getCurrentAppVersion(): string;
export declare function getCurrentDisplayVersion(snapshot?: VersionEnvironmentSnapshot): string;
//# sourceMappingURL=version.d.ts.map