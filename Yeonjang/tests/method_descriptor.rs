use knowbee_yeonjang::method_descriptor::{
    MethodResource, PermissionKey, ResultSchema, RetrySafety, RiskLevel, SideEffectClass,
    TimeoutClass, all_method_names, method_descriptor,
};
use knowbee_yeonjang::params_schema::ParamsSchema;
use std::collections::HashSet;

#[test]
fn camera_capture_descriptor_carries_the_complete_side_effect_contract() {
    let descriptor = method_descriptor("camera.capture").expect("camera descriptor");

    assert_eq!(descriptor.risk, RiskLevel::Moderate);
    assert_eq!(descriptor.side_effect, SideEffectClass::ScreenRead);
    assert_eq!(descriptor.permission, Some(PermissionKey::CameraAccess));
    assert_eq!(descriptor.resource, MethodResource::Camera);
    assert!(descriptor.cancellable);
    assert!(descriptor.post_check_required);
    assert!(descriptor.requires_side_effect_binding());
    assert_eq!(descriptor.retry_safety, RetrySafety::ExactReceiptRequired);
}

#[test]
fn read_only_and_dangerous_methods_are_distinguished_without_string_heuristics() {
    let ping = method_descriptor("node.ping").expect("ping descriptor");
    assert_eq!(ping.risk, RiskLevel::Safe);
    assert_eq!(ping.side_effect, SideEffectClass::ReadLocal);
    assert!(!ping.requires_side_effect_binding());
    assert!(!ping.post_check_required);
    assert_eq!(ping.retry_safety, RetrySafety::SafeNewAttempt);

    let exec = method_descriptor("system.exec").expect("exec descriptor");
    assert_eq!(exec.risk, RiskLevel::Dangerous);
    assert_eq!(exec.side_effect, SideEffectClass::SystemControl);
    assert_eq!(exec.permission, Some(PermissionKey::ShellExec));
    assert_eq!(exec.resource, MethodResource::System);
    assert!(exec.requires_side_effect_binding());
}

#[test]
fn unknown_methods_have_no_descriptor_and_cannot_be_classified_as_safe() {
    assert!(method_descriptor("unknown.method").is_none());
}

#[test]
fn local_input_and_focus_side_effects_share_the_desktop_control_resource() {
    for method in [
        "mouse.move",
        "mouse.click",
        "mouse.action",
        "keyboard.type",
        "keyboard.action",
        "browser.focus",
    ] {
        assert_eq!(
            method_descriptor(method)
                .unwrap_or_else(|| panic!("{method} descriptor"))
                .resource,
            MethodResource::DesktopControl,
            "{method}"
        );
    }
}

#[test]
fn canonical_inventory_is_unique_and_every_method_has_a_complete_runtime_contract() {
    let methods = all_method_names();
    let unique = methods.iter().copied().collect::<HashSet<_>>();

    assert_eq!(
        unique.len(),
        methods.len(),
        "method inventory must be unique"
    );
    assert!(!methods.is_empty());
    for method in methods {
        let descriptor = method_descriptor(method)
            .unwrap_or_else(|| panic!("canonical method `{method}` has no descriptor"));
        assert!(
            descriptor.timeout != TimeoutClass::Unspecified,
            "`{method}` must declare a timeout class"
        );
        assert_ne!(
            descriptor.params_schema,
            ParamsSchema::Unspecified,
            "`{method}` must declare an input schema"
        );
        assert_ne!(
            descriptor.result_schema,
            ResultSchema::Unspecified,
            "`{method}` must declare an output schema"
        );
        if descriptor.requires_side_effect_binding() {
            assert!(
                descriptor.requires_approval,
                "`{method}` side effect must require approval"
            );
        }
    }
    assert!(
        method_descriptor("browser.active_tab_info")
            .expect("sensitive browser read descriptor")
            .requires_approval
    );
    assert!(
        !method_descriptor("browser.active_tab_info")
            .expect("known unavailable method")
            .executor_available
    );
    assert!(
        methods
            .iter()
            .filter_map(|method| method_descriptor(method))
            .filter(|descriptor| !descriptor.executor_available)
            .count()
            == 1,
        "every advertised method except the explicit unavailable contract needs an executor route"
    );
}
