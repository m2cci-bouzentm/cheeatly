import FluidAudio
import Foundation

// Adapted from VoiceInk/Transcription/Streaming/FluidAudioStreamingProvider.swift.

final class FluidAudioStreamingService: @unchecked Sendable {
    private let fluidAudioService: FluidAudioTranscriptionService
    private let agreementEngine: WordAgreementEngine
    private let config: AgreementConfig

    private var eventsContinuation: AsyncStream<StreamingTranscriptionEvent>.Continuation?
    private(set) var transcriptionEvents: AsyncStream<StreamingTranscriptionEvent>

    private var audioBuffer: [Float] = []
    private let bufferLock = NSLock()
    private let sampleRate = 16_000.0
    private var trimmedSampleCount = 0

    private var asrManager: AsrManager?
    private var decoderLayerCount = 0
    private var languageHint: Language?

    private var transcriptionTask: Task<Void, Never>?
    private var isTranscribing = false
    private var lastTranscribedSampleCount = 0
    private let minimumAudioSamples = ASRConstants.minimumRequiredSamples(forSampleRate: ASRConstants.sampleRate)
    private let minNewSamples = ASRConstants.minimumRequiredSamples(forSampleRate: ASRConstants.sampleRate)

    init(fluidAudioService: FluidAudioTranscriptionService, config: AgreementConfig = AgreementConfig()) {
        self.fluidAudioService = fluidAudioService
        self.config = config
        self.agreementEngine = WordAgreementEngine(config: config)

        var continuation: AsyncStream<StreamingTranscriptionEvent>.Continuation!
        transcriptionEvents = AsyncStream { streamContinuation in
            continuation = streamContinuation
        }
        eventsContinuation = continuation
    }

    deinit {
        transcriptionTask?.cancel()
        eventsContinuation?.finish()
    }

    func connect(modelName: String, language: String?) async throws {
        let version = ParakeetModel.version(for: modelName)
        let models = try await fluidAudioService.getOrLoadModels(for: version)

        let manager = AsrManager(config: .default)
        try await manager.loadModels(models)
        asrManager = manager
        decoderLayerCount = await manager.decoderLayerCount
        languageHint = ParakeetModel.languageHint(from: language, modelName: modelName)

        agreementEngine.reset()
        audioBuffer = []
        trimmedSampleCount = 0
        lastTranscribedSampleCount = 0

        startTranscriptionLoop()
        eventsContinuation?.yield(.sessionStarted)
    }

    func sendAudioChunk(_ data: Data) async throws {
        try await sendSamples(Pcm16.decode(data))
    }

    func sendSamples(_ samples: [Float]) async throws {
        guard !samples.isEmpty else {
            return
        }

        bufferLock.withLock {
            audioBuffer.append(contentsOf: samples)
        }
    }

    func commit() async throws {
        transcriptionTask?.cancel()
        await transcriptionTask?.value
        transcriptionTask = nil

        let remainingText = await transcribeRemainingAudio() ?? ""
        eventsContinuation?.yield(.committed(text: remainingText))
    }

    func disconnect() async {
        transcriptionTask?.cancel()
        await transcriptionTask?.value
        transcriptionTask = nil

        await asrManager?.cleanup()
        asrManager = nil
        decoderLayerCount = 0
        languageHint = nil

        bufferLock.withLock {
            audioBuffer = []
            trimmedSampleCount = 0
        }
        agreementEngine.reset()

        eventsContinuation?.finish()
    }

    private func startTranscriptionLoop() {
        transcriptionTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(nanoseconds: UInt64(
                        (self?.config.transcribeIntervalSeconds ?? 1.0) * 1_000_000_000
                    ))
                } catch {
                    break
                }

                guard !Task.isCancelled else {
                    break
                }

                await self?.runTranscriptionPass()
            }
        }
    }

    private func runTranscriptionPass() async {
        guard !isTranscribing else {
            return
        }
        guard let asrManager else {
            return
        }

        let absoluteSampleCount = bufferLock.withLock {
            trimmedSampleCount + audioBuffer.count
        }

        guard absoluteSampleCount - lastTranscribedSampleCount >= minNewSamples else {
            return
        }
        guard absoluteSampleCount >= minimumAudioSamples else {
            return
        }

        isTranscribing = true
        defer {
            isTranscribing = false
        }

        let seekTime = agreementEngine.hypothesisStartTime > 0
            ? agreementEngine.hypothesisStartTime
            : agreementEngine.confirmedEndTime
        let seekSample = max(0, Int(seekTime * sampleRate))

        guard var audioSlice = bufferLock.withLock({
            let bufferRelativeSeek = max(0, seekSample - trimmedSampleCount)
            let sliceEnd = audioBuffer.count
            guard bufferRelativeSeek < sliceEnd else {
                return nil as [Float]?
            }

            return Array(audioBuffer[bufferRelativeSeek..<sliceEnd])
        }) else {
            return
        }

        audioSlice = paddedForPunctuation(audioSlice)
        guard audioSlice.count >= minimumAudioSamples else {
            return
        }

        do {
            var state = TdtDecoderState.make(decoderLayers: decoderLayerCount)
            let result = try await asrManager.transcribe(
                audioSlice,
                decoderState: &state,
                language: languageHint
            )
            lastTranscribedSampleCount = absoluteSampleCount

            guard let tokenTimings = result.tokenTimings, !tokenTimings.isEmpty else {
                let text = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty {
                    eventsContinuation?.yield(.partial(text: text))
                }
                return
            }

            let timeOffset = Double(seekSample) / sampleRate
            let words = WordAgreementEngine.mergeTokensToWords(tokenTimings, timeOffset: timeOffset)
            guard !words.isEmpty else {
                return
            }

            let agreementResult = agreementEngine.processTranscriptionResult(
                words: words,
                resultConfidence: result.confidence
            )

            if !agreementResult.newlyConfirmedText.isEmpty {
                let normalized = TextNormalizer.shared.normalizeSentence(agreementResult.newlyConfirmedText)
                eventsContinuation?.yield(.committed(text: normalized))
            }
            if !agreementResult.fullText.isEmpty {
                eventsContinuation?.yield(.partial(text: agreementResult.fullText))
            }

            trimConfirmedAudio()
        } catch {
            eventsContinuation?.yield(.error(error))
        }
    }

    private func trimConfirmedAudio() {
        let newHypothesisStartTime = agreementEngine.hypothesisStartTime
        guard newHypothesisStartTime > 0 else {
            return
        }

        let safeTrimPoint = max(0, Int(newHypothesisStartTime * sampleRate))
        let samplesToTrim = safeTrimPoint - trimmedSampleCount
        guard samplesToTrim > 0 else {
            return
        }

        bufferLock.withLock {
            let actualTrim = min(samplesToTrim, audioBuffer.count)
            audioBuffer.removeFirst(actualTrim)
            trimmedSampleCount += actualTrim
        }
    }

    private func transcribeRemainingAudio() async -> String? {
        guard let asrManager else {
            return nil
        }

        let seekTime = agreementEngine.hypothesisStartTime > 0
            ? agreementEngine.hypothesisStartTime
            : agreementEngine.confirmedEndTime
        let seekSample = max(0, Int(seekTime * sampleRate))

        guard var samples = bufferLock.withLock({
            let bufferRelativeSeek = max(0, seekSample - trimmedSampleCount)
            guard bufferRelativeSeek < audioBuffer.count else {
                return nil as [Float]?
            }

            return Array(audioBuffer[bufferRelativeSeek...])
        }) else {
            return nil
        }

        guard samples.count >= minimumAudioSamples else {
            return nil
        }

        samples = paddedForPunctuation(samples)

        do {
            var state = TdtDecoderState.make(decoderLayers: decoderLayerCount)
            let result = try await asrManager.transcribe(
                samples,
                decoderState: &state,
                language: languageHint
            )
            let text = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else {
                return nil
            }
            return TextNormalizer.shared.normalizeSentence(text)
        } catch {
            eventsContinuation?.yield(.error(error))
            return nil
        }
    }

    private func paddedForPunctuation(_ samples: [Float]) -> [Float] {
        let trailingSilenceSamples = 16_000
        let maxSingleChunkSamples = 240_000

        guard samples.count + trailingSilenceSamples <= maxSingleChunkSamples else {
            return samples
        }

        return samples + [Float](repeating: 0, count: trailingSilenceSamples)
    }
}
