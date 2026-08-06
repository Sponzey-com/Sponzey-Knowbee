import type { InstallerTarget } from "./installer-contract.js";
export interface InstallerLayout {
    readonly installRoot: string;
    readonly versionsRoot: string;
    readonly currentPointer: string;
    readonly stateRoot: string;
    readonly binDirectory: string;
    readonly serviceIdentity: string;
    readonly serviceDefinition: string;
}
export interface InstallerPreflightInput {
    readonly hostSupport: {
        readonly status: "supported";
        readonly target: InstallerTarget;
    };
    readonly paths: {
        readonly homeDirectory?: string;
        readonly xdgDataHome?: string;
        readonly xdgConfigHome?: string;
        readonly userProfile?: string;
        readonly localAppData?: string;
    };
    readonly prerequisites: {
        readonly tlsTrusted: boolean;
        readonly commands: readonly string[];
    };
    readonly disk: {
        readonly availableBytes: number;
        readonly requiredBytes: number;
    };
    readonly interaction: {
        readonly tty: boolean;
        readonly nonInteractive: boolean;
    };
    readonly currentPathEntries: readonly string[];
}
export type InstallerPreflightResult = {
    readonly status: "ready";
    readonly target: InstallerTarget;
    readonly layout: InstallerLayout;
    readonly mutations: {
        readonly userPath: boolean;
        readonly userService: true;
        readonly browserLaunch: true;
    };
    readonly userActions: {
        readonly commandCount: 1;
        readonly confirmationCount: 0 | 1;
        readonly followUpCommandCount: 0;
    };
} | {
    readonly status: "blocked";
    readonly reasonCode: string;
};
export declare function buildInstallerPreflight(input: InstallerPreflightInput): InstallerPreflightResult;
//# sourceMappingURL=installer-preflight.d.ts.map