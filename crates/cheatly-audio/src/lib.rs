#![allow(
    clippy::clone_on_copy,
    clippy::collapsible_if,
    clippy::manual_div_ceil,
    clippy::manual_is_multiple_of,
    clippy::manual_pattern_char_comparison,
    clippy::manual_unwrap_or,
    clippy::new_without_default,
    clippy::useless_transmute,
    unused_assignments
)]

pub mod audio_config;
pub mod microphone;
pub mod resampler;
pub mod silence_suppression;
pub mod speaker;
pub mod vad;

pub const TRANSCRIPTION_SAMPLE_RATE: u32 = 16_000;
