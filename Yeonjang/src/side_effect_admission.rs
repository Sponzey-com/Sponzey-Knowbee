use std::sync::Arc;

use crate::authorization::{AuthorizationDecision, AuthorizationRejection, AuthorizationVerifier};
use crate::cancellation::SideEffectBinding;
use crate::method_descriptor::method_descriptor;
use crate::params_schema::validate_params;
use crate::protocol::Request;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdmissionOutcome {
    ReadOnly,
    SideEffect(SideEffectBinding),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdmissionError {
    UnknownMethod,
    InvalidParams,
    InvalidBinding,
    AuthorizationRequired,
    AuthorizationRejected(AuthorizationRejection),
}

pub struct SideEffectAdmission {
    authorization: Arc<dyn AuthorizationVerifier>,
}

impl SideEffectAdmission {
    pub fn new(authorization: Arc<dyn AuthorizationVerifier>) -> Self {
        Self { authorization }
    }

    pub fn admit(&self, request: &Request) -> Result<AdmissionOutcome, AdmissionError> {
        let descriptor = method_descriptor(&request.method).ok_or(AdmissionError::UnknownMethod)?;
        if !validate_params(descriptor.params_schema, &request.params) {
            return Err(AdmissionError::InvalidParams);
        }
        if !descriptor.requires_side_effect_binding() {
            return Ok(AdmissionOutcome::ReadOnly);
        }
        let binding = SideEffectBinding::from_metadata(&request.metadata)
            .ok_or(AdmissionError::InvalidBinding)?;
        let receipt = request
            .metadata
            .authorization_receipt
            .as_ref()
            .ok_or(AdmissionError::AuthorizationRequired)?;
        let context = binding
            .authorization_context(
                &request.method,
                descriptor.resource.as_str(),
                &request.metadata,
            )
            .ok_or(AdmissionError::InvalidBinding)?;
        match self.authorization.verify(receipt, &context) {
            AuthorizationDecision::Authorized => Ok(AdmissionOutcome::SideEffect(binding)),
            AuthorizationDecision::Rejected(reason) => {
                Err(AdmissionError::AuthorizationRejected(reason))
            }
        }
    }
}
