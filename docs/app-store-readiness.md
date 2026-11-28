# App Store 公開準備の記録

2026年11月28日更新。GitHub の `main`（`fdf4b40`）を起点に、初回の iPhone 向け無料版 1.0.0 を準備しました。App Store Connect への入力値と掲載文は [提出パッケージ](app-store-submission.md) にあります。

## ローカルで確認した項目

| 確認 | 結果 |
|---|---|
| 型、Lint、ユニットテスト | `npm run check` 合格。186件 |
| Expo 依存関係と構成 | `expo install --check` 合格。Expo Doctor 18/18。SDK 54 内で Expo と FileSystem のパッチ版を更新 |
| 無料版のブラウザー試験 | Phase 10.1〜10.5 と表示・キーボードの6本。移行、書く、接続・地図／リスト、芽、例、2,000件のメモと300本の接続、320／390／768px の表示と検索。試験したホーム・書く・種一覧・庭で44 CSS pxを下回る対象は0件 |
| 読み込み失敗時のデータ保護 | 開いている [GitHub Issue #10](https://github.com/sunpotflower4460-cpu/zansin-memo/issues/10) の事象に対して現行のストレージが書き込みを停止し、破損時の退避・控えからの回復を行うことを既存テストで確認 |
| 本番 JavaScript | Plus と保存計測の開発フラグを立てて iOS 本番バンドルを生成。両画面の実装はソースマップに含まれず、無料版の入口のみ |
| npm 監査 | `npm audit --omit=dev` はクリティカル0件、高1件、中12件。Metro の `postcss` を修正版に更新。高の `image-size` は修正版と SDK 54 の画像組み込みに互換性がなく、Expo が指定する版を維持。残りの `glob`／`minimatch` も含め、いずれも iOS 本番バンドルに存在しないことをソースマップで確認 |
| ストア文面 | 名前22文字、副題15文字、プロモーション68文字、説明575文字、キーワード83 UTF-8バイト。判定時の制限を満たす |
| アイコンとリンク | 1024×1024・透過なしのアイコン。プライバシーポリシーと GitHub Issues の公開ページはログインなしで応答。投稿には GitHub アカウントが必要 |
| iPhone 向け Xcode Archive | Xcode 26.2 で Release の arm64 アーカイブを作成。iOS 15.1以降、日本語、iPhone 用、暗号化申告、バックアップ除外、本番 JS、9件のマニフェストを実ファイルで確認。ローカル検証用の未署名アーカイブ |
| iPhone SE（第3世代）の実機試験 | iOS 26.6.1。Release アーカイブから検証専用 ID のアプリを作成し、XCTest で初回表示、練習の表示と終了、保存2件、接続、地図／リスト切替、芽の保存、再起動後の検索と原文・接続・芽の保持を確認 |
| iOS の書き出しと全削除 | iPhone SE 実機と iPhone 17 Pro シミュレータで、JSON の確認ダイアログ、JSON／テキストの共有シート、全削除のキャンセルと確定、再起動後に空の状態を確認。シミュレータで実際の JSON にメモ・接続・芽・下書きが含まれ、全削除で過去の一時書き出しも消去されることを確認 |
| 文字拡大 | iPhone 17 Pro シミュレータで Dynamic Type をアクセシビリティ最大に設定。キーボード表示中に本文の入力と保存ができることを確認 |
| ストア用の画像 | iPhone 17 Pro シミュレータの Release ビルドで架空のメモを用いて撮影。ホーム・書く・種一覧・芽・庭・地図の6枚を目視し、1206×2622 px・透過なしを確認 |

ビルドで SDK 26 を選ぶよう EAS の `production` プロファイルに Xcode 26.2 を指定しました。EAS はビルド番号をリモートで管理し、配布ビルドごとに加算します。日本語のローカライズ、暗号化申告、プライバシーマニフェストと AsyncStorage のバックアップ除外を設定しています。 [Apple のアップロード要件](https://developer.apple.com/news/upcoming-requirements/)・[EAS のビルド番号管理](https://docs.expo.dev/build-reference/app-versions/)

書き出し後に一時ファイルを消去し、アプリ内の全削除でも過去の一時書き出しを消せるようにしました。保存ボタン周辺の操作を維持しながら、ヘルプ、一覧の絞り込み、「別の種」のタップ領域を広げています。

起動時の芽は iOS のスプラッシュ1枚に統一しました。iPhone SE シミュレータの起動録画で、芽からホームへの切り替わりを確認しました。内部配布の「きざし比較」は iPhone SE 実機で無料・Plus の切り替えを確認しました。アトリエの下書きの保持と模擬購入はシミュレータとブラウザーで確認しました。 [比較版の手順](../scripts/e2e/README.md#無料と-plus-の比較版)

## 配布・公開前に確認する項目

- **公開用のサポート連絡先。** Apple が求める、メールアドレスなど実際に連絡できる情報を公開ページに反映します。公開に使える連絡先はリポジトリから確認できませんでした。更新したポリシーを公開し、対応するURLをストアとアプリで揃えます。 [App Store Connect のサポートURL要件](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- **Apple と Expo のアカウント作業。** Apple Developer の配布チーム、App Store Connect のアプリレコード、著作権表記、審査連絡先、配信先を確定します。この環境には Apple Distribution の署名 ID がなく、Expo も未ログインです。配布用の署名済みビルド、Apple での処理、TestFlight、審査提出の各結果を確認します。 [App Store Connect の手順](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-workflow)
- **配布版での確認。** TestFlight の同じビルドで日本語入力、VoiceOver の読み上げ、各画面の文字拡大と動きの低減、機内モードでの一周を確認します。初見の利用者による観察結果も [公開判定](core-growth-verification.md#8-公開判定チェックリスト計画-10) に記録します。
