use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde_json::Value;
use sha2::{Digest, Sha256};

use knowbee_yeonjang::artifact_lifecycle::ArtifactBinding;
use knowbee_yeonjang::artifact_transfer::{
    ArtifactChunkAssembler, ArtifactChunkReceive, decode_artifact_chunk_frame,
};

type ReconnectRequestFactory = Arc<dyn Fn(usize, &str) -> Value + Send + Sync>;

/// The production pump subscribes command, control, admin, and artifact ACK
/// ingress before a broker may deliver work.
const PRODUCTION_V2_INGRESS_SUBSCRIPTIONS: usize = 4;
const CONTROLLED_CONNECT_BUDGET: Duration = Duration::from_secs(20);

struct ControlledBrokerOutputs {
    response_tx: Sender<Value>,
    client_id_tx: Sender<String>,
}

pub struct ControlledMqttBroker {
    port: u16,
    response_rx: Receiver<Value>,
    client_id_rx: Receiver<String>,
    stop_tx: Sender<()>,
    thread: Option<JoinHandle<Result<(), String>>>,
}

impl ControlledMqttBroker {
    pub fn start(
        request_topic: impl Into<String>,
        response_topic: impl Into<String>,
        request: Value,
    ) -> Result<Self, String> {
        Self::start_with_delivery(request_topic, response_topic, request, 1, 1, false, false)
    }

    pub fn start_redelivery(
        request_topic: impl Into<String>,
        response_topic: impl Into<String>,
        request: Value,
        delivery_count: usize,
    ) -> Result<Self, String> {
        Self::start_with_delivery(
            request_topic,
            response_topic,
            request,
            delivery_count,
            1,
            true,
            false,
        )
    }

    /// Sends a control message only after command and control subscriptions are
    /// acknowledged, preventing the harness from bypassing subscription order.
    pub fn start_control(
        control_topic: impl Into<String>,
        response_topic: impl Into<String>,
        request: Value,
    ) -> Result<Self, String> {
        Self::start_with_delivery(control_topic, response_topic, request, 1, 2, true, false)
    }

    pub fn start_control_redelivery(
        control_topic: impl Into<String>,
        response_topic: impl Into<String>,
        request: Value,
        delivery_count: usize,
    ) -> Result<Self, String> {
        Self::start_with_delivery(
            control_topic,
            response_topic,
            request,
            delivery_count,
            2,
            true,
            false,
        )
    }

    /// Sends one v2 command only after the production command, control, and
    /// artifact-ack subscriptions are all acknowledged. V2 terminal envelopes
    /// intentionally do not use the legacy `{ id, ok }` response shape.
    pub fn start_v2(
        command_topic: impl Into<String>,
        response_topic: impl Into<String>,
        command: Value,
    ) -> Result<Self, String> {
        Self::start_with_delivery(command_topic, response_topic, command, 1, 3, true, false)
    }

    /// Sends one command after the complete production ingress set is ready.
    pub fn start_production_v2(
        command_topic: impl Into<String>,
        response_topic: impl Into<String>,
        command: Value,
    ) -> Result<Self, String> {
        Self::start_with_delivery(
            command_topic,
            response_topic,
            command,
            1,
            PRODUCTION_V2_INGRESS_SUBSCRIPTIONS,
            true,
            false,
        )
    }

    /// Delivers the same production command twice before either response.
    ///
    /// This is the deterministic equivalent of concurrent QoS 1 redelivery:
    /// both publications cross ingress while one terminal claim is still
    /// active, and the broker requires two independently observable replies.
    pub fn start_production_burst_redelivery(
        command_topic: impl Into<String>,
        response_topic: impl Into<String>,
        command: Value,
    ) -> Result<Self, String> {
        Self::start_with_delivery(
            command_topic,
            response_topic,
            command,
            2,
            PRODUCTION_V2_INGRESS_SUBSCRIPTIONS,
            true,
            true,
        )
    }

    /// Sends an admin message only after command, control, and admin exact
    /// subscriptions have all been acknowledged.
    pub fn start_admin(
        admin_topic: impl Into<String>,
        response_topic: impl Into<String>,
        request: Value,
    ) -> Result<Self, String> {
        Self::start_with_delivery(admin_topic, response_topic, request, 1, 3, true, false)
    }

    /// Sends one admin command after the complete production ingress set is ready.
    pub fn start_production_admin(
        admin_topic: impl Into<String>,
        response_topic: impl Into<String>,
        request: Value,
    ) -> Result<Self, String> {
        Self::start_with_delivery(
            admin_topic,
            response_topic,
            request,
            1,
            PRODUCTION_V2_INGRESS_SUBSCRIPTIONS,
            true,
            false,
        )
    }

    /// Sends one admin request and observes both its direct response and the
    /// retained capability projections surrounding the policy transition.
    pub fn start_admin_with_capabilities(
        admin_topic: impl Into<String>,
        response_topic: impl Into<String>,
        capabilities_topic: impl Into<String>,
        request: Value,
    ) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let admin_topic = admin_topic.into();
        let response_topic = response_topic.into();
        let capabilities_topic = capabilities_topic.into();
        let request = serde_json::to_vec(&request).map_err(|error| error.to_string())?;
        let thread = thread::spawn(move || {
            run_admin_capabilities_broker(
                listener,
                admin_topic,
                response_topic,
                capabilities_topic,
                request,
                response_tx,
                client_id_tx,
                stop_rx,
            )
        });
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    /// Drops the first connection after receiving a terminal response without
    /// PUBACK, then redelivers the same strict v2 command on a fresh broker
    /// session. Observations include attempt, exact topic and JSON payload.
    pub fn start_v2_reconnect(
        command_topic: impl Into<String>,
        response_topic: impl Into<String>,
        status_topic: impl Into<String>,
        capabilities_topic: impl Into<String>,
        command: Value,
    ) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        let command_topic = command_topic.into();
        let response_topic = response_topic.into();
        let status_topic = status_topic.into();
        let capabilities_topic = capabilities_topic.into();
        let command = serde_json::to_vec(&command).map_err(|error| error.to_string())?;
        let thread = thread::spawn(move || {
            run_v2_reconnect_broker(
                listener,
                command_topic,
                response_topic,
                status_topic,
                capabilities_topic,
                command,
                ControlledBrokerOutputs {
                    response_tx,
                    client_id_tx,
                },
                ready_tx,
                stop_rx,
            )
        });
        ready_rx
            .recv_timeout(Duration::from_secs(2))
            .map_err(|error| format!("v2 reconnect broker did not become ready: {error}"))?;
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    /// Observes the CONNECT Last Will and retained online/offline projections
    /// without sending any command. Each observation is returned through
    /// `wait_for_response` in wire order.
    pub fn start_status(status_topic: impl Into<String>) -> Result<Self, String> {
        Self::start_status_topics(status_topic.into(), None)
    }

    pub fn start_status_and_capabilities(
        status_topic: impl Into<String>,
        capabilities_topic: impl Into<String>,
    ) -> Result<Self, String> {
        Self::start_status_topics(status_topic.into(), Some(capabilities_topic.into()))
    }

    fn start_status_topics(
        status_topic: String,
        capabilities_topic: Option<String>,
    ) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        let thread = thread::spawn(move || {
            run_status_broker(
                listener,
                status_topic,
                capabilities_topic,
                response_tx,
                client_id_tx,
                ready_tx,
                stop_rx,
            )
        });
        ready_rx
            .recv_timeout(Duration::from_secs(2))
            .map_err(|error| format!("status broker did not become ready: {error}"))?;
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    /// Sends a fetch after command/control/artifact-ack subscriptions, records
    /// one binary chunk, then sends the exact signed consumer acknowledgement.
    pub fn start_artifact(
        control_topic: impl Into<String>,
        chunk_topic: impl Into<String>,
        ack_topic: impl Into<String>,
        fetch: Value,
        ack: Value,
        expected_chunk_count: usize,
    ) -> Result<Self, String> {
        if expected_chunk_count == 0 || expected_chunk_count > u16::MAX as usize {
            return Err("artifact chunk count is invalid".to_string());
        }
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let control_topic = control_topic.into();
        let chunk_topic = chunk_topic.into();
        let ack_topic = ack_topic.into();
        let fetch = serde_json::to_vec(&fetch).map_err(|error| error.to_string())?;
        let ack = serde_json::to_vec(&ack).map_err(|error| error.to_string())?;
        let thread = thread::spawn(move || {
            run_artifact_broker(
                listener,
                control_topic,
                chunk_topic,
                ack_topic,
                fetch,
                ack,
                expected_chunk_count,
                response_tx,
                client_id_tx,
                stop_rx,
            )
        });
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    /// Sends a command first, waits for its terminal response, then performs
    /// fetch/chunk/ack on the descriptor bound by that same command.
    #[allow(clippy::too_many_arguments)]
    pub fn start_command_artifact(
        command_topic: impl Into<String>,
        response_topic: impl Into<String>,
        control_topic: impl Into<String>,
        chunk_topic: impl Into<String>,
        ack_topic: impl Into<String>,
        command: Value,
        fetch: Value,
        ack: Value,
        expected_chunk_count: usize,
    ) -> Result<Self, String> {
        if expected_chunk_count == 0 || expected_chunk_count > u16::MAX as usize {
            return Err("artifact chunk count is invalid".to_string());
        }
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let command_topic = command_topic.into();
        let response_topic = response_topic.into();
        let control_topic = control_topic.into();
        let chunk_topic = chunk_topic.into();
        let ack_topic = ack_topic.into();
        let command = serde_json::to_vec(&command).map_err(|error| error.to_string())?;
        let fetch = serde_json::to_vec(&fetch).map_err(|error| error.to_string())?;
        let ack = serde_json::to_vec(&ack).map_err(|error| error.to_string())?;
        let thread = thread::spawn(move || {
            run_command_artifact_broker(
                listener,
                command_topic,
                response_topic,
                control_topic,
                chunk_topic,
                ack_topic,
                command,
                fetch,
                ack,
                expected_chunk_count,
                response_tx,
                client_id_tx,
                stop_rx,
            )
        });
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    /// Drops the first session after validating one artifact chunk without
    /// PUBACK, then validates the complete reconnect stream before exact ACK.
    #[allow(clippy::too_many_arguments)]
    pub fn start_command_artifact_reconnect(
        command_topic: impl Into<String>,
        response_topic: impl Into<String>,
        control_topic: impl Into<String>,
        chunk_topic: impl Into<String>,
        ack_topic: impl Into<String>,
        command: Value,
        fetch: Value,
        ack: Value,
        binding: ArtifactBinding,
        transfer_id: impl Into<String>,
        expected_chunk_count: u32,
    ) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let command_topic = command_topic.into();
        let response_topic = response_topic.into();
        let control_topic = control_topic.into();
        let chunk_topic = chunk_topic.into();
        let ack_topic = ack_topic.into();
        let transfer_id = transfer_id.into();
        let command_payload = serde_json::to_vec(&command).map_err(|error| error.to_string())?;
        let fetch_payload = serde_json::to_vec(&fetch).map_err(|error| error.to_string())?;
        let ack_payload = serde_json::to_vec(&ack).map_err(|error| error.to_string())?;
        let thread = thread::spawn(move || {
            run_command_artifact_reconnect_broker(
                listener,
                command_topic,
                response_topic,
                control_topic,
                chunk_topic,
                ack_topic,
                command_payload,
                fetch_payload,
                ack_payload,
                binding,
                transfer_id,
                expected_chunk_count,
                ControlledBrokerOutputs {
                    response_tx,
                    client_id_tx,
                },
                stop_rx,
            )
        });
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    /// Sends an exact artifact cancel immediately after acknowledging the
    /// first observed chunk and reports any chunk that crosses that boundary.
    #[allow(clippy::too_many_arguments)]
    pub fn start_command_artifact_cancel(
        command_topic: impl Into<String>,
        response_topic: impl Into<String>,
        control_topic: impl Into<String>,
        chunk_topic: impl Into<String>,
        command: Value,
        fetch: Value,
        cancel: Value,
    ) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let command_topic = command_topic.into();
        let response_topic = response_topic.into();
        let control_topic = control_topic.into();
        let chunk_topic = chunk_topic.into();
        let command_payload = serde_json::to_vec(&command).map_err(|error| error.to_string())?;
        let fetch_payload = serde_json::to_vec(&fetch).map_err(|error| error.to_string())?;
        let cancel_payload = serde_json::to_vec(&cancel).map_err(|error| error.to_string())?;
        let thread = thread::spawn(move || {
            let result = run_command_artifact_cancel_broker(
                listener,
                command_topic,
                response_topic,
                control_topic,
                chunk_topic,
                command_payload,
                fetch_payload,
                cancel_payload,
                ControlledBrokerOutputs {
                    response_tx,
                    client_id_tx,
                },
                stop_rx,
            );
            if let Err(error) = &result {
                eprintln!("controlled artifact cancel broker failed: {error}");
            }
            result
        });
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    pub fn start_burst(
        request_topic: impl Into<String>,
        response_topic: impl Into<String>,
        requests: Vec<Value>,
    ) -> Result<Self, String> {
        if requests.is_empty() || requests.len() > u16::MAX as usize {
            return Err("controlled burst size is invalid".to_string());
        }
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let request_topic = request_topic.into();
        let response_topic = response_topic.into();
        let request_payloads = requests
            .into_iter()
            .map(|request| serde_json::to_vec(&request).map_err(|error| error.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        let thread = thread::spawn(move || {
            run_burst_broker(
                listener,
                request_topic,
                response_topic,
                request_payloads,
                response_tx,
                client_id_tx,
                stop_rx,
            )
        });
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    /// Publishes one command after both v2 subscriptions exist, then publishes its
    /// exact cancellation control only after the platform preflight has started.
    pub fn start_command_then_control(
        command_topic: impl Into<String>,
        control_topic: impl Into<String>,
        response_topic: impl Into<String>,
        command: Value,
        control: Value,
        command_started: Receiver<()>,
    ) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let command_topic = command_topic.into();
        let control_topic = control_topic.into();
        let response_topic = response_topic.into();
        let command_payload = serde_json::to_vec(&command).map_err(|error| error.to_string())?;
        let control_payload = serde_json::to_vec(&control).map_err(|error| error.to_string())?;
        let thread = thread::spawn(move || {
            run_command_then_control_broker(
                listener,
                command_topic,
                control_topic,
                response_topic,
                command_payload,
                control_payload,
                command_started,
                response_tx,
                client_id_tx,
                stop_rx,
            )
        });
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    /// Publishes two commands after command and control subscriptions exist,
    /// sends an exact control after the first effect starts, and publishes a
    /// follow-up only after three responses are observable.
    #[allow(clippy::too_many_arguments)]
    pub fn start_burst_then_control_and_follow_up(
        command_topic: impl Into<String>,
        control_topic: impl Into<String>,
        response_topic: impl Into<String>,
        commands: [Value; 2],
        control: Value,
        follow_up: Value,
        first_effect_started: Receiver<()>,
    ) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let command_topic = command_topic.into();
        let control_topic = control_topic.into();
        let response_topic = response_topic.into();
        let command_payloads = commands
            .into_iter()
            .map(|command| serde_json::to_vec(&command).map_err(|error| error.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        let control_payload = serde_json::to_vec(&control).map_err(|error| error.to_string())?;
        let follow_up_payload =
            serde_json::to_vec(&follow_up).map_err(|error| error.to_string())?;
        let thread = thread::spawn(move || {
            run_burst_then_control_and_follow_up_broker(
                listener,
                command_topic,
                control_topic,
                response_topic,
                command_payloads,
                control_payload,
                follow_up_payload,
                first_effect_started,
                response_tx,
                client_id_tx,
                stop_rx,
            )
        });
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    fn start_with_delivery(
        request_topic: impl Into<String>,
        response_topic: impl Into<String>,
        request: Value,
        delivery_count: usize,
        required_subscriptions: usize,
        accept_any_response: bool,
        burst_delivery: bool,
    ) -> Result<Self, String> {
        if delivery_count == 0 || delivery_count > u16::MAX as usize {
            return Err("controlled delivery count is invalid".to_string());
        }
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let request_topic = request_topic.into();
        let response_topic = response_topic.into();
        let request_payload = serde_json::to_vec(&request).map_err(|error| error.to_string())?;
        let thread = thread::spawn(move || {
            run_broker(
                listener,
                request_topic,
                response_topic,
                request_payload,
                delivery_count,
                required_subscriptions,
                accept_any_response,
                burst_delivery,
                response_tx,
                client_id_tx,
                stop_rx,
            )
        });
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    pub fn start_reconnect(
        request_topic: impl Into<String>,
        response_topic: impl Into<String>,
        status_topic: impl Into<String>,
        request_factory: ReconnectRequestFactory,
    ) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (response_tx, response_rx) = mpsc::channel();
        let (client_id_tx, client_id_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let request_topic = request_topic.into();
        let response_topic = response_topic.into();
        let status_topic = status_topic.into();
        let outputs = ControlledBrokerOutputs {
            response_tx,
            client_id_tx,
        };
        let thread = thread::spawn(move || {
            let result = run_reconnect_broker(
                listener,
                request_topic,
                response_topic,
                status_topic,
                request_factory,
                outputs,
                stop_rx,
            );
            if let Err(error) = &result {
                eprintln!("controlled reconnect broker failed: {error}");
            }
            result
        });
        Ok(Self {
            port,
            response_rx,
            client_id_rx,
            stop_tx,
            thread: Some(thread),
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn wait_for_response(&self, timeout: Duration) -> Result<Value, String> {
        self.response_rx
            .recv_timeout(timeout)
            .map_err(|error| error.to_string())
    }

    pub fn try_response(&self) -> Result<Option<Value>, String> {
        match self.response_rx.try_recv() {
            Ok(response) => Ok(Some(response)),
            Err(mpsc::TryRecvError::Empty) => Ok(None),
            Err(mpsc::TryRecvError::Disconnected) => {
                Err("controlled broker response channel closed".to_string())
            }
        }
    }

    pub fn wait_for_client_id(&self, timeout: Duration) -> Result<String, String> {
        self.client_id_rx
            .recv_timeout(timeout)
            .map_err(|error| error.to_string())
    }

    pub fn try_client_id(&self) -> Result<Option<String>, String> {
        match self.client_id_rx.try_recv() {
            Ok(client_id) => Ok(Some(client_id)),
            Err(mpsc::TryRecvError::Empty) => Ok(None),
            Err(mpsc::TryRecvError::Disconnected) => {
                Err("controlled broker client channel closed".to_string())
            }
        }
    }

    pub fn stop(mut self) -> Result<(), String> {
        let _ = self.stop_tx.send(());
        match self.thread.take() {
            Some(thread) => thread
                .join()
                .map_err(|_| "controlled broker thread panicked".to_string())?,
            None => Ok(()),
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_artifact_broker(
    listener: TcpListener,
    control_topic: String,
    chunk_topic: String,
    ack_topic: String,
    fetch_payload: Vec<u8>,
    ack_payload: Vec<u8>,
    expected_chunk_count: usize,
    response_tx: Sender<Value>,
    client_id_tx: Sender<String>,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let mut stream = accept_stream(&listener, &stop_rx, Duration::from_secs(3))?
        .ok_or_else(|| "artifact broker stopped before CONNECT".to_string())?;
    configure_stream(&stream)?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    client_id_tx
        .send(accept_connect(&mut stream, &stop_rx)?)
        .map_err(|error| error.to_string())?;
    let mut subscriptions = 0_u8;
    let mut fetch_sent = false;
    let mut ack_sent = false;
    let mut chunks_received = 0_usize;
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(&mut stream, &stop_rx)? else {
            return Err("artifact broker peer closed before completion".to_string());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(&mut stream, 0x40, &packet_id.to_be_bytes())?;
                }
                if publish.topic == chunk_topic && !ack_sent {
                    chunks_received += 1;
                    let magic = publish.body.get(..4).unwrap_or_default();
                    response_tx
                        .send(serde_json::json!({
                            "topic": publish.topic,
                            "payload_len": publish.body.len(),
                            "magic": String::from_utf8_lossy(magic)
                        }))
                        .map_err(|error| error.to_string())?;
                    if chunks_received == expected_chunk_count {
                        write_publish(&mut stream, &ack_topic, 2, &ack_payload)?;
                        ack_sent = true;
                    }
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    &mut stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscriptions = subscriptions.saturating_add(1);
                if subscriptions >= 3 && !fetch_sent {
                    write_publish(&mut stream, &control_topic, 1, &fetch_payload)?;
                    fetch_sent = true;
                }
            }
            12 => write_packet(&mut stream, 0xd0, &[])?,
            14 => return Ok(()),
            _ => {}
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_command_artifact_broker(
    listener: TcpListener,
    command_topic: String,
    response_topic: String,
    control_topic: String,
    chunk_topic: String,
    ack_topic: String,
    command_payload: Vec<u8>,
    fetch_payload: Vec<u8>,
    ack_payload: Vec<u8>,
    expected_chunk_count: usize,
    response_tx: Sender<Value>,
    client_id_tx: Sender<String>,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let (mut stream, connect) =
        accept_connect_packet(&listener, &stop_rx, CONTROLLED_CONNECT_BUDGET)?
            .ok_or_else(|| "command artifact broker stopped before CONNECT".to_string())?;
    if packet_type(connect.header) != 1 {
        return Err("command artifact broker first packet was not CONNECT".to_string());
    }
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    client_id_tx
        .send(parse_connect_client_id(&connect.payload)?)
        .map_err(|error| error.to_string())?;
    write_packet(&mut stream, 0x20, &[0x00, 0x00])?;
    let mut subscriptions = 0_u8;
    let mut command_sent = false;
    let mut fetch_sent = false;
    let mut ack_sent = false;
    let mut chunks_received = 0_usize;
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(&mut stream, &stop_rx)? else {
            if ack_sent && chunks_received == expected_chunk_count {
                // This fixture's terminal condition is exact artifact ACK
                // handoff. Pump shutdown is asserted by the owning test and
                // disconnect wire behavior has a dedicated status fixture.
                return Ok(());
            }
            return Err("command artifact broker peer closed before completion".to_string());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(&mut stream, 0x40, &packet_id.to_be_bytes())?;
                }
                if publish.topic == response_topic && !fetch_sent {
                    let response = serde_json::from_slice::<Value>(publish.body)
                        .map_err(|error| error.to_string())?;
                    response_tx
                        .send(response)
                        .map_err(|error| error.to_string())?;
                    write_publish(&mut stream, &control_topic, 2, &fetch_payload)?;
                    fetch_sent = true;
                } else if publish.topic == chunk_topic && !ack_sent {
                    chunks_received += 1;
                    let magic = publish.body.get(..4).unwrap_or_default();
                    response_tx
                        .send(serde_json::json!({
                            "topic": publish.topic,
                            "payload_len": publish.body.len(),
                            "magic": String::from_utf8_lossy(magic)
                        }))
                        .map_err(|error| error.to_string())?;
                    if chunks_received == expected_chunk_count {
                        write_publish(&mut stream, &ack_topic, 3, &ack_payload)?;
                        ack_sent = true;
                    }
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    &mut stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscriptions = subscriptions.saturating_add(1);
                if subscriptions >= 3 && !command_sent {
                    write_publish(&mut stream, &command_topic, 1, &command_payload)?;
                    command_sent = true;
                }
            }
            12 => write_packet(&mut stream, 0xd0, &[])?,
            14 => return Ok(()),
            _ => {}
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_command_artifact_reconnect_broker(
    listener: TcpListener,
    command_topic: String,
    response_topic: String,
    control_topic: String,
    chunk_topic: String,
    ack_topic: String,
    command_payload: Vec<u8>,
    fetch_payload: Vec<u8>,
    ack_payload: Vec<u8>,
    binding: ArtifactBinding,
    transfer_id: String,
    expected_chunk_count: u32,
    outputs: ControlledBrokerOutputs,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let full_digest = binding.full_digest().to_string();
    let mut assembler = ArtifactChunkAssembler::new(binding, transfer_id, expected_chunk_count)
        .map_err(|error| format!("artifact assembler: {error:?}"))?;
    let mut fetch_sent = false;
    for attempt in 0..2 {
        let mut stream = accept_stream(&listener, &stop_rx, CONTROLLED_CONNECT_BUDGET)?
            .ok_or_else(|| "artifact reconnect broker stopped before CONNECT".to_string())?;
        configure_stream(&stream)?;
        outputs
            .client_id_tx
            .send(accept_connect(&mut stream, &stop_rx)?)
            .map_err(|error| error.to_string())?;
        let complete = run_command_artifact_reconnect_session(
            &mut stream,
            attempt,
            &command_topic,
            &response_topic,
            &control_topic,
            &chunk_topic,
            &ack_topic,
            &command_payload,
            &fetch_payload,
            &ack_payload,
            &full_digest,
            &mut assembler,
            &mut fetch_sent,
            &outputs.response_tx,
            &stop_rx,
        )?;
        if complete {
            return wait_for_peer_stop(&mut stream, &stop_rx);
        }
    }
    Err("artifact reconnect ended without a complete consumer assembly".to_string())
}

#[allow(clippy::too_many_arguments)]
fn run_command_artifact_reconnect_session(
    stream: &mut TcpStream,
    attempt: usize,
    command_topic: &str,
    response_topic: &str,
    control_topic: &str,
    chunk_topic: &str,
    ack_topic: &str,
    command_payload: &[u8],
    fetch_payload: &[u8],
    ack_payload: &[u8],
    full_digest: &str,
    assembler: &mut ArtifactChunkAssembler,
    fetch_sent: &mut bool,
    response_tx: &Sender<Value>,
    stop_rx: &Receiver<()>,
) -> Result<bool, String> {
    let mut subscriptions = 0_u8;
    let mut command_sent = false;
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(true);
        }
        let Some(packet) = read_packet(stream, stop_rx)? else {
            return Ok(false);
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if publish.topic == response_topic && !*fetch_sent {
                    if let Some(packet_id) = publish.packet_id {
                        write_packet(stream, 0x40, &packet_id.to_be_bytes())?;
                    }
                    response_tx
                        .send(
                            serde_json::from_slice::<Value>(publish.body)
                                .map_err(|error| error.to_string())?,
                        )
                        .map_err(|error| error.to_string())?;
                    write_publish(stream, control_topic, 10, fetch_payload)?;
                    *fetch_sent = true;
                } else if publish.topic == chunk_topic {
                    let chunk = decode_artifact_chunk_frame(publish.body)
                        .map_err(|error| format!("artifact chunk: {error:?}"))?;
                    let index = chunk.header().index();
                    let receive = assembler.accept(chunk, 2_000);
                    let outcome = match &receive {
                        ArtifactChunkReceive::Accepted { .. } => "accepted",
                        ArtifactChunkReceive::Duplicate { .. } => "duplicate",
                        ArtifactChunkReceive::Complete { .. } => "complete",
                        ArtifactChunkReceive::Rejected { reason } => {
                            return Err(format!("artifact assembly rejected: {reason:?}"));
                        }
                    };
                    response_tx
                        .send(serde_json::json!({
                            "kind": "artifact_chunk",
                            "attempt": attempt,
                            "index": index,
                            "outcome": outcome
                        }))
                        .map_err(|error| error.to_string())?;
                    if attempt == 0 {
                        // Closing without PUBACK forces the exact QoS1 frame
                        // through the runtime's reconnect ownership path.
                        return Ok(false);
                    }
                    if let Some(packet_id) = publish.packet_id {
                        write_packet(stream, 0x40, &packet_id.to_be_bytes())?;
                    }
                    if let ArtifactChunkReceive::Complete { bytes } = receive {
                        response_tx
                            .send(serde_json::json!({
                                "kind": "artifact_complete",
                                "size": bytes.len(),
                                "full_digest": full_digest
                            }))
                            .map_err(|error| error.to_string())?;
                        write_publish(stream, ack_topic, 11, ack_payload)?;
                        return Ok(true);
                    }
                } else if let Some(packet_id) = publish.packet_id {
                    write_packet(stream, 0x40, &packet_id.to_be_bytes())?;
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscriptions = subscriptions.saturating_add(1);
                if attempt == 0 && subscriptions >= 3 && !command_sent {
                    write_publish(stream, command_topic, 1, command_payload)?;
                    command_sent = true;
                }
            }
            12 => write_packet(stream, 0xd0, &[])?,
            14 => return Ok(true),
            _ => {}
        }
    }
}

fn wait_for_peer_stop(stream: &mut TcpStream, stop_rx: &Receiver<()>) -> Result<(), String> {
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(stream, stop_rx)? else {
            return Ok(());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(stream, 0x40, &packet_id.to_be_bytes())?;
                }
            }
            12 => write_packet(stream, 0xd0, &[])?,
            14 => return Ok(()),
            _ => {}
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_command_artifact_cancel_broker(
    listener: TcpListener,
    command_topic: String,
    response_topic: String,
    control_topic: String,
    chunk_topic: String,
    command_payload: Vec<u8>,
    fetch_payload: Vec<u8>,
    cancel_payload: Vec<u8>,
    outputs: ControlledBrokerOutputs,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let mut stream = accept_stream(&listener, &stop_rx, CONTROLLED_CONNECT_BUDGET)?
        .ok_or_else(|| "artifact cancel broker stopped before CONNECT".to_string())?;
    configure_stream(&stream)?;
    outputs
        .client_id_tx
        .send(accept_connect(&mut stream, &stop_rx)?)
        .map_err(|error| error.to_string())?;
    let mut subscriptions = 0_u8;
    let mut command_sent = false;
    let mut fetch_sent = false;
    let mut cancel_sent = false;
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(&mut stream, &stop_rx)? else {
            return Ok(());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(&mut stream, 0x40, &packet_id.to_be_bytes())?;
                }
                if publish.topic == response_topic {
                    let response = serde_json::from_slice::<Value>(publish.body)
                        .map_err(|error| error.to_string())?;
                    outputs
                        .response_tx
                        .send(response)
                        .map_err(|error| error.to_string())?;
                    if !fetch_sent {
                        write_publish(&mut stream, &control_topic, 10, &fetch_payload)?;
                        fetch_sent = true;
                    }
                } else if publish.topic == chunk_topic {
                    let chunk = decode_artifact_chunk_frame(publish.body).map_err(|error| {
                        let header_length = publish
                            .body
                            .get(4..8)
                            .and_then(|bytes| bytes.try_into().ok())
                            .map(u32::from_be_bytes)
                            .unwrap_or_default() as usize;
                        let payload_offset = 8_usize.saturating_add(header_length);
                        let header = publish
                            .body
                            .get(8..payload_offset)
                            .and_then(|bytes| serde_json::from_slice::<Value>(bytes).ok());
                        let payload = publish.body.get(payload_offset..).unwrap_or_default();
                        let unexpected = payload.iter().filter(|byte| **byte != 11).count();
                        format!(
                            "artifact cancel chunk: {error:?}; index={:?}; offset={:?}; declared_digest={:?}; actual_digest=sha256:{:x}; payload_len={}; first={:?}; last={:?}; non_11={unexpected}",
                            header.as_ref().and_then(|value| value["index"].as_u64()),
                            header.as_ref().and_then(|value| value["offset"].as_u64()),
                            header.as_ref().and_then(|value| value["payload_digest"].as_str()),
                            Sha256::digest(payload),
                            payload.len(),
                            payload.first(),
                            payload.last()
                        )
                    })?;
                    outputs
                        .response_tx
                        .send(serde_json::json!({
                            "kind": "artifact_chunk",
                            "index": chunk.header().index()
                        }))
                        .map_err(|error| error.to_string())?;
                    if !cancel_sent {
                        write_publish(&mut stream, &control_topic, 11, &cancel_payload)?;
                        cancel_sent = true;
                    }
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    &mut stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscriptions = subscriptions.saturating_add(1);
                if subscriptions >= 3 && !command_sent {
                    write_publish(&mut stream, &command_topic, 1, &command_payload)?;
                    command_sent = true;
                }
            }
            12 => write_packet(&mut stream, 0xd0, &[])?,
            14 => return Ok(()),
            _ => {}
        }
    }
}

struct WirePacket {
    header: u8,
    payload: Vec<u8>,
}

#[allow(clippy::too_many_arguments)]
fn run_broker(
    listener: TcpListener,
    request_topic: String,
    response_topic: String,
    request_payload: Vec<u8>,
    delivery_count: usize,
    required_subscriptions: usize,
    accept_any_response: bool,
    burst_delivery: bool,
    response_tx: Sender<Value>,
    client_id_tx: Sender<String>,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    // Cold macOS test binaries can delay the independently owned Tokio client
    // thread while executable policy inspection completes. This fixture
    // readiness budget is intentionally below the 30-second acceptance budget
    // and does not change production reconnect behavior.
    let Some((mut stream, connect)) =
        accept_connect_packet(&listener, &stop_rx, CONTROLLED_CONNECT_BUDGET)?
    else {
        return Ok(());
    };
    if packet_type(connect.header) != 1 {
        return Err("first MQTT packet was not CONNECT".to_string());
    }
    client_id_tx
        .send(parse_connect_client_id(&connect.payload)?)
        .map_err(|error| error.to_string())?;
    write_packet(&mut stream, 0x20, &[0x00, 0x00])?;

    let mut requests_sent = 0usize;
    let mut responses_received = 0usize;
    let mut subscriptions_received = 0usize;
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(&mut stream, &stop_rx)? else {
            return Ok(());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(&mut stream, 0x40, &packet_id.to_be_bytes())?;
                }
                if publish.topic == response_topic {
                    let response = serde_json::from_slice::<Value>(publish.body)
                        .map_err(|error| error.to_string())?;
                    let accepted = accept_any_response
                        || (response.get("id").and_then(Value::as_str).is_some()
                            && response.get("ok").and_then(Value::as_bool).is_some());
                    if accepted {
                        let _ = response_tx.send(response);
                        responses_received += 1;
                        if responses_received < delivery_count && requests_sent < delivery_count {
                            let packet_id = u16::try_from(requests_sent + 1)
                                .map_err(|_| "controlled packet ID overflow".to_string())?;
                            write_publish(
                                &mut stream,
                                &request_topic,
                                packet_id,
                                request_payload.as_slice(),
                            )?;
                            requests_sent += 1;
                        }
                    }
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    &mut stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscriptions_received += 1;
                if subscriptions_received >= required_subscriptions && requests_sent == 0 {
                    let initial_deliveries = if burst_delivery { delivery_count } else { 1 };
                    for sequence in 1..=initial_deliveries {
                        let packet_id = u16::try_from(sequence)
                            .map_err(|_| "controlled packet ID overflow".to_string())?;
                        write_publish(
                            &mut stream,
                            &request_topic,
                            packet_id,
                            request_payload.as_slice(),
                        )?;
                    }
                    requests_sent = initial_deliveries;
                }
            }
            12 => write_packet(&mut stream, 0xd0, &[])?,
            14 => return Ok(()),
            _ => {}
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_admin_capabilities_broker(
    listener: TcpListener,
    admin_topic: String,
    response_topic: String,
    capabilities_topic: String,
    request_payload: Vec<u8>,
    response_tx: Sender<Value>,
    client_id_tx: Sender<String>,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let (mut stream, connect) =
        accept_connect_packet(&listener, &stop_rx, CONTROLLED_CONNECT_BUDGET)?
            .ok_or_else(|| "admin capabilities broker stopped before CONNECT".to_string())?;
    if packet_type(connect.header) != 1 {
        return Err("admin capabilities first MQTT packet was not CONNECT".to_string());
    }
    client_id_tx
        .send(parse_connect_client_id(&connect.payload)?)
        .map_err(|error| error.to_string())?;
    write_packet(&mut stream, 0x20, &[0x00, 0x00])?;
    let mut subscriptions_received = 0_usize;
    let mut request_sent = false;
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(&mut stream, &stop_rx)? else {
            return Ok(());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(&mut stream, 0x40, &packet_id.to_be_bytes())?;
                }
                if publish.topic == response_topic || publish.topic == capabilities_topic {
                    response_tx
                        .send(
                            serde_json::from_slice::<Value>(publish.body)
                                .map_err(|error| error.to_string())?,
                        )
                        .map_err(|error| error.to_string())?;
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    &mut stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscriptions_received += 1;
                if subscriptions_received >= PRODUCTION_V2_INGRESS_SUBSCRIPTIONS && !request_sent {
                    write_publish(&mut stream, &admin_topic, 1, &request_payload)?;
                    request_sent = true;
                }
            }
            12 => write_packet(&mut stream, 0xd0, &[])?,
            14 => return Ok(()),
            _ => {}
        }
    }
}

fn run_status_broker(
    listener: TcpListener,
    status_topic: String,
    capabilities_topic: Option<String>,
    response_tx: Sender<Value>,
    client_id_tx: Sender<String>,
    ready_tx: Sender<()>,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    ready_tx
        .send(())
        .map_err(|error| format!("status broker readiness failed: {error}"))?;
    let (mut stream, connect) =
        accept_connect_packet(&listener, &stop_rx, CONTROLLED_CONNECT_BUDGET)?
            .ok_or_else(|| "status broker stopped before CONNECT".to_string())?;
    if packet_type(connect.header) != 1 {
        return Err("status broker first packet was not CONNECT".to_string());
    }
    let parsed = parse_connect_with_will(&connect.payload)?;
    if parsed.will_topic != status_topic || !parsed.will_qos_one || !parsed.will_retained {
        return Err("status CONNECT Last Will binding mismatch".to_string());
    }
    // Complete the MQTT handshake before notifying the observation side. Test
    // consumers must never sit between protocol progress and CONNACK.
    write_packet(&mut stream, 0x20, &[0x00, 0x00])?;
    client_id_tx
        .send(parsed.client_id)
        .map_err(|error| error.to_string())?;
    response_tx
        .send(serde_json::json!({
            "kind": "will",
            "topic": parsed.will_topic,
            "retained": parsed.will_retained,
            "payload": serde_json::from_slice::<Value>(&parsed.will_payload)
                .map_err(|error| error.to_string())?
        }))
        .map_err(|error| error.to_string())?;

    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(&mut stream, &stop_rx)? else {
            return Ok(());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(&mut stream, 0x40, &packet_id.to_be_bytes())?;
                }
                if publish.topic == status_topic
                    || capabilities_topic.as_deref() == Some(publish.topic.as_str())
                {
                    response_tx
                        .send(serde_json::json!({
                            "kind": "publish",
                            "topic": publish.topic,
                            "retained": packet.header & 0x01 != 0,
                            "payload": serde_json::from_slice::<Value>(publish.body)
                                .map_err(|error| error.to_string())?
                        }))
                        .map_err(|error| error.to_string())?;
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    &mut stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
            }
            12 => write_packet(&mut stream, 0xd0, &[])?,
            14 => return Ok(()),
            _ => {}
        }
    }
}

fn run_burst_broker(
    listener: TcpListener,
    request_topic: String,
    response_topic: String,
    request_payloads: Vec<Vec<u8>>,
    response_tx: Sender<Value>,
    client_id_tx: Sender<String>,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let mut stream = accept_stream(&listener, &stop_rx, Duration::from_secs(3))?
        .ok_or_else(|| "controlled burst broker stopped before CONNECT".to_string())?;
    configure_stream(&stream)?;
    client_id_tx
        .send(accept_connect(&mut stream, &stop_rx)?)
        .map_err(|error| error.to_string())?;
    let mut subscription_count = 0_u8;
    let mut burst_sent = false;
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(&mut stream, &stop_rx)? else {
            return Ok(());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(&mut stream, 0x40, &packet_id.to_be_bytes())?;
                }
                if publish.topic == response_topic {
                    let response = serde_json::from_slice::<Value>(publish.body)
                        .map_err(|error| error.to_string())?;
                    let _ = response_tx.send(response);
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    &mut stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscription_count = subscription_count.saturating_add(1);
                if subscription_count >= 2 && !burst_sent {
                    for (index, payload) in request_payloads.iter().enumerate() {
                        let packet_id = u16::try_from(index + 1)
                            .map_err(|_| "controlled packet ID overflow".to_string())?;
                        write_publish(&mut stream, &request_topic, packet_id, payload)?;
                    }
                    burst_sent = true;
                }
            }
            12 => write_packet(&mut stream, 0xd0, &[])?,
            14 => return Ok(()),
            _ => {}
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_command_then_control_broker(
    listener: TcpListener,
    command_topic: String,
    control_topic: String,
    response_topic: String,
    command_payload: Vec<u8>,
    control_payload: Vec<u8>,
    command_started: Receiver<()>,
    response_tx: Sender<Value>,
    client_id_tx: Sender<String>,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let mut stream = accept_stream(&listener, &stop_rx, Duration::from_secs(3))?
        .ok_or_else(|| "controlled cancel broker stopped before CONNECT".to_string())?;
    configure_stream(&stream)?;
    client_id_tx
        .send(accept_connect(&mut stream, &stop_rx)?)
        .map_err(|error| error.to_string())?;

    let mut subscription_count = 0_u8;
    let mut command_sent = false;
    let mut control_sent = false;
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(&mut stream, &stop_rx)? else {
            return Ok(());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(&mut stream, 0x40, &packet_id.to_be_bytes())?;
                }
                if publish.topic == response_topic {
                    let response = serde_json::from_slice::<Value>(publish.body)
                        .map_err(|error| error.to_string())?;
                    let _ = response_tx.send(response);
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    &mut stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscription_count = subscription_count.saturating_add(1);
                if subscription_count >= 2 && !command_sent {
                    write_publish(&mut stream, &command_topic, 1, &command_payload)?;
                    command_sent = true;
                    command_started
                        .recv_timeout(Duration::from_secs(3))
                        .map_err(|error| format!("command preflight did not start: {error}"))?;
                    write_publish(&mut stream, &control_topic, 2, &control_payload)?;
                    control_sent = true;
                }
            }
            12 => write_packet(&mut stream, 0xd0, &[])?,
            14 => return Ok(()),
            _ => {}
        }
        debug_assert!(!control_sent || command_sent);
    }
}

#[allow(clippy::too_many_arguments)]
fn run_burst_then_control_and_follow_up_broker(
    listener: TcpListener,
    command_topic: String,
    control_topic: String,
    response_topic: String,
    command_payloads: Vec<Vec<u8>>,
    control_payload: Vec<u8>,
    follow_up_payload: Vec<u8>,
    first_effect_started: Receiver<()>,
    response_tx: Sender<Value>,
    client_id_tx: Sender<String>,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let mut stream = accept_stream(&listener, &stop_rx, Duration::from_secs(3))?
        .ok_or_else(|| "controlled waiter broker stopped before CONNECT".to_string())?;
    configure_stream(&stream)?;
    client_id_tx
        .send(accept_connect(&mut stream, &stop_rx)?)
        .map_err(|error| error.to_string())?;

    let mut subscription_count = 0_usize;
    let mut initial_sent = false;
    let mut response_count = 0_usize;
    let mut follow_up_sent = false;
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(&mut stream, &stop_rx)? else {
            return Ok(());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(&mut stream, 0x40, &packet_id.to_be_bytes())?;
                }
                if publish.topic == response_topic {
                    let response = serde_json::from_slice::<Value>(publish.body)
                        .map_err(|error| error.to_string())?;
                    response_count = response_count.saturating_add(1);
                    let _ = response_tx.send(response);
                    if response_count >= 3 && !follow_up_sent {
                        write_publish(&mut stream, &command_topic, 4, &follow_up_payload)?;
                        follow_up_sent = true;
                    }
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    &mut stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscription_count = subscription_count.saturating_add(1);
                if subscription_count >= 2 && !initial_sent {
                    for (index, payload) in command_payloads.iter().enumerate() {
                        let packet_id = u16::try_from(index + 1)
                            .map_err(|_| "controlled packet ID overflow".to_string())?;
                        write_publish(&mut stream, &command_topic, packet_id, payload)?;
                    }
                    initial_sent = true;
                    first_effect_started
                        .recv_timeout(Duration::from_secs(3))
                        .map_err(|error| format!("first camera effect did not start: {error}"))?;
                    write_publish(&mut stream, &control_topic, 3, &control_payload)?;
                }
            }
            12 => write_packet(&mut stream, 0xd0, &[])?,
            14 => return Ok(()),
            _ => {}
        }
    }
}

fn run_reconnect_broker(
    listener: TcpListener,
    request_topic: String,
    response_topic: String,
    status_topic: String,
    request_factory: ReconnectRequestFactory,
    outputs: ControlledBrokerOutputs,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    for attempt in 0..2 {
        let (mut stream, connect) =
            accept_connect_packet(&listener, &stop_rx, CONTROLLED_CONNECT_BUDGET)?
                .ok_or_else(|| "controlled reconnect broker stopped before CONNECT".to_string())?;
        if packet_type(connect.header) != 1 {
            return Err("controlled reconnect first packet was not CONNECT".to_string());
        }
        let client_id = parse_connect_client_id(&connect.payload)?;
        write_packet(&mut stream, 0x20, &[0x00, 0x00])?;
        outputs
            .client_id_tx
            .send(client_id)
            .map_err(|error| error.to_string())?;
        run_reconnect_session(
            &mut stream,
            attempt,
            &request_topic,
            &response_topic,
            &status_topic,
            request_factory.as_ref(),
            &outputs.response_tx,
            &stop_rx,
        )?;
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn run_v2_reconnect_broker(
    listener: TcpListener,
    command_topic: String,
    response_topic: String,
    status_topic: String,
    capabilities_topic: String,
    command_payload: Vec<u8>,
    outputs: ControlledBrokerOutputs,
    ready_tx: Sender<()>,
    stop_rx: Receiver<()>,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    ready_tx
        .send(())
        .map_err(|error| format!("v2 reconnect broker readiness failed: {error}"))?;
    for attempt in 0..2 {
        let (mut stream, connect) =
            accept_connect_packet(&listener, &stop_rx, CONTROLLED_CONNECT_BUDGET)?
                .ok_or_else(|| "v2 reconnect broker stopped before CONNECT".to_string())?;
        if packet_type(connect.header) != 1 {
            return Err("v2 reconnect first packet was not CONNECT".to_string());
        }
        let parsed = parse_connect_with_will(&connect.payload)?;
        if parsed.will_topic != status_topic || !parsed.will_qos_one || !parsed.will_retained {
            return Err("v2 reconnect Last Will binding mismatch".to_string());
        }
        outputs
            .client_id_tx
            .send(parsed.client_id)
            .map_err(|error| error.to_string())?;
        write_packet(&mut stream, 0x20, &[0x00, 0x00])?;
        run_v2_reconnect_session(
            &mut stream,
            attempt,
            &command_topic,
            &response_topic,
            &status_topic,
            &capabilities_topic,
            &command_payload,
            &outputs.response_tx,
            &stop_rx,
        )?;
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn run_v2_reconnect_session(
    stream: &mut TcpStream,
    attempt: usize,
    command_topic: &str,
    response_topic: &str,
    status_topic: &str,
    capabilities_topic: &str,
    command_payload: &[u8],
    response_tx: &Sender<Value>,
    stop_rx: &Receiver<()>,
) -> Result<(), String> {
    let mut subscriptions = 0_usize;
    let mut command_sent = false;
    loop {
        if stop_rx.try_recv().is_ok() {
            return Ok(());
        }
        let Some(packet) = read_packet(stream, stop_rx)? else {
            return if attempt == 0 {
                Ok(())
            } else {
                Err("second v2 reconnect session closed early".to_string())
            };
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                let observed = publish.topic == response_topic
                    || publish.topic == status_topic
                    || publish.topic == capabilities_topic;
                if observed {
                    response_tx
                        .send(serde_json::json!({
                            "kind": "publish",
                            "attempt": attempt,
                            "topic": publish.topic,
                            "payload": serde_json::from_slice::<Value>(publish.body)
                                .map_err(|error| error.to_string())?
                        }))
                        .map_err(|error| error.to_string())?;
                }
                if publish.topic == response_topic && attempt == 0 {
                    // Close without PUBACK. The second connection must recover
                    // the QoS 1 publication and command redelivery.
                    return Ok(());
                }
                if let Some(packet_id) = publish.packet_id {
                    write_packet(stream, 0x40, &packet_id.to_be_bytes())?;
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscriptions += 1;
                if subscriptions >= PRODUCTION_V2_INGRESS_SUBSCRIPTIONS && !command_sent {
                    write_publish(stream, command_topic, attempt as u16 + 1, command_payload)?;
                    command_sent = true;
                }
            }
            12 => write_packet(stream, 0xd0, &[])?,
            // The first session normally ends by the fixture closing the
            // socket without PUBACK. A client DISCONNECT on either session is
            // instead an orderly runtime shutdown and must not be reported as
            // a reconnect failure by the controlled broker.
            14 => return Ok(()),
            _ => {}
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_reconnect_session(
    stream: &mut TcpStream,
    attempt: usize,
    request_topic: &str,
    response_topic: &str,
    status_topic: &str,
    request_factory: &(dyn Fn(usize, &str) -> Value + Send + Sync),
    response_tx: &Sender<Value>,
    stop_rx: &Receiver<()>,
) -> Result<(), String> {
    let mut subscribed = false;
    let mut session_id = None;
    let mut expected_id = None;
    let mut request_sent = false;
    loop {
        let Some(packet) = read_packet(stream, stop_rx)? else {
            return Err("controlled reconnect session ended before response".to_string());
        };
        match packet_type(packet.header) {
            3 => {
                let publish = parse_publish(packet.header, &packet.payload)?;
                if let Some(packet_id) = publish.packet_id {
                    write_packet(stream, 0x40, &packet_id.to_be_bytes())?;
                }
                if publish.topic == status_topic {
                    let status = serde_json::from_slice::<Value>(publish.body)
                        .map_err(|error| error.to_string())?;
                    session_id = status
                        .get("session_id")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                } else if publish.topic == response_topic {
                    let response = serde_json::from_slice::<Value>(publish.body)
                        .map_err(|error| error.to_string())?;
                    if response.get("id").and_then(Value::as_str) == expected_id.as_deref()
                        && response.get("ok").and_then(Value::as_bool).is_some()
                    {
                        let _ = response_tx.send(response);
                        return Ok(());
                    }
                }
            }
            8 => {
                let packet_id = packet_identifier(&packet.payload)?;
                write_packet(
                    stream,
                    0x90,
                    &[packet_id.to_be_bytes()[0], packet_id.to_be_bytes()[1], 0x01],
                )?;
                subscribed = true;
            }
            12 => write_packet(stream, 0xd0, &[])?,
            14 => return Err("client disconnected before controlled response".to_string()),
            _ => {}
        }
        if subscribed
            && !request_sent
            && let Some(session_id) = session_id.as_deref()
        {
            let request = request_factory(attempt, session_id);
            expected_id = request
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string);
            let payload = serde_json::to_vec(&request).map_err(|error| error.to_string())?;
            write_publish(stream, request_topic, attempt as u16 + 1, &payload)?;
            request_sent = true;
        }
    }
}

fn accept_stream(
    listener: &TcpListener,
    stop_rx: &Receiver<()>,
    timeout: Duration,
) -> Result<Option<TcpStream>, String> {
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((stream, _)) => return Ok(Some(stream)),
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                if stop_rx.try_recv().is_ok() {
                    return Ok(None);
                }
                if Instant::now() >= deadline {
                    return Err("controlled broker accept timed out".to_string());
                }
                thread::sleep(Duration::from_millis(5));
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

/// Accepts reconnect attempts until one client sends a complete MQTT CONNECT.
///
/// A cold macOS test binary can abandon its first TCP attempt at rumqttc's
/// network timeout before emitting CONNECT. Production treats that as a
/// pre-effect reconnect, so the reference broker must retain listener
/// ownership rather than turn the abandoned socket into a terminal result.
fn accept_connect_packet(
    listener: &TcpListener,
    stop_rx: &Receiver<()>,
    timeout: Duration,
) -> Result<Option<(TcpStream, WirePacket)>, String> {
    let deadline = Instant::now() + timeout;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("controlled broker CONNECT timed out".to_string());
        }
        let Some(mut stream) = accept_stream(listener, stop_rx, remaining)? else {
            return Ok(None);
        };
        configure_stream(&stream)?;
        match read_packet(&mut stream, stop_rx)? {
            Some(connect) => return Ok(Some((stream, connect))),
            None if Instant::now() < deadline => {}
            None => return Err("controlled broker stopped before CONNECT".to_string()),
        }
    }
}

fn configure_stream(stream: &TcpStream) -> Result<(), String> {
    stream
        .set_nonblocking(false)
        .map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(1)))
        .map_err(|error| error.to_string())
}

fn accept_connect(stream: &mut TcpStream, stop_rx: &Receiver<()>) -> Result<String, String> {
    let connect = read_packet(stream, stop_rx)?
        .ok_or_else(|| "controlled broker stopped before CONNECT".to_string())?;
    if packet_type(connect.header) != 1 {
        return Err("first MQTT packet was not CONNECT".to_string());
    }
    let client_id = parse_connect_client_id(&connect.payload)?;
    write_packet(stream, 0x20, &[0x00, 0x00])?;
    Ok(client_id)
}

fn packet_type(header: u8) -> u8 {
    header >> 4
}

fn packet_identifier(payload: &[u8]) -> Result<u16, String> {
    let bytes = payload
        .get(..2)
        .ok_or_else(|| "MQTT packet identifier is missing".to_string())?;
    Ok(u16::from_be_bytes([bytes[0], bytes[1]]))
}

fn parse_connect_client_id(payload: &[u8]) -> Result<String, String> {
    let mut cursor = 0;
    let protocol = read_utf8_field(payload, &mut cursor)?;
    if protocol != "MQTT" {
        return Err("unsupported MQTT CONNECT protocol".to_string());
    }
    let level = *payload
        .get(cursor)
        .ok_or_else(|| "MQTT CONNECT level is missing".to_string())?;
    cursor += 1;
    payload
        .get(cursor..cursor + 3)
        .ok_or_else(|| "MQTT CONNECT flags or keepalive are missing".to_string())?;
    cursor += 3;
    if level == 5 {
        let property_length = read_variable_integer(payload, &mut cursor)?;
        cursor = cursor
            .checked_add(property_length)
            .filter(|end| *end <= payload.len())
            .ok_or_else(|| "MQTT CONNECT properties are truncated".to_string())?;
    } else if level != 4 {
        return Err("unsupported MQTT CONNECT level".to_string());
    }
    read_utf8_field(payload, &mut cursor)
}

struct ParsedConnectWithWill {
    client_id: String,
    will_topic: String,
    will_payload: Vec<u8>,
    will_qos_one: bool,
    will_retained: bool,
}

fn parse_connect_with_will(payload: &[u8]) -> Result<ParsedConnectWithWill, String> {
    let mut cursor = 0;
    if read_utf8_field(payload, &mut cursor)? != "MQTT" {
        return Err("unsupported MQTT CONNECT protocol".to_string());
    }
    let level = *payload
        .get(cursor)
        .ok_or_else(|| "MQTT CONNECT level is missing".to_string())?;
    cursor += 1;
    if level != 4 {
        return Err("status fixture requires MQTT 3.1.1".to_string());
    }
    let flags = *payload
        .get(cursor)
        .ok_or_else(|| "MQTT CONNECT flags are missing".to_string())?;
    cursor += 1;
    cursor = cursor
        .checked_add(2)
        .filter(|end| *end <= payload.len())
        .ok_or_else(|| "MQTT CONNECT keepalive is truncated".to_string())?;
    let client_id = read_utf8_field(payload, &mut cursor)?;
    if flags & 0x04 == 0 {
        return Err("MQTT CONNECT Last Will is missing".to_string());
    }
    let will_topic = read_utf8_field(payload, &mut cursor)?;
    let will_payload = read_binary_field(payload, &mut cursor)?;
    Ok(ParsedConnectWithWill {
        client_id,
        will_topic,
        will_payload,
        will_qos_one: flags & 0x18 == 0x08,
        will_retained: flags & 0x20 != 0,
    })
}

fn read_utf8_field(payload: &[u8], cursor: &mut usize) -> Result<String, String> {
    let length_bytes = payload
        .get(*cursor..*cursor + 2)
        .ok_or_else(|| "MQTT UTF-8 field length is missing".to_string())?;
    *cursor += 2;
    let length = u16::from_be_bytes([length_bytes[0], length_bytes[1]]) as usize;
    let bytes = payload
        .get(*cursor..*cursor + length)
        .ok_or_else(|| "MQTT UTF-8 field is truncated".to_string())?;
    *cursor += length;
    std::str::from_utf8(bytes)
        .map(str::to_string)
        .map_err(|error| error.to_string())
}

fn read_binary_field(payload: &[u8], cursor: &mut usize) -> Result<Vec<u8>, String> {
    let length_bytes = payload
        .get(*cursor..*cursor + 2)
        .ok_or_else(|| "MQTT binary field length is missing".to_string())?;
    *cursor += 2;
    let length = u16::from_be_bytes([length_bytes[0], length_bytes[1]]) as usize;
    let bytes = payload
        .get(*cursor..*cursor + length)
        .ok_or_else(|| "MQTT binary field is truncated".to_string())?;
    *cursor += length;
    Ok(bytes.to_vec())
}

fn read_variable_integer(payload: &[u8], cursor: &mut usize) -> Result<usize, String> {
    let mut value = 0usize;
    let mut multiplier = 1usize;
    for _ in 0..4 {
        let byte = *payload
            .get(*cursor)
            .ok_or_else(|| "MQTT variable integer is truncated".to_string())?;
        *cursor += 1;
        value = value
            .checked_add(((byte & 0x7f) as usize) * multiplier)
            .ok_or_else(|| "MQTT variable integer overflow".to_string())?;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
        multiplier *= 128;
    }
    Err("MQTT variable integer is too long".to_string())
}

struct ParsedPublish<'a> {
    topic: String,
    packet_id: Option<u16>,
    body: &'a [u8],
}

fn parse_publish(header: u8, payload: &[u8]) -> Result<ParsedPublish<'_>, String> {
    let topic_len = payload
        .get(..2)
        .map(|bytes| u16::from_be_bytes([bytes[0], bytes[1]]) as usize)
        .ok_or_else(|| "MQTT publish topic length is missing".to_string())?;
    let topic_end = 2 + topic_len;
    let topic = std::str::from_utf8(
        payload
            .get(2..topic_end)
            .ok_or_else(|| "MQTT publish topic is truncated".to_string())?,
    )
    .map_err(|error| error.to_string())?
    .to_string();
    let qos = (header & 0x06) >> 1;
    let (packet_id, body_start) = if qos == 0 {
        (None, topic_end)
    } else {
        let id = payload
            .get(topic_end..topic_end + 2)
            .ok_or_else(|| "MQTT publish packet ID is truncated".to_string())?;
        (Some(u16::from_be_bytes([id[0], id[1]])), topic_end + 2)
    };
    let body = payload
        .get(body_start..)
        .ok_or_else(|| "MQTT publish body is truncated".to_string())?;
    Ok(ParsedPublish {
        topic,
        packet_id,
        body,
    })
}

fn read_packet(
    stream: &mut TcpStream,
    stop_rx: &Receiver<()>,
) -> Result<Option<WirePacket>, String> {
    let header = loop {
        let mut byte = [0_u8; 1];
        match stream.read_exact(&mut byte) {
            Ok(()) => break byte[0],
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                ) =>
            {
                if stop_rx.try_recv().is_ok() {
                    return Ok(None);
                }
            }
            Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
            Err(error) if is_peer_closed(error.kind()) => return Ok(None),
            Err(error) => return Err(error.to_string()),
        }
    };
    let Some(remaining) = read_remaining_length(stream)? else {
        return Ok(None);
    };
    let mut payload = vec![0_u8; remaining];
    match stream.read_exact(&mut payload) {
        Ok(()) => {}
        Err(error)
            if error.kind() == io::ErrorKind::UnexpectedEof || is_peer_closed(error.kind()) =>
        {
            return Ok(None);
        }
        Err(error) => return Err(error.to_string()),
    }
    Ok(Some(WirePacket { header, payload }))
}

fn read_remaining_length(stream: &mut TcpStream) -> Result<Option<usize>, String> {
    let mut multiplier = 1_usize;
    let mut value = 0_usize;
    for _ in 0..4 {
        let mut byte = [0_u8; 1];
        match stream.read_exact(&mut byte) {
            Ok(()) => {}
            Err(error)
                if error.kind() == io::ErrorKind::UnexpectedEof || is_peer_closed(error.kind()) =>
            {
                return Ok(None);
            }
            Err(error) => return Err(error.to_string()),
        }
        value += usize::from(byte[0] & 0x7f) * multiplier;
        if byte[0] & 0x80 == 0 {
            return Ok(Some(value));
        }
        multiplier *= 128;
    }
    Err("MQTT remaining length is malformed".to_string())
}

fn write_publish(
    stream: &mut TcpStream,
    topic: &str,
    packet_id: u16,
    body: &[u8],
) -> Result<(), String> {
    let topic_len =
        u16::try_from(topic.len()).map_err(|_| "controlled topic is too long".to_string())?;
    let mut payload = Vec::with_capacity(2 + topic.len() + 2 + body.len());
    payload.extend_from_slice(&topic_len.to_be_bytes());
    payload.extend_from_slice(topic.as_bytes());
    payload.extend_from_slice(&packet_id.to_be_bytes());
    payload.extend_from_slice(body);
    write_packet(stream, 0x32, &payload)
}

fn write_packet(stream: &mut TcpStream, header: u8, payload: &[u8]) -> Result<(), String> {
    write_bytes(stream, &[header])?;
    write_remaining_length(stream, payload.len())?;
    write_bytes(stream, payload)?;
    match stream.flush() {
        Ok(()) => Ok(()),
        Err(error) if is_peer_closed(error.kind()) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn write_remaining_length(stream: &mut TcpStream, mut value: usize) -> Result<(), String> {
    loop {
        let mut encoded =
            u8::try_from(value % 128).map_err(|_| "remaining length overflow".to_string())?;
        value /= 128;
        if value > 0 {
            encoded |= 0x80;
        }
        write_bytes(stream, &[encoded])?;
        if value == 0 {
            return Ok(());
        }
    }
}

fn write_bytes(stream: &mut TcpStream, bytes: &[u8]) -> Result<(), String> {
    match stream.write_all(bytes) {
        Ok(()) => Ok(()),
        Err(error) if is_peer_closed(error.kind()) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn is_peer_closed(kind: io::ErrorKind) -> bool {
    matches!(
        kind,
        io::ErrorKind::BrokenPipe
            | io::ErrorKind::ConnectionAborted
            | io::ErrorKind::ConnectionReset
            | io::ErrorKind::NotConnected
    )
}
