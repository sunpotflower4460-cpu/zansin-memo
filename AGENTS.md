# AGENTS Guide

## 作業原則
- まず README と docs を読む
- 実装前に docs/mvp.md と docs/phase-roadmap.md を必ず読む
- コンセプトを勝手に変更しない
- 1PRで大きく作りすぎない
- Phase契約に従う
- 実装前に対象ファイルを確認する
- 既存UIを壊さない
- 新しい依存パッケージは必要最小限
- APIキーや秘密情報を入れない
- PR本文に今回のPhase・変更内容・未実装範囲・テスト結果・次Phaseを書く
- Phase外の作業を見つけた場合は提案に留め、実装しない
- UI変更時は低圧UX・モバイル表示・アクセシビリティを確認する

## 実装姿勢
- MVPの核（低圧で書ける・再会できる・育てられる）を守る
- docs/phase-roadmap.md の順序を尊重する
- docs/non-goals.md に反する機能は提案段階で止める
