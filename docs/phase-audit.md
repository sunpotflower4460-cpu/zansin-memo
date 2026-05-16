# Phase Audit Report

## 監査対象ファイル一覧
- README.md
- AGENTS.md
- .github/copilot-instructions.md
- docs/concept.md
- docs/product-vision.md
- docs/seed-world.md
- docs/target-users.md
- docs/mvp.md
- docs/ux-design.md
- docs/architecture.md
- docs/phase-roadmap.md
- docs/non-goals.md
- docs/review-policy.md

## 不足ファイル
- なし

## 全体評価
- コンセプト（メモ=種、低圧、再会、育成）は全体として高い整合性がある。
- Phase 0〜8 は「軽量MVP→拡張準備」の順序を概ね維持できている。
- 一方で、用語統一（カテゴリ vs tags）と一部データ項目（再浮上・変換保存）の明確化が不足。

## 良い点
- README / concept / product-vision / seed-world で中核比喩が一貫している。
- non-goals が明確で、MVP肥大化を抑制する方向性が維持されている。
- phase-roadmap が各Phaseに「やること / やらないこと / 完了条件 / 受け渡し」を持ち、段階開発に適している。
- architecture が Repository 分離と AIフォールバック方針を示し、将来拡張に耐える。
- UX Design が「低圧」「急かさない」を明示し、世界観と実用性を両立している。

## 見つかった矛盾
1. **カテゴリ表現の不一致**
   - README / MVP / UX は「カテゴリ」を使用。
   - architecture は `tags: string[]` を定義し「Tag」を説明。
   - 実装時に別概念として分裂するリスクがある。
   - **推奨統一方針**: UI表示語は「カテゴリ」、保存キーと実装名は `tags` に統一する。
2. **Phase 6完了条件とデータ保存定義の弱さ**
   - phase-roadmap Phase 6 は「UIから選択・保存できる」を要求。
   - architecture Seed には変換結果保存先が未定義。
   - 保存仕様が未定義のまま実装判断が分岐する可能性がある。
3. **再浮上運用の履歴項目不足**
   - Phase 5 で resurfacingScore を扱うが、最終再浮上時刻が型で定義されていない。
   - 同一種の過剰再浮上回避ロジックを入れにくい。

## 見つかった重複
- concept.md / seed-world.md / product-vision.md で「低圧で書ける」「再会」「育つ」の主張は重複するが、役割（哲学 / 世界観 /体験時間軸）で住み分けできており許容範囲。
- README と phase-roadmap.md の Phase一覧は意図的重複で、導線として妥当。

## 見つかった不足
- Phase契約を運用するための、Phaseごとの「実装禁止範囲」「レビュー観点」「テスト観点」の詳細ドキュメントが未整備（本PRで `docs/phase-contracts.md` を追加）。
- 依存関係を一目で確認できるマップが未整備（本PRで `docs/phase-dependency-map.md` を追加）。
- 後続エージェント向けの即実行Issue雛形が不足（本PRで `docs/next-agent-tasks.md` を追加）。

## MVPとのズレ
1. **MVP項目「カテゴリ」とモデル「tags」の表記差**
   - MVP実装時に入力UIや保存キー命名が割れる可能性。
2. **Transform Actionsの「保存」要件に対する型準備不足**
   - MVP必須機能7の「UI土台」は満たせるが、Phase 6完了条件の「保存」に向けた設計追記が必要。
3. **Garden入力データの明文化不足**
   - `relatedSeedIds` はあるが、Phase 7で使う最小表示ルール（例: 関連がない種の扱い）が未定義。

## Non-Goalsとのズレ
- 明確な違反は見当たらない。
- ただし以下は将来の逸脱リスクとして監視が必要。
  - Product Vision の「チーム共有モード（後期）」は初期Phaseに混入しない運用ガードが必要。
  - Garden View は「見た目優先で重くなる」圧力が発生しやすく、Phase 7の非目標（3D/複雑グラフ）厳守が必要。

## データモデル監査（architecture.md）
### 現行評価
- MVP機能に必要な中核項目（本文、状態、感情、重要度、タグ、関連、時刻）は概ね揃っている。
- `growthState` が思考育成として説明され、作業管理化を抑止できている。
- `mood` は optional、`tags` は配列で低圧運用可能。
- `relatedSeedIds` は Garden の最小関係表示に有効。
- Repository分離方針（Local → Cloud差し替え）は自然。

### 追加候補（過剰実装を避ける前提）
- `lastResurfacedAt?: string`
  - Phase 5 の過剰再浮上回避と説明可能性に有効。
- `archivedAt?: string`
  - `growthState=archived` の履歴理由を扱いやすくする。
- `sourceType?: "manual" | "import" | "transform"`
  - 将来の入力経路区別に有効。
- `transformOutputs?: Array<{ id: string; type: "question" | "task" | "article" | "project"; content: string; createdAt: string; }>`
  - Phase 6 の「保存」を最小限で満たしやすい。
- `softDeletedAt?: string`
  - 将来の復元導線に拡張しやすい。
- `schemaVersion?: number`
  - LocalStorage/IndexedDB移行時の互換管理に有効。

## エージェント運用監査（AGENTS / Copilot instructions）
### 評価
- 優先原則（Phase順守、低圧UX、秘密情報禁止、小PR）が明確。
- 後続エージェントが読むべき対象（README/docs）も概ね示されている。
- Copilot instructions は短く重要ルールに絞れている。

### 追加提案
- 実装前に **docs/phase-roadmap.md と docs/mvp.md を必読** と明文化。
- PR本文テンプレとして以下を固定:
  - 今回のPhase
  - 実装したこと
  - 実装していないこと
  - テスト結果
  - 次Phase
- Phase外作業は「提案止まり」で実装禁止を明文化。
- UI変更時に低圧UX / モバイル表示 / アクセシビリティ確認を必須化。

## 修正提案（最小）
1. 用語統一ルールを追加  
   - 「カテゴリ」はUI表示語、「保存キーはtags」を明記するか、全面的にどちらかへ統一する。
2. Phase 6前までに transform保存先をドキュメント追記  
   - 例: `transformOutputs` の最小構造だけ先に確定。
3. Phase 5前までに再浮上履歴項目を追記  
   - 例: `lastResurfacedAt` を追加候補として採用検討。
4. Phase 7前に Garden最小表示仕様を追記  
   - ノード/関連なし種/状態色分けなどの最小判定基準を定義。

## 次に進んでよいかの判定
**READY_FOR_PHASE_1**

### 判定理由
- 致命的矛盾はなく、Phase 1開始に必要な資料が揃っている。
- 用語統一（カテゴリ/`tags`）と運用ルール追記は反映済み。
- Phase 5/6/7向け追加候補は提案として残し、MVPを重くしない運用が可能。
