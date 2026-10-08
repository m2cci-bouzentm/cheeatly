use std::sync::{Arc, Mutex};

#[derive(Default)]
struct FakeProvider {
    started: bool,
    chunks: Arc<Mutex<Vec<Vec<i16>>>>,
    stopped: bool,
}

#[test]
fn provider_lifecycle_is_capture_independent() {
    let mut provider = FakeProvider {
        started: true,
        ..FakeProvider::default()
    };
    provider.chunks.lock().unwrap().push(vec![1, 2, 3]);
    provider.stopped = true;
    assert!(provider.started);
    assert_eq!(provider.chunks.lock().unwrap().len(), 1);
    assert!(provider.stopped);
}
