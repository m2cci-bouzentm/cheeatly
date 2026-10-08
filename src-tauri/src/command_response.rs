#[derive(serde::Serialize)]
pub struct Success {
    pub success: bool,
}

impl Success {
    pub const fn new() -> Self {
        Self { success: true }
    }
}
