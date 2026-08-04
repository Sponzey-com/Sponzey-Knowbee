use std::time::Duration;

use knowbee_yeonjang::mqtt_transport::{MqttTransportSecurity, MutualTlsIdentity};
use knowbee_yeonjang::mqtt_v2_connection::{
    MqttV2BrokerCredentials, MqttV2ConnectionConfig, MqttV2ConnectionConfigError, MqttV2LastWill,
    build_mqtt_v2_connection,
};
use rumqttc::{QoS, TlsConfiguration, Transport};

const CERTIFICATE_PEM: &[u8] = b"-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n";
const PRIVATE_KEY_PEM: &[u8] = b"-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----\n";

#[test]
fn immutable_loopback_config_builds_stable_exact_v2_options_without_starting_runtime() {
    let config = MqttV2ConnectionConfig::new(
        "127.0.0.1",
        1883,
        "instance-a",
        "session-a",
        20,
        32,
        MqttTransportSecurity::LoopbackPlaintext,
    )
    .expect("config");
    let options = config.build_options().expect("options");
    let second = config.build_options().expect("same options");
    assert_eq!(options.client_id(), second.client_id());
    assert!(options.client_id().starts_with("knowbee-y2-"));
    assert_eq!(options.keep_alive(), Duration::from_secs(20));
    assert_eq!(options.request_channel_capacity(), 32);
    assert!(!options.clean_session());
    assert!(matches!(options.transport(), Transport::Tcp));

    let (_client, _event_loop) = build_mqtt_v2_connection(&config).expect("caller-owned pair");
}

#[test]
fn remote_plaintext_and_invalid_runtime_bounds_are_rejected_before_client_creation() {
    assert_eq!(
        MqttV2ConnectionConfig::new(
            "broker.example.com",
            1883,
            "instance-a",
            "session-a",
            20,
            32,
            MqttTransportSecurity::LoopbackPlaintext,
        ),
        Err(MqttV2ConnectionConfigError::TransportRejected)
    );
    for (keepalive, capacity) in [(0, 32), (20, 0), (301, 32), (20, 257)] {
        assert_eq!(
            MqttV2ConnectionConfig::new(
                "127.0.0.1",
                1883,
                "instance-a",
                "session-a",
                keepalive,
                capacity,
                MqttTransportSecurity::LoopbackPlaintext,
            ),
            Err(MqttV2ConnectionConfigError::InvalidRuntimeBounds)
        );
    }
}

#[test]
fn remote_mutual_tls_reuses_redacted_validated_transport_identity() {
    let identity = MutualTlsIdentity::new(
        CERTIFICATE_PEM.to_vec(),
        CERTIFICATE_PEM.to_vec(),
        PRIVATE_KEY_PEM.to_vec(),
    )
    .expect("identity");
    let config = MqttV2ConnectionConfig::new(
        "broker.example.com",
        8883,
        "instance-a",
        "session-a",
        20,
        32,
        MqttTransportSecurity::MutualTls(identity),
    )
    .expect("mTLS config");
    let debug = format!("{config:?}");
    assert!(!debug.contains("BEGIN CERTIFICATE"));
    assert!(!debug.contains("BEGIN PRIVATE KEY"));
    assert!(matches!(
        config.build_options().expect("options").transport(),
        Transport::Tls(TlsConfiguration::Simple {
            client_auth: Some(_),
            ..
        })
    ));
}

#[test]
fn broker_credentials_are_validated_applied_and_redacted_in_the_immutable_snapshot() {
    let credentials = MqttV2BrokerCredentials::new("broker-user", b"broker-secret-1".to_vec())
        .expect("credentials");
    assert!(!format!("{credentials:?}").contains("broker-secret-1"));
    let config = MqttV2ConnectionConfig::new(
        "127.0.0.1",
        1883,
        "instance-a",
        "session-a",
        20,
        32,
        MqttTransportSecurity::LoopbackPlaintext,
    )
    .expect("config")
    .with_credentials(credentials);
    let options = config.build_options().expect("options");
    assert_eq!(
        options.credentials(),
        Some(("broker-user".to_string(), "broker-secret-1".to_string()))
    );
    assert!(!format!("{config:?}").contains("broker-secret-1"));

    assert!(MqttV2BrokerCredentials::new("", b"broker-secret-1".to_vec()).is_err());
    assert!(MqttV2BrokerCredentials::new("broker-user", Vec::new()).is_err());
}

#[test]
fn exact_signed_offline_last_will_is_bound_before_connection_creation() {
    let will = MqttV2LastWill::new(
        "yeonjang/v2/instances/instance-a/sessions/session-a/status",
        br#"{"schema_id":"yeonjang.status.v2","signature":"redacted-fixture"}"#.to_vec(),
    )
    .expect("will");
    let config = MqttV2ConnectionConfig::new(
        "127.0.0.1",
        1883,
        "instance-a",
        "session-a",
        20,
        32,
        MqttTransportSecurity::LoopbackPlaintext,
    )
    .expect("config")
    .with_last_will(will);
    let options = config.build_options().expect("options");
    let actual = options.last_will().expect("last will");
    assert_eq!(
        actual.topic,
        "yeonjang/v2/instances/instance-a/sessions/session-a/status"
    );
    assert_eq!(actual.qos, QoS::AtLeastOnce);
    assert!(actual.retain);
    assert_eq!(
        actual.message.as_ref(),
        br#"{"schema_id":"yeonjang.status.v2","signature":"redacted-fixture"}"#
    );
    assert!(!format!("{config:?}").contains("redacted-fixture"));

    assert!(MqttV2LastWill::new("wrong/status", vec![1]).is_err());
    assert!(
        MqttV2LastWill::new(
            "yeonjang/v2/instances/instance-a/sessions/session-a/status",
            Vec::new()
        )
        .is_err()
    );
}
