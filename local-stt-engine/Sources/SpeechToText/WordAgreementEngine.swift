import FluidAudio
import Foundation

// Adapted from VoiceInk/Transcription/Streaming/WordAgreementEngine.swift.

struct TimedWord {
    let text: String
    let normalizedText: String
    let startTime: Double
    let endTime: Double
    let confidence: Float

    init(text: String, startTime: Double, endTime: Double, confidence: Float = 1.0) {
        self.text = text
        self.normalizedText = Self.normalize(text)
        self.startTime = startTime
        self.endTime = endTime
        self.confidence = confidence
    }

    private static func normalize(_ text: String) -> String {
        String(
            text.lowercased()
                .replacingOccurrences(of: "-", with: " ")
                .filter { $0.isLetter || $0.isNumber || $0.isWhitespace }
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct AgreementConfig {
    var transcribeIntervalSeconds = 1.0
    var tokenConfirmationsNeeded = 3
    var minWordsToConfirm = 5
    var minPassConfidence: Float = 0.15
    var minWordConfidence: Float = 0.6
}

struct AgreementResult {
    let fullText: String
    let newlyConfirmedText: String
}

final class WordAgreementEngine {
    private let config: AgreementConfig

    private var confirmedWords: [TimedWord] = []
    private var previousWords: [TimedWord] = []
    private var consecutiveAgreementCount = 0
    private var isFirstPass = true

    private(set) var confirmedEndTime = 0.0
    private(set) var hypothesisStartTime = 0.0

    init(config: AgreementConfig = AgreementConfig()) {
        self.config = config
    }

    func reset() {
        confirmedWords = []
        previousWords = []
        consecutiveAgreementCount = 0
        isFirstPass = true
        confirmedEndTime = 0.0
        hypothesisStartTime = 0.0
    }

    func processTranscriptionResult(words: [TimedWord], resultConfidence: Float = 1.0) -> AgreementResult {
        guard !words.isEmpty else {
            return makeResult(hypothesisWords: [], newlyConfirmedWords: [])
        }

        if isFirstPass {
            isFirstPass = false
            previousWords = words
            return makeResult(hypothesisWords: words, newlyConfirmedWords: [])
        }

        if resultConfidence < config.minPassConfidence {
            consecutiveAgreementCount = 0
            previousWords = words
            return makeResult(hypothesisWords: words, newlyConfirmedWords: [])
        }

        let commonPrefix = findLongestCommonPrefix(current: words, previous: previousWords)
        previousWords = words

        if commonPrefix.count >= config.minWordsToConfirm {
            consecutiveAgreementCount += 1
        } else {
            consecutiveAgreementCount = 0
            return makeResult(hypothesisWords: words, newlyConfirmedWords: [])
        }

        guard consecutiveAgreementCount >= config.tokenConfirmationsNeeded else {
            return makeResult(hypothesisWords: words, newlyConfirmedWords: [])
        }

        let confirmUpTo = applyPunctuationRule(words: Array(words.prefix(commonPrefix.count)))
        guard confirmUpTo > 0 else {
            return makeResult(hypothesisWords: words, newlyConfirmedWords: [])
        }

        let boundaryWords = Array(words.prefix(confirmUpTo).suffix(3))
        let minBoundaryConfidence = boundaryWords.map(\.confidence).min() ?? 1.0
        guard minBoundaryConfidence >= config.minWordConfidence else {
            return makeResult(hypothesisWords: words, newlyConfirmedWords: [])
        }

        let newlyConfirmed = Array(words.prefix(confirmUpTo))
        let hypothesis = Array(words.dropFirst(confirmUpTo))

        confirmedWords.append(contentsOf: newlyConfirmed)
        if let lastConfirmed = newlyConfirmed.last {
            confirmedEndTime = lastConfirmed.endTime
        }

        hypothesisStartTime = hypothesis.first?.startTime ?? confirmedEndTime
        consecutiveAgreementCount = hypothesis.isEmpty ? 0 : 1
        previousWords = hypothesis
        isFirstPass = hypothesis.isEmpty

        return makeResult(hypothesisWords: hypothesis, newlyConfirmedWords: newlyConfirmed)
    }

    static func mergeTokensToWords(_ timings: [TokenTiming], timeOffset: Double = 0.0) -> [TimedWord] {
        guard !timings.isEmpty else {
            return []
        }

        var words: [TimedWord] = []
        var currentText = ""
        var wordStart = 0.0
        var wordEnd = 0.0
        var currentConfidences: [Float] = []

        for timing in timings {
            let token = timing.token

            if token.hasPrefix("_") || token.hasPrefix(" ") || token.hasPrefix("▁") {
                if !currentText.isEmpty {
                    let confidence = averageConfidence(currentConfidences)
                    words.append(TimedWord(
                        text: currentText,
                        startTime: wordStart + timeOffset,
                        endTime: wordEnd + timeOffset,
                        confidence: confidence
                    ))
                }

                let stripped = token.trimmingCharacters(in: .whitespaces)
                    .replacingOccurrences(of: "▁", with: "")
                    .replacingOccurrences(of: "_", with: "")
                currentText = stripped
                wordStart = timing.startTime
                wordEnd = timing.endTime
                currentConfidences = [timing.confidence]
            } else {
                if currentText.isEmpty {
                    wordStart = timing.startTime
                }
                currentText += token
                wordEnd = timing.endTime
                currentConfidences.append(timing.confidence)
            }
        }

        if !currentText.isEmpty {
            let confidence = averageConfidence(currentConfidences)
            words.append(TimedWord(
                text: currentText,
                startTime: wordStart + timeOffset,
                endTime: wordEnd + timeOffset,
                confidence: confidence
            ))
        }

        return words
    }

    private static func averageConfidence(_ values: [Float]) -> Float {
        values.isEmpty ? 1.0 : values.reduce(0, +) / Float(values.count)
    }

    private func findLongestCommonPrefix(current: [TimedWord], previous: [TimedWord]) -> [TimedWord] {
        let minCount = min(current.count, previous.count)
        var prefixLength = 0

        for index in 0..<minCount {
            if current[index].normalizedText == previous[index].normalizedText {
                prefixLength = index + 1
            } else {
                break
            }
        }

        return Array(current.prefix(prefixLength))
    }

    private func applyPunctuationRule(words: [TimedWord]) -> Int {
        guard !words.isEmpty else {
            return 0
        }

        let sentenceEnders: Set<Character> = [".", "!", "?", ";"]
        var punctuationIndices: [Int] = []

        for index in 0..<words.count {
            if let lastCharacter = words[index].text.last,
               sentenceEnders.contains(lastCharacter) {
                punctuationIndices.append(index)
            }
        }

        guard punctuationIndices.count >= 3 else {
            return 0
        }

        let cutIndex = punctuationIndices[punctuationIndices.count - 3]
        let confirmCount = cutIndex + 1

        guard confirmCount >= config.minWordsToConfirm else {
            return 0
        }

        return confirmCount
    }

    private func makeResult(hypothesisWords: [TimedWord], newlyConfirmedWords: [TimedWord]) -> AgreementResult {
        let confirmedText = confirmedWords.map(\.text).joined(separator: " ")
        let hypothesisText = hypothesisWords.map(\.text).joined(separator: " ")
        let newlyConfirmedText = newlyConfirmedWords.map(\.text).joined(separator: " ")

        var fullParts: [String] = []
        if !confirmedText.isEmpty {
            fullParts.append(confirmedText)
        }
        if !hypothesisText.isEmpty {
            fullParts.append(hypothesisText)
        }

        return AgreementResult(
            fullText: fullParts.joined(separator: " "),
            newlyConfirmedText: newlyConfirmedText
        )
    }
}
