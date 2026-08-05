use crate::protocol::{Request, Response};
use crate::side_effect_admission::{AdmissionError, AdmissionOutcome, SideEffectAdmission};

pub fn project_common_admission(
    admission: &SideEffectAdmission,
    request: &Request,
) -> Result<AdmissionOutcome, Box<Response>> {
    admission.admit(request).map_err(|error| {
        let (code, message) = match error {
            AdmissionError::UnknownMethod => ("unknown_method", "Unknown request method."),
            AdmissionError::InvalidParams => ("invalid_params", "Invalid request parameters."),
            AdmissionError::InvalidBinding => (
                "side_effect_binding_required",
                "Side effect requires exact execution binding.",
            ),
            AdmissionError::AuthorizationRequired => (
                "side_effect_authorization_required",
                "Side effect authorization is required.",
            ),
            AdmissionError::AuthorizationRejected(_) => (
                "side_effect_authorization_rejected",
                "Side effect authorization was rejected.",
            ),
        };
        Box::new(Response::error(request.id.clone(), code, message))
    })
}
