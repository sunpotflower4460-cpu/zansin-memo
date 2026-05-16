# App Store Readiness (MVP Draft)

## 位置づけ
- このバージョンは **未提出のiOS向けMVP** です。
- 目的は「iPhone上で一通り触れて、MVP体験（書く・残る・再会する・育てる）を確認できる状態」にすることです。
- App Store提出作業そのもの（審査提出・配布設定）は今回のPRでは実施しません。

## 今回のMVPで満たしている前提
- ローカル完結（認証なし・課金なし・クラウド同期なし）
- 外部への個人情報送信なし
- AI/API連携なしでも全機能が成立
- iOSファーストのスマホUI（Safe Area、キーボード重なり軽減を考慮）

## 将来の提出に向けて必要な作業（TODO）

### 1) アプリアイコン
- 本番用1024x1024アイコンを用意
- Expo設定のアイコン差し替え
- ダーク背景/ライト背景での視認性確認

### 2) スプラッシュ画面
- 世界観に合う静かなスプラッシュ画像を作成
- 起動時のコントラストと可読性を実機確認

### 3) プライバシーポリシー
- ローカル保存中心である旨を明記したポリシー文書を作成
- App Store Connectに登録できる公開URLを用意

### 4) スクリーンショット
- iPhoneサイズ別に主要画面（Home/Write/Seeds/Detail/Garden）を撮影
- 低圧UXが伝わる文言と画面順序を整理

### 5) App Store説明文
- 「タスク管理ではなく、種を育てるメモ」であることを明記
- 非搭載機能（SNS/課金/クラウド前提/AI必須）を誤解なく表現

### 6) EAS Build / Submit（候補）
- 将来候補として EAS Build / EAS Submit を検討
- ビルド設定、証明書、配布プロファイル運用を準備

### 7) iOS実機確認
- キーボード表示時の入力操作
- Dynamic Type拡大時の崩れ
- タップ領域の十分性
- VoiceOver読み上げの基本確認

### 8) Apple Developer設定
- Apple Developer Program加入状態確認
- App ID / Bundle Identifier / Provisioning の整備
- App Store Connect のアプリ作成とメタ情報入力
- 現在の開発用ID（`com.sunpotflower4460.kizashinotes`）を本番提出前に最終確定する
