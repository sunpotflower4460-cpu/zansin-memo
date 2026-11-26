# Kizashi Notes / きざしノート

思いつき・直感・違和感を「メモ」ではなく「種」として保存し、あとで再会し、育てるための **iOS-first スマホアプリ**（Expo + React Native）です。

## コンセプト
- 低圧で書ける（タイトル必須なし）
- 後から再会できる（今日の種）
- 育てられる（growthState / 変換アクション）
- タスク管理アプリ化しない

## MVP実装範囲（iOS向け）
- Home / Write / Seeds / Seed Detail / Garden
- Seed CRUD（ローカル保存）
- growthState: `seed | sprout | tree | archived`
- mood: `calm | excited | uncertain | heavy | bright`（任意）
- importance: `1..5`
- カテゴリUI（保存キーは `tags`）
- 今日の種（ランダム + 簡易スコア）
- 変換アクション（問い / タスク / 記事案 / プロジェクト案）と保存

## UI/UX Polish（World-Class iOS Polish Pass）
- iOSアプリらしいタブバー・ヘッダー・カードUIに統一
- デザイントークン（theme.ts）でカラー・余白・角丸・影を管理
- 日本語UI統一（内部キーは英語のまま）
- 保存時の画面内トーストで低圧なフィードバック
- Safe Area / KeyboardAvoidingView 対応
- ハプティクス（保存・更新・削除）
- 空状態が上質（アイコン + メッセージ + CTA）
- 庭（Garden）画面の育ち状態別カラーアクセント
- accessibilityRole / accessibilityState 設定

## 最終ブラッシュアップ（App Store提出準備）
- 下部の二重余白を解消（Safe Area・タブバー・保存バー・トーストの位置を整理）
- 詳細画面で、変換候補を追加しても編集中の文章が消えない／未保存のまま戻るときは確認
- 「保存中…」「保存しました」の常時トーストを廃止し、失敗時のみ通知
- 「すべてのデータを削除」で内部の復元用コピーも消去
- ホームの設定類を折りたたみ、「新しい種を書く」を上部へ。書く画面は開くとすぐ入力可能
- タップ領域の拡大、文字コントラスト改善、VoiceOverラベルの具体化
- オリジナルのアプリアイコン／スプラッシュ、プライバシーマニフェスト、暗号化申告、EAS設定

## 和紙デザイン（Washi Pass）
- 生成り・和紙白・墨色の配色トークン（`src/styles/theme.ts`）に統一し、朱を差し色に
- 見出しと種の本文は明朝体（端末標準の書体のみ使用。追加フォントなし）
- 和紙の繊維テクスチャを全画面にごく薄く重ねる（`assets/paper*.png`、操作は妨げない）
- アイコン／スプラッシュは「和紙の地に、墨絵のような若い芽と朱の一点」。起動イントロも同じ画像
- 育ち方（種・芽・木・保管）をアイコン付きバッジ、大切度を5つの点で表示。色だけに頼らない
- 「今日」「昨日」「3日前」の相対日付、育ち方の一言説明（ホームの設定内にも「種の育ち方」）

## 畑の世界観（Field Pass）
- コンセプトの「種を蒔いて育てる」を、光・水・土・植物で表現（手描き風イラスト、`assets/stage-*.png` `banner-field.png` `soil.png`）
- ホーム: 朱の太陽（光）としずく（水）と畝のバナー。「今日の種」は「今日、光をあてる種」
- ホーム「あなたの畑」: 書いた種が、土の上の種・芽・木として並ぶ（タップで庭へ）
- 庭: 種・芽・木・保管が、土の畝（土色→若草→深緑）に並ぶ
- 詳細: 変換候補は「この種に水をあげる」。書く画面は「種をまく」
- 動きは増やさず、静かな表現のみ（過剰な演出なし）

## はじめての人向け
- 初回起動時だけ、3ステップの短い案内（スキップ可・設定から再表示可）。すでに種がある人には出さない
- 空のホームは「ここに、最初の種をまきましょう」と案内
- 「書く」の入力例、大切度の意味（今日の種に選ばれやすくなる）、育ち方の一言説明、変換候補が何をするかの説明

## 迷わないための工夫（Clarity Pass）
- 各画面の見出し横に「？」。タップで、その画面の見かた・使いかたを短く説明（今日の種・畑・書く・種一覧・庭・詳細）
- タップできる場所に「›」や「タップして開く」「庭で見る」を表示
- 詳細画面: 戻り先を明示（「‹ 種一覧」）、保存状態を常に表示（「未保存の変更があります」「保存済みです」）
- 種一覧: 育ち方のチップ（件数つき）を常に表示、カテゴリ・並び替えは折りたたみ（選択中の内容を要約）、絞り込み中は件数と「絞り込みを解除」
- 庭: 各畝に「一覧で見る」（その育ち方だけの種一覧へ）
- 書く: 種をまくボタンが押せないときは理由を表示。保存後・削除後のトーストで「どこに入ったか／どこから戻せるか」を案内

## メモの使い勝手
- 書きかけは自動で端末に退避され、アプリを閉じても続きから書ける
- 詳細画面は「戻る」で自動保存（本文が空のときだけ確認）
- 育ち方は詳細を開かなくても、詳細画面の上部ですぐ変えられる
- 提出用の文面・手順: [App Store Submission](docs/app-store-submission.md)

## 技術スタック
- Expo SDK 54
- React Native
- TypeScript
- AsyncStorage（ローカル永続化）
- expo-haptics（触感フィードバック）
- @expo/vector-icons（Ionicons）

## はじめかた
```bash
npm install
npm run typecheck
npm run start
```

iOSシミュレータで確認する場合:
```bash
npm run ios
```

> iOSシミュレータ起動には macOS + Xcode が必要です。

## 確認コマンド
| コマンド | 説明 |
|---|---|
| `npm install` | 依存パッケージのインストール |
| `npm run typecheck` | TypeScriptの型チェック |
| `npm run start` | Expo DevServer起動 |
| `npm run ios` | iOSシミュレータ起動 |

## 未実装（将来フェーズ）
- AI本接続（Phase 8）
- 認証（未定）
- 課金（未定）
- クラウド同期（未定）
- 通知（未定）
- App Store提出の実作業（Apple Developer アカウントでの申請。準備は完了、手順は docs/app-store-submission.md）

## 重要方針
- 認証・課金・クラウド同期は未実装
- AI/API連携は未実装（Phase 8準備としてインターフェースのみ）
- 秘密情報は保存しない

## Docs
- [Concept](docs/concept.md)
- [Product Vision](docs/product-vision.md)
- [Seed World](docs/seed-world.md)
- [Target Users](docs/target-users.md)
- [MVP](docs/mvp.md)
- [App Store Readiness](docs/app-store-readiness.md)
- [App Store Submission](docs/app-store-submission.md)
- [Privacy Policy](docs/privacy-policy.md)
- [UX Design](docs/ux-design.md)
- [Architecture](docs/architecture.md)
- [Phase Roadmap](docs/phase-roadmap.md)
- [Phase Contracts](docs/phase-contracts.md)
- [Final Execution Plan](docs/final-execution-plan.md)
- [Non-Goals](docs/non-goals.md)
- [Review Policy](docs/review-policy.md)
- [App Store Readiness](docs/app-store-readiness.md)
