//! Independent Mosquitto contract gate for production mTLS construction.
//!
//! The owning self script supplies ephemeral identities and ACLs; this test
//! proves exact QoS1 delivery and rejection boundaries without a Gateway.

use std::time::{Duration, Instant};

use knowbee_yeonjang::mqtt_transport::{MqttTransportSecurity, MutualTlsIdentity};
use knowbee_yeonjang::mqtt_v2_connection::{MqttV2ConnectionConfig, build_mqtt_v2_connection};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use rumqttc::{
    AsyncClient, Event, EventLoop, Incoming, MqttOptions, NetworkOptions, Outgoing, QoS,
    SubscribeReasonCode, TlsConfiguration, Transport,
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires scripts/self/run-yeonjang-independent-mqtt-gate.sh"]
async fn independent_mtls_broker_enforces_identity_hostname_and_exact_topic_acl() {
    let fixture = BrokerFixture::from_environment();
    let topics =
        MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("exact topics");

    let (yeonjang, mut yeonjang_events) = build_mqtt_v2_connection(
        &MqttV2ConnectionConfig::new(
            "localhost",
            fixture.port,
            "instance-a",
            "session-a",
            10,
            8,
            fixture.yeonjang_transport(),
        )
        .expect("Yeonjang mTLS config"),
    )
    .expect("Yeonjang connection pair");
    let (requester, mut requester_events) =
        requester_client(&fixture, "requester-exact", "localhost");

    requester
        .subscribe(topics.response(), QoS::AtLeastOnce)
        .await
        .expect("requester response subscription");
    expect_allowed_suback(&mut requester_events, "requester exact response").await;
    yeonjang
        .subscribe(topics.command(), QoS::AtLeastOnce)
        .await
        .expect("Yeonjang command subscription");
    expect_allowed_suback(&mut yeonjang_events, "Yeonjang exact command").await;

    requester
        .publish(
            topics.command(),
            QoS::AtLeastOnce,
            false,
            b"strict-command".as_slice(),
        )
        .await
        .expect("exact command publish");
    expect_outgoing_publish(&mut requester_events, "requester command publish").await;
    let command = expect_publish(&mut yeonjang_events, &topics.command()).await;
    assert_eq!(command, b"strict-command");
    yeonjang
        .publish(
            topics.response(),
            QoS::AtLeastOnce,
            false,
            b"strict-response".as_slice(),
        )
        .await
        .expect("exact response publish");
    expect_outgoing_publish(&mut yeonjang_events, "Yeonjang response publish").await;
    let response = expect_publish(&mut requester_events, &topics.response()).await;
    assert_eq!(response, b"strict-response");

    let cross_target_topic =
        "yeonjang/v2/instances/instance-b/sessions/session-a/requesters/requester-a/response";
    requester
        .subscribe(cross_target_topic, QoS::AtLeastOnce)
        .await
        .expect("cross-target subscription request");
    // Mosquitto may acknowledge a subscription while enforcing its read ACL
    // at delivery time, so non-delivery of a broker-accepted probe is the
    // portable authorization contract.
    expect_allowed_suback(&mut requester_events, "requester cross-target response").await;
    let (probe, mut probe_events) = probe_client(&fixture, "acl-probe", "localhost");
    probe
        .publish(
            cross_target_topic,
            QoS::AtLeastOnce,
            false,
            b"must-not-cross-target".as_slice(),
        )
        .await
        .expect("cross-target probe publish");
    expect_outgoing_publish(&mut probe_events, "cross-target probe publish").await;
    expect_publish_ack(&mut probe_events, "cross-target probe broker receipt").await;
    assert_no_publish(&mut requester_events, cross_target_topic).await;

    let (_untrusted, mut untrusted_events) = client_with_materials(
        &fixture,
        "untrusted-client",
        "localhost",
        &fixture.ca,
        &fixture.untrusted_certificate,
        &fixture.untrusted_key,
    );
    assert_tls_connection_rejected(&mut untrusted_events, "untrusted client rejection").await;

    let (_missing_identity, mut missing_identity_events) =
        client_without_certificate(&fixture, "missing-client-identity", "localhost");
    assert_tls_connection_rejected(
        &mut missing_identity_events,
        "missing client certificate rejection",
    )
    .await;

    let (_wrong_host, mut wrong_host_events) =
        requester_client(&fixture, "requester-wrong-host", "127.0.0.1");
    assert_tls_connection_rejected(&mut wrong_host_events, "server hostname rejection").await;

    probe.disconnect().await.expect("probe disconnect");
    expect_disconnect(&mut probe_events).await;
    requester.disconnect().await.expect("requester disconnect");
    expect_disconnect(&mut requester_events).await;
    yeonjang.disconnect().await.expect("Yeonjang disconnect");
    expect_disconnect(&mut yeonjang_events).await;
}

struct BrokerFixture {
    port: u16,
    ca: Vec<u8>,
    yeonjang_certificate: Vec<u8>,
    yeonjang_key: Vec<u8>,
    requester_certificate: Vec<u8>,
    requester_key: Vec<u8>,
    probe_certificate: Vec<u8>,
    probe_key: Vec<u8>,
    untrusted_certificate: Vec<u8>,
    untrusted_key: Vec<u8>,
}

impl BrokerFixture {
    fn from_environment() -> Self {
        Self {
            port: required_environment("YEONJANG_TEST_MQTT_PORT")
                .parse()
                .expect("broker port"),
            ca: read_fixture("YEONJANG_TEST_MQTT_CA"),
            yeonjang_certificate: read_fixture("YEONJANG_TEST_MQTT_YEONJANG_CERT"),
            yeonjang_key: read_fixture("YEONJANG_TEST_MQTT_YEONJANG_KEY"),
            requester_certificate: read_fixture("YEONJANG_TEST_MQTT_REQUESTER_CERT"),
            requester_key: read_fixture("YEONJANG_TEST_MQTT_REQUESTER_KEY"),
            probe_certificate: read_fixture("YEONJANG_TEST_MQTT_PROBE_CERT"),
            probe_key: read_fixture("YEONJANG_TEST_MQTT_PROBE_KEY"),
            untrusted_certificate: read_fixture("YEONJANG_TEST_MQTT_UNTRUSTED_CERT"),
            untrusted_key: read_fixture("YEONJANG_TEST_MQTT_UNTRUSTED_KEY"),
        }
    }

    fn yeonjang_transport(&self) -> MqttTransportSecurity {
        transport(
            self.ca.clone(),
            self.yeonjang_certificate.clone(),
            self.yeonjang_key.clone(),
        )
    }
}

fn transport(ca: Vec<u8>, certificate: Vec<u8>, key: Vec<u8>) -> MqttTransportSecurity {
    MqttTransportSecurity::MutualTls(
        MutualTlsIdentity::new(ca, certificate, key).expect("fixture mTLS identity"),
    )
}

fn requester_client(
    fixture: &BrokerFixture,
    client_id: &str,
    host: &str,
) -> (AsyncClient, EventLoop) {
    client_with_materials(
        fixture,
        client_id,
        host,
        &fixture.ca,
        &fixture.requester_certificate,
        &fixture.requester_key,
    )
}

fn probe_client(fixture: &BrokerFixture, client_id: &str, host: &str) -> (AsyncClient, EventLoop) {
    client_with_materials(
        fixture,
        client_id,
        host,
        &fixture.ca,
        &fixture.probe_certificate,
        &fixture.probe_key,
    )
}

fn client_with_materials(
    fixture: &BrokerFixture,
    client_id: &str,
    host: &str,
    ca: &[u8],
    certificate: &[u8],
    key: &[u8],
) -> (AsyncClient, EventLoop) {
    let mut options = MqttOptions::new(client_id, host, fixture.port);
    options.set_transport(Transport::Tls(TlsConfiguration::Simple {
        ca: ca.to_vec(),
        alpn: None,
        client_auth: Some((certificate.to_vec(), key.to_vec())),
    }));
    options.set_keep_alive(Duration::from_secs(10));
    client_with_network_timeout(options)
}

fn client_without_certificate(
    fixture: &BrokerFixture,
    client_id: &str,
    host: &str,
) -> (AsyncClient, EventLoop) {
    let mut options = MqttOptions::new(client_id, host, fixture.port);
    options.set_transport(Transport::Tls(TlsConfiguration::Simple {
        ca: fixture.ca.clone(),
        alpn: None,
        client_auth: None,
    }));
    options.set_keep_alive(Duration::from_secs(10));
    client_with_network_timeout(options)
}

fn client_with_network_timeout(options: MqttOptions) -> (AsyncClient, EventLoop) {
    let (client, mut events) = AsyncClient::new(options, 8);
    let mut network = NetworkOptions::new();
    network.set_connection_timeout(20);
    events.set_network_options(network);
    (client, events)
}

async fn expect_allowed_suback(events: &mut EventLoop, context: &str) {
    loop {
        if let Event::Incoming(Incoming::SubAck(ack)) = next_positive_event(events, context).await {
            assert!(
                ack.return_codes
                    .iter()
                    .all(|code| *code != SubscribeReasonCode::Failure),
                "{context} must be acknowledged"
            );
            return;
        }
    }
}

async fn expect_publish(events: &mut EventLoop, topic: &str) -> Vec<u8> {
    loop {
        if let Event::Incoming(Incoming::Publish(publish)) =
            next_positive_event(events, "expected publish").await
            && publish.topic == topic
        {
            return publish.payload.to_vec();
        }
    }
}

async fn expect_outgoing_publish(events: &mut EventLoop, context: &str) {
    loop {
        if matches!(
            next_positive_event(events, context).await,
            Event::Outgoing(Outgoing::Publish(_))
        ) {
            return;
        }
    }
}

async fn expect_publish_ack(events: &mut EventLoop, context: &str) {
    loop {
        if matches!(
            next_positive_event(events, context).await,
            Event::Incoming(Incoming::PubAck(_))
        ) {
            return;
        }
    }
}

async fn assert_no_publish(events: &mut EventLoop, forbidden_topic: &str) {
    let observation = tokio::time::timeout(Duration::from_millis(750), async {
        loop {
            if let Event::Incoming(Incoming::Publish(publish)) =
                events.poll().await.expect("cross-target observation")
                && publish.topic == forbidden_topic
            {
                panic!("broker delivered a cross-target message");
            }
        }
    })
    .await;
    assert!(observation.is_err(), "cross-target observation must expire");
}

async fn expect_disconnect(events: &mut EventLoop) {
    loop {
        if matches!(
            next_positive_event(events, "disconnect flush").await,
            Event::Outgoing(Outgoing::Disconnect)
        ) {
            return;
        }
    }
}

async fn next_positive_event(events: &mut EventLoop, context: &str) -> Event {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        assert!(
            !remaining.is_zero(),
            "positive broker event deadline: {context}"
        );
        let polled = match tokio::time::timeout(remaining, events.poll()).await {
            Ok(polled) => polled,
            Err(_) => panic!("positive broker event deadline: {context}"),
        };
        match polled {
            Ok(event) => return event,
            Err(rumqttc::ConnectionError::NetworkTimeout) if Instant::now() < deadline => {
                // Production reconnect owns this pre-effect transport
                // recovery. One connection timeout is not an application
                // terminal result.
            }
            Err(error) => panic!("positive broker event failed at {context}: {error:?}"),
        }
    }
}

async fn assert_tls_connection_rejected(events: &mut EventLoop, context: &str) {
    let observation = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            match events.poll().await {
                Ok(Event::Incoming(Incoming::ConnAck(_))) => return false,
                Ok(_) => {}
                Err(_) => return true,
            }
        }
    })
    .await;
    assert!(
        !matches!(observation, Ok(false)),
        "TLS-negative client received a successful MQTT connection: {context}"
    );
}

fn required_environment(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("missing independent broker fixture: {name}"))
}

fn read_fixture(name: &str) -> Vec<u8> {
    std::fs::read(required_environment(name))
        .unwrap_or_else(|_| panic!("unavailable independent broker fixture: {name}"))
}
