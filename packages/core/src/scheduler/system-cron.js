import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger, redactLogText } from "../logger/index.js";
import { getSchedule, updateSchedule } from "../db/index.js";
import { isValidCron } from "./cron.js";
const log = createLogger("scheduler:system");
const CRON_MARKER_PREFIX = "# knowbee-schedule:";
const WINDOWS_TASK_PREFIX = "KnowbeeSchedule-";
const NODE_SYSTEM_CRON_PROCESS = Object.freeze({
    platform: process.platform,
    execPath: process.execPath,
    exists: existsSync,
    spawn: (command, args, options) => {
        const result = spawnSync(command, args, options);
        return {
            ...(result.error ? { error: result.error } : {}),
            status: result.status,
            stdout: result.stdout ?? "",
            stderr: result.stderr ?? "",
        };
    },
});
function systemCronErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
function shellQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function resolveCliDistPath() {
    return fileURLToPath(new URL("../../../cli/dist/index.js", import.meta.url));
}
function supportsSystemCrontab(processAdapter) {
    if (!processAdapter.exists(resolveCliDistPath()))
        return false;
    if (processAdapter.platform === "win32")
        return false;
    const probe = processAdapter.spawn("crontab", ["-l"], { encoding: "utf-8" });
    if (probe.error)
        return false;
    return true;
}
function supportsWindowsTaskScheduler(processAdapter) {
    if (!processAdapter.exists(resolveCliDistPath()))
        return false;
    if (processAdapter.platform !== "win32")
        return false;
    const probe = processAdapter.spawn("schtasks", ["/Query"], { encoding: "utf-8" });
    if (probe.error)
        return false;
    return probe.status === 0;
}
function readCurrentCrontab(processAdapter) {
    const result = processAdapter.spawn("crontab", ["-l"], { encoding: "utf-8" });
    if (result.error) {
        throw result.error;
    }
    if (result.status === 0) {
        return result.stdout.split(/\r?\n/);
    }
    const message = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.toLowerCase();
    if (message.includes("no crontab")) {
        return [];
    }
    throw new Error((result.stderr || result.stdout || `crontab -l failed with status ${result.status}`).trim());
}
function writeCrontab(lines, processAdapter) {
    const content = `${lines.filter((line, index, arr) => !(line === "" && arr[index - 1] === "")).join("\n").trim()}\n`;
    const result = processAdapter.spawn("crontab", ["-"], {
        encoding: "utf-8",
        input: content,
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `crontab - failed with status ${result.status}`).trim());
    }
}
function stripManagedEntry(lines, scheduleId) {
    const marker = `${CRON_MARKER_PREFIX}${scheduleId}`;
    const next = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (line.trim() === marker) {
            index += 1;
            continue;
        }
        if (line.includes(`${CRON_MARKER_PREFIX}${scheduleId}`)) {
            continue;
        }
        next.push(line);
    }
    return next;
}
export function buildManagedSystemCronEntry(schedule, paths, processAdapter = NODE_SYSTEM_CRON_PROCESS) {
    const cliPath = resolveCliDistPath();
    const nodePath = processAdapter.execPath;
    const logsFile = join(paths.logsDir, "schedule-system-cron.log");
    const command = [
        `KNOWBEE_STATE_DIR=${shellQuote(paths.stateDir)}`,
        shellQuote(nodePath),
        shellQuote(cliPath),
        "schedule",
        "run",
        shellQuote(schedule.id),
        `>> ${shellQuote(logsFile)} 2>&1`,
    ].join(" ");
    return [
        `${CRON_MARKER_PREFIX}${schedule.id}`,
        `${schedule.cron_expression} ${command}`,
    ];
}
function toWindowsTaskName(scheduleId) {
    return `${WINDOWS_TASK_PREFIX}${scheduleId}`;
}
function buildWindowsTaskCommand(schedule, processAdapter) {
    const cliPath = resolveCliDistPath();
    return [
        processAdapter.execPath,
        cliPath,
        "schedule",
        "run",
        schedule.id,
    ].map((item) => `"${item.replace(/"/g, '""')}"`).join(" ");
}
function tryBuildWindowsTaskScheduleArgs(schedule, processAdapter) {
    const parts = schedule.cron_expression.trim().split(/\s+/);
    if (parts.length !== 5 || !isValidCron(schedule.cron_expression))
        return null;
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const taskName = toWindowsTaskName(schedule.id);
    const base = ["/Create", "/F", "/TN", taskName, "/TR", buildWindowsTaskCommand(schedule, processAdapter)];
    if (/^\*\/\d+$/.test(minute) && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
        return [...base, "/SC", "MINUTE", "/MO", minute.slice(2)];
    }
    if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
        const startTime = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
        return [...base, "/SC", "DAILY", "/ST", startTime];
    }
    return null;
}
function upsertWindowsScheduledTask(schedule, processAdapter) {
    if (!supportsWindowsTaskScheduler(processAdapter)) {
        return {
            driver: "internal",
            reason: "Windows 작업 스케줄러를 사용할 수 없어 내부 scheduler로 유지합니다.",
        };
    }
    const taskName = toWindowsTaskName(schedule.id);
    if (!schedule.enabled) {
        processAdapter.spawn("schtasks", ["/Delete", "/F", "/TN", taskName], { encoding: "utf-8" });
        return { driver: "system_schtasks" };
    }
    const args = tryBuildWindowsTaskScheduleArgs(schedule, processAdapter);
    if (!args) {
        return {
            driver: "internal",
            reason: "현재 cron 표현식을 Windows 작업 스케줄러로 변환할 수 없어 내부 scheduler로 유지합니다.",
        };
    }
    const result = processAdapter.spawn("schtasks", args, { encoding: "utf-8" });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `schtasks failed with status ${result.status}`).trim());
    }
    return { driver: "system_schtasks" };
}
export function reconcileSystemCronSchedule(schedule, paths, processAdapter = NODE_SYSTEM_CRON_PROCESS) {
    if (processAdapter.platform === "win32") {
        const result = upsertWindowsScheduledTask(schedule, processAdapter);
        if (result.driver === "internal") {
            try {
                removeManagedScheduleExecution(schedule.id, paths, processAdapter);
            }
            catch (error) {
                log.warn(`failed to clear stale windows task for schedule ${schedule.id}: ${systemCronErrorMessage(error)}`);
            }
        }
        return result;
    }
    if (!supportsSystemCrontab(processAdapter)) {
        try {
            removeSystemCronSchedule(schedule.id, processAdapter);
        }
        catch (error) {
            log.warn(`failed to clear stale system cron for schedule ${schedule.id}: ${systemCronErrorMessage(error)}`);
        }
        return {
            driver: "internal",
            reason: "system crontab을 사용할 수 없어 내부 scheduler로 유지합니다.",
        };
    }
    if (!schedule.enabled) {
        removeSystemCronSchedule(schedule.id, processAdapter);
        return { driver: "system_crontab" };
    }
    const existing = readCurrentCrontab(processAdapter);
    const withoutManagedEntry = stripManagedEntry(existing, schedule.id);
    mkdirSync(paths.logsDir, { recursive: true });
    const next = [...withoutManagedEntry, ...buildManagedSystemCronEntry(schedule, paths, processAdapter)];
    writeCrontab(next, processAdapter);
    return { driver: "system_crontab" };
}
export function removeSystemCronSchedule(scheduleId, processAdapter = NODE_SYSTEM_CRON_PROCESS) {
    if (!supportsSystemCrontab(processAdapter))
        return;
    const existing = readCurrentCrontab(processAdapter);
    const next = stripManagedEntry(existing, scheduleId);
    writeCrontab(next, processAdapter);
}
export function reconcileScheduleExecution(scheduleId, paths, processAdapter = NODE_SYSTEM_CRON_PROCESS) {
    const schedule = getSchedule(scheduleId);
    if (!schedule) {
        throw new Error(`Schedule ${scheduleId} not found`);
    }
    let result;
    try {
        result = reconcileSystemCronSchedule(schedule, paths, processAdapter);
    }
    catch (error) {
        log.warn(`failed to register system schedule ${scheduleId}: ${systemCronErrorMessage(error)}`);
        try {
            removeManagedScheduleExecution(scheduleId, paths, processAdapter);
        }
        catch {
            // ignore stale cleanup failure
        }
        result = {
            driver: "internal",
            reason: "시스템 스케줄러 등록에 실패해 내부 scheduler로 유지합니다.",
        };
    }
    if (schedule.execution_driver !== result.driver) {
        updateSchedule(scheduleId, { execution_driver: result.driver });
    }
    return result;
}
export function removeManagedScheduleExecution(scheduleId, _paths, processAdapter = NODE_SYSTEM_CRON_PROCESS) {
    if (processAdapter.platform === "win32") {
        if (!supportsWindowsTaskScheduler(processAdapter))
            return;
        processAdapter.spawn("schtasks", ["/Delete", "/F", "/TN", toWindowsTaskName(scheduleId)], { encoding: "utf-8" });
        return;
    }
    removeSystemCronSchedule(scheduleId, processAdapter);
}
//# sourceMappingURL=system-cron.js.map