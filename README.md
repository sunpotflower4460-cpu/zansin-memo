# Kizashi Notes / きざしノート

思いつき・直感・違和感を「メモ」ではなく「種」として保存し、あとで再会し、育てるための iOS-first スマホアプリ（Expo + React Native）です。

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

## 技術スタック
- Expo
- React Native
- TypeScript
- AsyncStorage（ローカル永続化）

## はじめかた
```bash
npm install
npm run start
npm run ios
npm run android
```

> iOSシミュレータ起動には macOS + Xcode が必要です。

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
