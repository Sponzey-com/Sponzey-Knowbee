use knowbee_yeonjang::authorization::AuthorizationClock;
use knowbee_yeonjang::authorization_bootstrap::{
    AuthorizationBootstrapError, AuthorizationBootstrapInput, SystemAuthorizationClock,
    build_managed_mqtt_admission, build_managed_mqtt_authorization, build_side_effect_admission,
};
use std::sync::Arc;

struct FixedClock;

impl AuthorizationClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_000
    }
}

#[test]
fn managed_mqtt_authorization_uses_the_knowbee_key_identity_and_node_audience() {
    let input = build_managed_mqtt_authorization("yeonjang-main", b"0123456789abcdef".to_vec())
        .expect("managed MQTT authorization");
    let debug = format!("{input:?}");

    assert!(debug.contains("knowbee-core"));
    assert!(debug.contains("mqtt-connection-password-v1"));
    assert!(debug.contains("yeonjang-main"));
    assert!(!debug.contains("0123456789abcdef"));
}

#[test]
fn managed_mqtt_admission_derives_a_full_length_key_from_an_existing_short_broker_secret() {
    build_managed_mqtt_admission("yeonjang-main", b"samjoko1".to_vec(), Arc::new(FixedClock))
        .expect("legacy broker credential is normalized only for execution authorization");
    assert!(matches!(
        build_managed_mqtt_admission("yeonjang-main", Vec::new(), Arc::new(FixedClock)),
        Err(AuthorizationBootstrapError::MissingSecret)
    ));
}

#[test]
fn typed_bootstrap_builds_only_from_complete_valid_input() {
    let input = AuthorizationBootstrapInput::new(
        "knowbee-core",
        "key-1",
        "yeonjang-instance-1",
        b"ephemeral-test-secret".to_vec(),
        64,
    )
    .expect("valid bootstrap input");
    assert!(!format!("{input:?}").contains("ephemeral-test-secret"));
    build_side_effect_admission(input, Arc::new(FixedClock)).expect("admission dependency");

    assert_eq!(
        AuthorizationBootstrapInput::new("knowbee-core", "key-1", "audience", Vec::new(), 64)
            .expect_err("missing secret"),
        AuthorizationBootstrapError::MissingSecret
    );
    assert_eq!(
        AuthorizationBootstrapInput::new(
            "knowbee-core",
            "key-1",
            "audience",
            b"short".to_vec(),
            64,
        )
        .expect_err("short secret"),
        AuthorizationBootstrapError::InvalidSecret
    );
    assert_eq!(
        AuthorizationBootstrapInput::new(
            "knowbee-core",
            "key-1",
            "audience",
            b"ephemeral-test-secret".to_vec(),
            0,
        )
        .expect_err("zero replay capacity"),
        AuthorizationBootstrapError::InvalidReplayCapacity
    );
    assert_eq!(
        AuthorizationBootstrapInput::new(
            "knowbee-core",
            "key-1",
            "audience",
            b"ephemeral-test-secret".to_vec(),
            usize::MAX,
        )
        .expect_err("unbounded replay capacity"),
        AuthorizationBootstrapError::InvalidReplayCapacity
    );
    assert!(SystemAuthorizationClock.now_ms() > 0);
}
