# Next Agent Tasks (Issue Drafts)

## Issue 1: Phase 1 App Shell 実装
### 目的
- Home / Write / Seeds / Seed Detail / Garden の最小画面枠と遷移を作り、実装土台を固定する。

### 読むべきdocs
- README.md
- docs/mvp.md
- docs/phase-roadmap.md
- docs/ux-design.md
- docs/non-goals.md
- docs/phase-contracts.md

### 実装範囲
- 主要5画面のルートと画面枠
- 共通ナビゲーション
- 仮データでの表示確認

### 実装しない範囲
- 永続化
- 再浮上ロジック
- AI連携
- 重いアニメーション/3D表現

### 完了条件
- 主要5画面へ遷移できる
- 画面構成が docs/ux-design.md と整合
- 低圧トーンを崩さない

### テスト/確認方法
- 手動で全画面遷移確認
- モバイル幅でレイアウト破綻がないことを確認
- フォーカス可視性と基本キーボード操作を確認

### PR本文に書くべきこと
- 今回のPhase
- 実装したこと
- 実装していないこと
- テスト結果
- 次Phaseへ渡すもの

---

## Issue 2: Phase 2 Seed Data Model 実装
### 目的
- Seed中心のデータモデルとローカル保存を整備し、Phase 3以降の基盤を作る。

### 読むべきdocs
- docs/architecture.md
- docs/mvp.md
- docs/phase-roadmap.md
- docs/phase-contracts.md
- docs/non-goals.md

### 実装範囲
- Seed型定義
- Repositoryインターフェース
- ローカルCRUD（LocalStorageまたはIndexedDB）
- 画面層とデータ層の分離

### 実装しない範囲
- クラウド同期
- 認証/課金
- AI API連携
- 高度分析基盤

### 完了条件
- CRUD成立
- 再読込後もデータ保持
- Phase 3〜7で必要な項目に不足がない

### テスト/確認方法
- 作成/更新/削除/取得の確認
- タイトルなし・メタ未入力でも保存できる確認
- 関連ID・状態更新の反映確認

### PR本文に書くべきこと
- 今回のPhase
- 実装したこと
- 実装していないこと
- テスト結果
- 次Phaseへ渡すもの

---

## Issue 3: Phase 3 Write Experience 実装
### 目的
- 一言から書ける低圧入力体験を実装し、記録の心理ハードルを下げる。

### 読むべきdocs
- docs/mvp.md
- docs/ux-design.md
- docs/concept.md
- docs/non-goals.md
- docs/phase-contracts.md

### 実装範囲
- 最小入力フォーム
- タイトル非必須の保存導線
- mood / importance / カテゴリ（保存は `tags`）の任意入力
- 保存後のやさしいフィードバック

### 実装しない範囲
- 入力必須項目の増加
- 高機能エディタ化
- AIによる自動補完前提

### 完了条件
- 数秒で種を保存できる
- 分類を強制しない
- 低圧文言と静かなUIが維持される

### テスト/確認方法
- 一言入力→保存の最短フロー確認
- メタ入力なし保存確認
- モバイルでの入力しやすさ確認

### PR本文に書くべきこと
- 今回のPhase
- 実装したこと
- 実装していないこと
- テスト結果
- 次Phaseへ渡すもの

---

## Issue 4: Phase 4 Seed List & Detail 実装
### 目的
- 種の見返し・再編集体験を成立させ、再会と育成の中心導線を作る。

### 読むべきdocs
- docs/mvp.md
- docs/ux-design.md
- docs/phase-roadmap.md
- docs/non-goals.md
- docs/phase-contracts.md

### 実装範囲
- Seeds一覧
- 検索/フィルター/並び替え
- Seed Detail 表示と更新
- relatedSeedIds の最小表示

### 実装しない範囲
- 複雑グラフ可視化
- 過剰分析ダッシュボード
- 生成AI推論依存

### 完了条件
- 必要な種へ素早く再アクセスできる
- 詳細で状態・メタ情報を更新できる
- 次Phase（再浮上/変換）へ必要データを渡せる

### テスト/確認方法
- 検索/フィルター/ソート動作確認
- 詳細編集の保存反映確認
- モバイルで一覧と詳細の行き来確認

### PR本文に書くべきこと
- 今回のPhase
- 実装したこと
- 実装していないこと
- テスト結果
- 次Phaseへ渡すもの
