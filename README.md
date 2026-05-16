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
- App Store提出作業

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
- [UX Design](docs/ux-design.md)
- [Architecture](docs/architecture.md)
- [Phase Roadmap](docs/phase-roadmap.md)
- [Phase Contracts](docs/phase-contracts.md)
- [Final Execution Plan](docs/final-execution-plan.md)
- [Non-Goals](docs/non-goals.md)
- [Review Policy](docs/review-policy.md)
- [App Store Readiness](docs/app-store-readiness.md)
