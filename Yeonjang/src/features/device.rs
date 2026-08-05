use serde_json::{Value, json};

use crate::automation::AutomationCapabilities;
use crate::settings::{PathAccessSettings, PermissionSettings};

pub fn status(
    flags: &AutomationCapabilities,
    permissions: &PermissionSettings,
    path_access: &PathAccessSettings,
) -> Value {
    json!({
        "platform": flags.platform,
        "resources": {
            "camera": {
                "supported": flags.camera_management,
                "permissionEnabled": permissions.allow_camera_access,
            },
            "display": {
                "screenCaptureSupported": flags.screen_capture,
                "screenCapturePermissionEnabled": permissions.allow_screen_capture,
            },
            "input": {
                "mouseSupported": flags.mouse_control,
                "keyboardSupported": flags.keyboard_control,
                "mousePermissionEnabled": permissions.allow_mouse_control,
                "keyboardPermissionEnabled": permissions.allow_keyboard_control,
            },
            "storage": {
                "readConfigured": !path_access.allowed_read_paths.is_empty(),
                "writeConfigured": !path_access.allowed_write_paths.is_empty(),
                "deniedPathCount": path_access.denied_paths.len(),
                "hiddenFilesAllowed": path_access.allow_hidden_files,
                "symlinkFollowAllowed": path_access.follow_symlinks,
            },
            "process": {
                "readPermissionEnabled": permissions.allow_process_read,
                "controlPermissionEnabled": permissions.allow_process_control,
            },
            "browser": {
                "readPermissionEnabled": permissions.allow_browser_read,
                "controlPermissionEnabled": permissions.allow_browser_control,
            },
            "network": {
                "readPermissionEnabled": permissions.allow_network_read,
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automation::PlatformKind;

    #[test]
    fn device_status_returns_summary_without_paths_or_internal_ids() {
        let result = status(
            &AutomationCapabilities {
                platform: PlatformKind::Linux,
                camera_management: true,
                command_execution: true,
                application_launch: true,
                screen_capture: true,
                mouse_control: true,
                keyboard_control: true,
                system_control: true,
            },
            &PermissionSettings::default(),
            &PathAccessSettings::default(),
        );
        let serialized = result.to_string();

        assert_eq!(result["resources"]["camera"]["supported"], true);
        assert_eq!(result["resources"]["storage"]["readConfigured"], false);
        assert!(!serialized.contains("instance_id"));
        assert!(!serialized.contains("node_id"));
        assert!(!serialized.contains("allowed_read_paths"));
    }
}
