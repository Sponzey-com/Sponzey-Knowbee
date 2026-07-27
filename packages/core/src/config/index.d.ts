import { type KnowbeeConfig } from "./types.js";
import type { RuntimePaths } from "./paths.js";
type EnvSnapshot = Record<string, string | undefined>;
/**
 * Load .env files. Priority:
 *  1. 쉘 환경변수 (비어있지 않은 값에 한해)
 *  2. cwd()/.env
 *  3. stateDir/.env
 * .env에서 KEY= (빈 값)으로 설정하면 쉘 환경변수도 무효화됨
 */
export declare function loadEnv(baseEnv: EnvSnapshot, locations: {
    cwd: string;
    stateDir: string;
}): EnvSnapshot;
export interface ConfigSnapshotLoadInput {
    baseEnv: EnvSnapshot;
    cwd: string;
    paths: RuntimePaths;
}
export declare function loadConfigSnapshot(input: ConfigSnapshotLoadInput): KnowbeeConfig;
export { MIGRATION_ROLLBACK_RUNBOOK, buildBackupTargetInventory, buildMigrationPreflightReport, createBackupSnapshot, formatInventoryPathForDisplay, runRestoreRehearsal, verifyBackupSnapshotManifest, } from "./backup-rehearsal.js";
export type { KnowbeeConfig, WizbyConfig, HowieConfig, SecurityConfig, TelegramConfig, SlackConfig, DiscordConfig, GoogleChatConfig, IMessageConfig, KakaoTalkConfig, MqttConfig, WebuiConfig, OrchestrationConfig, McpConfig, McpServerConfig } from "./types.js";
export type { BackupInventoryTarget, BackupSnapshotFile, BackupSnapshotManifest, BackupSnapshotOptions, BackupRehearsalPaths, BackupTargetInventory, BackupTargetKind, BackupTargetReason, MigrationPreflightCheck, MigrationPreflightCheckName, MigrationPreflightOptions, MigrationPreflightReport, MigrationPreflightRisk, MigrationRollbackRunbook, RestoreRehearsalCheck, RestoreRehearsalCheckName, RestoreRehearsalOptions, RestoreRehearsalReport, SnapshotVerificationResult, } from "./backup-rehearsal.js";
//# sourceMappingURL=index.d.ts.map