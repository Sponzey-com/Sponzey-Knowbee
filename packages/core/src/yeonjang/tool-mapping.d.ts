export type YeonjangToolRiskLevel = "safe" | "moderate" | "dangerous";
export interface YeonjangToolMapping {
    toolName: string;
    methodIds: string[];
    group: string;
    riskLevel: YeonjangToolRiskLevel;
    requiresApproval: boolean;
    targetKind: "yeonjang_remote";
    requiresTargetResolution: boolean;
    evidenceSourceKind: "yeonjang";
    permissionSetting?: string;
}
export declare const YEONJANG_TOOL_MAPPINGS: readonly [{
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_status";
    readonly methodIds: [];
    readonly group: "system";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_broadcast_run";
    readonly methodIds: [];
    readonly group: "system";
    readonly riskLevel: "dangerous";
    readonly requiresApproval: true;
}, {
    readonly permissionSetting: "allow_camera_access";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_camera_list";
    readonly methodIds: ["camera.list"];
    readonly group: "camera";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_camera_access";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_camera_capture";
    readonly methodIds: ["camera.capture"];
    readonly group: "camera";
    readonly riskLevel: "moderate";
    readonly requiresApproval: true;
}, {
    readonly permissionSetting: "allow_camera_access";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_camera_permission_status";
    readonly methodIds: ["camera.permission_status"];
    readonly group: "camera";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_file_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_file_metadata";
    readonly methodIds: ["file.metadata"];
    readonly group: "files";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_file_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_file_list";
    readonly methodIds: ["file.list"];
    readonly group: "files";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_file_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_file_read";
    readonly methodIds: ["file.read"];
    readonly group: "files";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_file_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_file_search";
    readonly methodIds: ["file.search"];
    readonly group: "files";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_file_write";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_file_write";
    readonly methodIds: ["file.write"];
    readonly group: "files";
    readonly riskLevel: "moderate";
    readonly requiresApproval: true;
}, {
    readonly permissionSetting: "allow_file_write";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_file_patch";
    readonly methodIds: ["file.patch"];
    readonly group: "files";
    readonly riskLevel: "moderate";
    readonly requiresApproval: true;
}, {
    readonly permissionSetting: "allow_file_delete";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_file_delete";
    readonly methodIds: ["file.delete"];
    readonly group: "files";
    readonly riskLevel: "dangerous";
    readonly requiresApproval: true;
}, {
    readonly permissionSetting: "allow_disk_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_disk_info";
    readonly methodIds: ["disk.info"];
    readonly group: "disk";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_disk_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_disk_usage";
    readonly methodIds: ["disk.usage"];
    readonly group: "disk";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_disk_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_disk_exists";
    readonly methodIds: ["disk.exists"];
    readonly group: "disk";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_process_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_process_list";
    readonly methodIds: ["process.list"];
    readonly group: "process";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_process_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_process_info";
    readonly methodIds: ["process.info"];
    readonly group: "process";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_browser_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_browser_list";
    readonly methodIds: ["browser.list"];
    readonly group: "browser";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_browser_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_browser_active_hint";
    readonly methodIds: ["browser.active_hint"];
    readonly group: "browser";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_browser_control";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_browser_open_url";
    readonly methodIds: ["browser.open_url"];
    readonly group: "browser";
    readonly riskLevel: "moderate";
    readonly requiresApproval: true;
}, {
    readonly permissionSetting: "allow_browser_control";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_browser_focus";
    readonly methodIds: ["browser.focus"];
    readonly group: "browser";
    readonly riskLevel: "moderate";
    readonly requiresApproval: true;
}, {
    readonly permissionSetting: "allow_clipboard_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_clipboard_read";
    readonly methodIds: ["clipboard.read"];
    readonly group: "clipboard";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_clipboard_write";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_clipboard_write";
    readonly methodIds: ["clipboard.write"];
    readonly group: "clipboard";
    readonly riskLevel: "moderate";
    readonly requiresApproval: true;
}, {
    readonly permissionSetting: "allow_network_read";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_network_status";
    readonly methodIds: ["network.status"];
    readonly group: "network";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}, {
    readonly permissionSetting: "allow_device_status";
    readonly targetKind: "yeonjang_remote";
    readonly requiresTargetResolution: true;
    readonly evidenceSourceKind: "yeonjang";
    readonly toolName: "yeonjang_device_status";
    readonly methodIds: ["device.status"];
    readonly group: "device";
    readonly riskLevel: "safe";
    readonly requiresApproval: false;
}];
export declare const YEONJANG_TOOL_NAMES: ("yeonjang_status" | "yeonjang_camera_capture" | "yeonjang_broadcast_run" | "yeonjang_camera_list" | "yeonjang_camera_permission_status" | "yeonjang_file_metadata" | "yeonjang_file_list" | "yeonjang_file_read" | "yeonjang_file_search" | "yeonjang_file_write" | "yeonjang_file_patch" | "yeonjang_file_delete" | "yeonjang_disk_info" | "yeonjang_disk_usage" | "yeonjang_disk_exists" | "yeonjang_process_list" | "yeonjang_process_info" | "yeonjang_browser_list" | "yeonjang_browser_active_hint" | "yeonjang_browser_open_url" | "yeonjang_browser_focus" | "yeonjang_clipboard_read" | "yeonjang_clipboard_write" | "yeonjang_network_status" | "yeonjang_device_status")[];
//# sourceMappingURL=tool-mapping.d.ts.map