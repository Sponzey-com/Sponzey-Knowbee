use knowbee_yeonjang::managed_shutdown::{ManagedShutdownSignal, managed_shutdown_signals_for};
use knowbee_yeonjang::platform_operation::TargetPlatform;

#[test]
fn windows_managed_runtime_accepts_interrupt_and_targeted_break() {
    assert_eq!(
        managed_shutdown_signals_for(TargetPlatform::Windows),
        &[
            ManagedShutdownSignal::Interrupt,
            ManagedShutdownSignal::Break,
        ]
    );
}

#[test]
fn unix_managed_runtime_keeps_the_single_interrupt_contract() {
    for platform in [TargetPlatform::Macos, TargetPlatform::Linux] {
        assert_eq!(
            managed_shutdown_signals_for(platform),
            &[ManagedShutdownSignal::Interrupt]
        );
    }
}

#[test]
fn non_executable_targets_do_not_advertise_a_managed_process_signal() {
    for platform in [
        TargetPlatform::Android,
        TargetPlatform::Ios,
        TargetPlatform::Unknown,
    ] {
        assert!(managed_shutdown_signals_for(platform).is_empty());
    }
}
