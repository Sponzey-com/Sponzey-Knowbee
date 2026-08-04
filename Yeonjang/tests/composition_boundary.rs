#[test]
fn supported_request_and_transport_modules_do_not_select_a_concrete_platform_backend() {
    for (module, source) in [
        ("node", include_str!("../src/node.rs")),
        ("stdio", include_str!("../src/stdio.rs")),
        ("mqtt", include_str!("../src/mqtt.rs")),
    ] {
        assert!(
            !source.contains("current_backend()"),
            "{module} must receive backend behavior or an immutable capability snapshot from the composition root"
        );
    }
}

#[test]
fn supported_request_and_transport_modules_do_not_spawn_unowned_os_threads() {
    for (module, source) in [
        ("node", include_str!("../src/node.rs")),
        ("stdio", include_str!("../src/stdio.rs")),
        ("mqtt", include_str!("../src/mqtt.rs")),
    ] {
        assert!(
            !source.contains("thread::spawn"),
            "{module} must use the owned Tokio runtime and dispatcher"
        );
    }
}
