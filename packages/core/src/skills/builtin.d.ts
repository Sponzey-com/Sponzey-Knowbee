export declare const YEONJANG_SKILL_ID = "skill:yeonjang";
export declare const WEB_RESEARCH_SKILL_ID = "skill:web-research";
export declare const WEB_RESEARCH_SKILL_TOOL_NAMES: readonly ["web_search", "web_fetch"];
export declare const YEONJANG_CAMERA_RUNTIME_TOOL_NAMES: readonly ["yeonjang_status", "yeonjang_camera_list", "yeonjang_camera_capture", "yeonjang_camera_permission_status"];
export declare const YEONJANG_SKILL_TOOL_NAMES: readonly ["yeonjang_status", "yeonjang_broadcast_run", "yeonjang_camera_list", "yeonjang_camera_capture", "yeonjang_camera_permission_status", "yeonjang_file_metadata", "yeonjang_file_list", "yeonjang_file_read", "yeonjang_file_search", "yeonjang_file_write", "yeonjang_file_patch", "yeonjang_file_delete", "yeonjang_disk_info", "yeonjang_disk_usage", "yeonjang_disk_exists", "yeonjang_process_list", "yeonjang_process_info", "yeonjang_browser_list", "yeonjang_browser_active_hint", "yeonjang_browser_open_url", "yeonjang_browser_focus", "yeonjang_clipboard_read", "yeonjang_clipboard_write", "yeonjang_network_status", "yeonjang_device_status", "shell_exec", "app_launch", "screen_capture", "screen_find_text", "mouse_move", "mouse_click", "mouse_action", "keyboard_type", "keyboard_shortcut", "keyboard_action"];
export interface RegisterBuiltinSkillsOptions {
    mainAgentId?: string;
    now?: number;
}
export declare function registerBuiltinSkills(options?: RegisterBuiltinSkillsOptions): void;
//# sourceMappingURL=builtin.d.ts.map