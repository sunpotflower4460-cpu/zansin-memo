import Accelerate
import ExpoModulesCore
import NaturalLanguage

public final class KizashiLanguageModule: Module {
  private let inference = DispatchQueue(label: "com.kizashinotes.language", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("KizashiLanguage")

    AsyncFunction("findSimilarities") { (center: String, notes: [String]) -> [String: Any] in
      guard #available(iOS 17.0, *) else {
        return ["status": "unavailable", "scores": []]
      }
      let language = Self.detectLanguage(center)
      if let model = NLContextualEmbedding(language: language), model.hasAvailableAssets {
        do {
          try model.load()
          defer { model.unload() }
          if let source = Self.vector(center, language: language, model: model) {
            return ["status": "semantic", "scores": notes.prefix(24).map { note in
              guard model.languages.contains(Self.detectLanguage(note)),
                    let target = Self.vector(note, language: Self.detectLanguage(note), model: model) else { return -1.0 }
              return vDSP.dot(source, target)
            }]
          }
        } catch {
          // An unavailable OS model leaves the local text index usable.
        }
      }
      if let model = NLEmbedding.sentenceEmbedding(for: language), model.vector(for: center) != nil {
        return ["status": "semantic", "scores": notes.prefix(24).map { note in
          guard Self.detectLanguage(note) == language, model.vector(for: note) != nil else { return -1.0 }
          return 1 - model.distance(between: center, and: note, distanceType: .cosine)
        }]
      }
      let needsAssets = NLContextualEmbedding(language: language)?.hasAvailableAssets == false
      return ["status": needsAssets ? "assets" : "unavailable", "scores": []]
    }.runOnQueue(inference)

    AsyncFunction("prepareModel") { (text: String, promise: Promise) in
      guard #available(iOS 17.0, *),
            let model = NLContextualEmbedding(language: Self.detectLanguage(text)) else {
        promise.resolve(false)
        return
      }
      if model.hasAvailableAssets { promise.resolve(true); return }
      // Only the OS language model is downloaded. No note content is sent to Apple.
      model.requestAssets { result, _ in promise.resolve(result == .available) }
    }.runOnQueue(inference)
  }

  private static func detectLanguage(_ text: String) -> NLLanguage {
    NLLanguageRecognizer.dominantLanguage(for: text)
      ?? (text.range(of: "[ぁ-ヿ一-龯]", options: .regularExpression) == nil ? .english : .japanese)
  }

  @available(iOS 17.0, *)
  private static func vector(_ text: String, language: NLLanguage, model: NLContextualEmbedding) -> [Double]? {
    let source = String(text.prefix(420))
    guard let result = try? model.embeddingResult(for: source, language: language) else { return nil }
    var pooled = [Double](repeating: 0, count: model.dimension)
    result.enumerateTokenVectors(in: source.startIndex..<source.endIndex) { values, _ in
      guard pooled.count == values.count else { return true }
      pooled = vDSP.add(pooled, values)
      return true
    }
    let length = vDSP.sumOfSquares(pooled).squareRoot()
    return length > 0 ? pooled.map { $0 / length } : nil
  }
}
