use cheatly_audio::{
    TRANSCRIPTION_SAMPLE_RATE,
    resampler::Resampler,
    silence_suppression::{FrameAction, SilenceSuppressionConfig, SilenceSuppressor},
};

#[test]
fn resamples_48khz_audio_to_16khz_pcm() {
    let mut resampler = Resampler::new(48_000.0).unwrap();
    let input = (0..4_800)
        .map(|index| ((index as f32 / 10.0).sin()) * 0.5)
        .collect::<Vec<_>>();
    let output = resampler.resample_to_i16(&input).unwrap();
    assert!(!output.is_empty());
    assert!(output.len() <= 1_700);
    assert!(output.iter().any(|sample| *sample != 0));
    assert_eq!(TRANSCRIPTION_SAMPLE_RATE, 16_000);
}

#[test]
fn silence_suppressor_bounds_silent_output() {
    let config = SilenceSuppressionConfig::default();
    let mut suppressor = SilenceSuppressor::new(config);
    let silence = vec![0_i16; 320];
    let actions = (0..200)
        .map(|_| suppressor.process(&silence).0)
        .collect::<Vec<_>>();
    assert!(
        actions
            .iter()
            .any(|action| matches!(action, FrameAction::Suppress))
    );
}
