use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

use cheatly_audio::{
    microphone::MicrophoneStream,
    resampler::Resampler,
    speaker::{SpeakerInput, SpeakerStream},
};
use ringbuf::traits::Consumer;
use std::sync::mpsc;

use super::provider::{AudioChunk, AudioSource};

pub struct MicrophoneCapture {
    stream: MicrophoneStream,
    running: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}

impl MicrophoneCapture {
    pub fn start(
        device_id: Option<String>,
        output: mpsc::Sender<AudioChunk>,
    ) -> anyhow::Result<Self> {
        let mut stream = MicrophoneStream::new(device_id)?;
        let sample_rate = stream.sample_rate();
        let mut consumer = stream
            .take_consumer()
            .ok_or_else(|| anyhow::anyhow!("microphone consumer unavailable"))?;
        let running = Arc::new(AtomicBool::new(true));
        let worker_running = running.clone();
        stream.play()?;
        let worker = thread::spawn(move || {
            let mut resampler = match Resampler::new(sample_rate as f64) {
                Ok(value) => value,
                Err(_) => return,
            };
            let mut input = Vec::with_capacity((sample_rate / 20) as usize);
            while worker_running.load(Ordering::Acquire) {
                while let Some(sample) = consumer.try_pop() {
                    input.push(sample);
                    if input.len() >= (sample_rate / 20) as usize {
                        if let Ok(pcm16) = resampler.resample_to_i16(&input) {
                            let _ = output.send(AudioChunk {
                                source: AudioSource::Microphone,
                                pcm16,
                                sample_rate: cheatly_audio::TRANSCRIPTION_SAMPLE_RATE,
                            });
                        }
                        input.clear();
                    }
                }
                thread::sleep(Duration::from_millis(5));
            }
        });
        Ok(Self {
            stream,
            running,
            worker: Some(worker),
        })
    }

    pub fn stop(&mut self) -> anyhow::Result<()> {
        self.running.store(false, Ordering::Release);
        self.stream.pause()?;
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        Ok(())
    }
}

impl Drop for MicrophoneCapture {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

pub struct SystemAudioCapture {
    stream: SpeakerStream,
    running: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}

impl SystemAudioCapture {
    pub fn start(
        device_id: Option<String>,
        output: mpsc::Sender<AudioChunk>,
    ) -> anyhow::Result<Self> {
        let mut stream = SpeakerInput::new(device_id)?.stream()?;
        let sample_rate = stream.sample_rate();
        let mut consumer = stream
            .take_consumer()
            .ok_or_else(|| anyhow::anyhow!("system audio consumer unavailable"))?;
        let running = Arc::new(AtomicBool::new(true));
        let worker_running = running.clone();
        let worker = thread::spawn(move || {
            let mut resampler = match Resampler::new(sample_rate as f64) {
                Ok(value) => value,
                Err(_) => return,
            };
            let mut input = Vec::with_capacity((sample_rate / 20) as usize);
            while worker_running.load(Ordering::Acquire) {
                while let Some(sample) = consumer.try_pop() {
                    input.push(sample);
                    if input.len() >= (sample_rate / 20) as usize {
                        if let Ok(pcm16) = resampler.resample_to_i16(&input) {
                            let _ = output.send(AudioChunk {
                                source: AudioSource::System,
                                pcm16,
                                sample_rate: cheatly_audio::TRANSCRIPTION_SAMPLE_RATE,
                            });
                        }
                        input.clear();
                    }
                }
                thread::sleep(Duration::from_millis(5));
            }
        });
        Ok(Self {
            stream,
            running,
            worker: Some(worker),
        })
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Release);
        self.stream.pause();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for SystemAudioCapture {
    fn drop(&mut self) {
        self.stop();
    }
}
