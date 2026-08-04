use std::fmt;
use std::io::Cursor;

use rumqttc::{MqttOptions, Transport};

pub const MAX_TLS_MATERIAL_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MutualTlsBuildError {
    MissingMaterial,
    MaterialTooLarge,
    InvalidMaterial,
}

#[derive(Clone, PartialEq, Eq)]
pub struct MutualTlsIdentity {
    ca_certificate: Vec<u8>,
    client_certificate: Vec<u8>,
    client_private_key: Vec<u8>,
}

impl fmt::Debug for MutualTlsIdentity {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MutualTlsIdentity")
            .field("material", &"[REDACTED]")
            .finish()
    }
}

impl MutualTlsIdentity {
    pub fn new(
        ca_certificate: Vec<u8>,
        client_certificate: Vec<u8>,
        client_private_key: Vec<u8>,
    ) -> Result<Self, MutualTlsBuildError> {
        let materials = [&ca_certificate, &client_certificate, &client_private_key];
        if materials.iter().any(|material| material.is_empty()) {
            return Err(MutualTlsBuildError::MissingMaterial);
        }
        if materials
            .iter()
            .any(|material| material.len() > MAX_TLS_MATERIAL_BYTES)
        {
            return Err(MutualTlsBuildError::MaterialTooLarge);
        }
        if !valid_certificate_bundle(&ca_certificate)
            || !valid_certificate_bundle(&client_certificate)
            || rustls_pemfile::private_key(&mut Cursor::new(&client_private_key))
                .ok()
                .flatten()
                .is_none()
        {
            return Err(MutualTlsBuildError::InvalidMaterial);
        }
        Ok(Self {
            ca_certificate,
            client_certificate,
            client_private_key,
        })
    }
}

fn valid_certificate_bundle(bytes: &[u8]) -> bool {
    let mut reader = Cursor::new(bytes);
    let mut certificates = rustls_pemfile::certs(&mut reader);
    matches!(certificates.next(), Some(Ok(_))) && certificates.all(|result| result.is_ok())
}

#[derive(Clone, PartialEq, Eq)]
pub enum MqttTransportSecurity {
    LoopbackPlaintext,
    MutualTls(MutualTlsIdentity),
}

impl fmt::Debug for MqttTransportSecurity {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MqttTransportSecurity")
            .field(
                "profile",
                &match self {
                    Self::LoopbackPlaintext => "loopback_plaintext",
                    Self::MutualTls(_) => "mutual_tls",
                },
            )
            .finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttTransportError {
    PlaintextRemoteHost,
    InvalidHost,
}

impl MqttTransportSecurity {
    pub fn validate_host(&self, host: &str) -> Result<(), MqttTransportError> {
        let host = host.trim();
        if host.is_empty() {
            return Err(MqttTransportError::InvalidHost);
        }
        match self {
            Self::LoopbackPlaintext if !is_loopback_host(host) => {
                Err(MqttTransportError::PlaintextRemoteHost)
            }
            _ => Ok(()),
        }
    }

    pub fn apply(&self, host: &str, options: &mut MqttOptions) -> Result<(), MqttTransportError> {
        self.validate_host(host)?;
        match self {
            Self::LoopbackPlaintext => {
                options.set_transport(Transport::tcp());
                Ok(())
            }
            Self::MutualTls(identity) => {
                options.set_transport(Transport::tls(
                    identity.ca_certificate.clone(),
                    Some((
                        identity.client_certificate.clone(),
                        identity.client_private_key.clone(),
                    )),
                    None,
                ));
                Ok(())
            }
        }
    }
}

pub(crate) fn is_loopback_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    host.trim_matches(|character| character == '[' || character == ']')
        .parse::<std::net::IpAddr>()
        .is_ok_and(|address| address.is_loopback())
}
