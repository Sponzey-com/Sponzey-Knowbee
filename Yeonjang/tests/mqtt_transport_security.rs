use knowbee_yeonjang::mqtt_transport::{
    MqttTransportSecurity, MutualTlsBuildError, MutualTlsIdentity,
};
use rumqttc::{MqttOptions, TlsConfiguration, Transport};

const CERTIFICATE_PEM: &[u8] = b"-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n";
const PRIVATE_KEY_PEM: &[u8] = b"-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----\n";

#[test]
fn mutual_tls_identity_is_bounded_redacted_and_projects_rustls_transport() {
    assert_eq!(
        MutualTlsIdentity::new(
            Vec::new(),
            CERTIFICATE_PEM.to_vec(),
            PRIVATE_KEY_PEM.to_vec()
        ),
        Err(MutualTlsBuildError::MissingMaterial)
    );
    assert_eq!(
        MutualTlsIdentity::new(
            vec![b'x'; 1024 * 1024 + 1],
            CERTIFICATE_PEM.to_vec(),
            PRIVATE_KEY_PEM.to_vec(),
        ),
        Err(MutualTlsBuildError::MaterialTooLarge)
    );

    let identity = MutualTlsIdentity::new(
        CERTIFICATE_PEM.to_vec(),
        CERTIFICATE_PEM.to_vec(),
        PRIVATE_KEY_PEM.to_vec(),
    )
    .expect("typed mutual TLS identity");
    let debug = format!("{identity:?}");
    assert!(!debug.contains("BEGIN CERTIFICATE"));
    assert!(!debug.contains("BEGIN PRIVATE KEY"));

    let mut options = MqttOptions::new("tls-test", "broker.example.com", 8883);
    MqttTransportSecurity::MutualTls(identity)
        .apply("broker.example.com", &mut options)
        .expect("mutual TLS transport");
    assert!(matches!(
        options.transport(),
        Transport::Tls(TlsConfiguration::Simple {
            client_auth: Some(_),
            ..
        })
    ));
}

#[test]
fn plaintext_security_accepts_only_loopback_hosts() {
    let mut loopback = MqttOptions::new("loopback", "127.0.0.1", 1883);
    MqttTransportSecurity::LoopbackPlaintext
        .apply("127.0.0.1", &mut loopback)
        .expect("loopback plaintext");
    assert!(matches!(loopback.transport(), Transport::Tcp));

    let mut remote = MqttOptions::new("remote", "broker.example.com", 1883);
    assert!(
        MqttTransportSecurity::LoopbackPlaintext
            .apply("broker.example.com", &mut remote)
            .is_err()
    );
}
