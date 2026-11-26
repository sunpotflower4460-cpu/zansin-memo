# Known Issues (Debug & Stabilization Pass)

> 以下は過去の安定化時点の記録。2026-11-26の監査基準 `ff0d890` では `package.json` にAsyncStorage `2.2.0`と `test` / `check` スクリプトがあるため、項目1と3を現在の未対応事項として扱わない。現在の中核体験の課題は [Core Growth Loop](core-growth-loop.md)、必要な検証は [Core Growth Plan](core-growth-plan.md)を参照。実機試験を行っていないことを、設計更新だけで解消済みとはしない。

## 1) Expo推奨依存バージョンとの差異（AsyncStorage）
- 内容: `expo start` 時に `@react-native-async-storage/async-storage@3.0.2` について Expo SDK 54 の推奨 (`2.2.0`) 警告が出る
- 今回直さない理由: 既存挙動を壊さない安定化を優先し、依存更新影響を切り離すため
- 優先度: 中
- 次フェーズ対応案: 依存互換性PRを分離して作成し、回帰確認後に更新

## 2) CI環境での iOS 手動検証不可
- 内容: `npm run ios` は Xcode 対話が必要なためこの環境で完走できない
- 今回直さない理由: 環境制約（macOS/Xcode UI操作不可）
- 優先度: 高
- 次フェーズ対応案: 実機/シミュレーターで20シナリオを人手で再実行し、結果を追記

## 3) 自動テスト（解決済み）
- 内容: `npm run test` は整備済み（seedUtils / storage / export / saveState）。UIの自動テストは未整備
- 今回直さない理由: 今回は安定化パスであり、大きなテスト基盤導入はスコープ外
- 優先度: 中
- 次フェーズ対応案: seedUtils / storageの軽量ユニットテストから段階導入
