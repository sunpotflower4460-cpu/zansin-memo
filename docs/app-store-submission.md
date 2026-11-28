# App Store 提出パッケージ

初回の iPhone 向け無料版（1.0.0）用です。この版では「書く・つなげる・見渡す・芽を書く」の体験を公開します。Plus は開発プレビューのため、掲載文・スクリーンショット・審査手順は通常の Release ビルドに合わせています。実施結果は [公開準備の記録](app-store-readiness.md) を参照してください。

## App Store Connect 入力値

| 項目 | 値 |
|---|---|
| プラットフォーム | iOS |
| アプリ名 | Kizashi Notes - きざしノート |
| サブタイトル | ひとことを置いて、育てるノート |
| プライマリ言語 | 日本語（ja） |
| プライマリカテゴリ | 仕事効率化（Productivity） |
| セカンダリカテゴリ | ライフスタイル（Lifestyle） |
| Bundle ID | `com.sunpotflower4460.kizashinotes` |
| SKU | `kizashi-notes-ios`（新規登録時。既存レコードがあればその SKU を使用） |
| バージョン | 1.0.0。ビルド番号はアップロードする EAS ビルドで確認 |
| 対応 | iOS 15.1以降の iPhone、縦向き |
| 価格 | 無料。アプリ内課金なし |
| サポートURL | 公開できる実連絡先を掲載したサポートページのURL |
| プライバシーポリシーURL | https://github.com/sunpotflower4460-cpu/zansin-memo/blob/main/docs/privacy-policy.md |

著作権者の正式表記、審査連絡先、配信国・地域、配信開始方法はアカウント担当者が確定します。現行のアプリは、ログインなしで閲覧できる GitHub Issues を開きます。投稿には GitHub アカウントが必要です。Apple のサポートURLには、利用者が連絡できる実際のメールアドレスなどを掲載したページが必要です。公開用の連絡先を [ポリシーのお問い合わせ欄](privacy-policy.md#7-お問い合わせ) または別のサポートページに掲載し、そのURLをストア情報と `src/config/appInfo.ts` に反映してください。 [App Store Connect の入力項目](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)

### プロモーションテキスト

```text
思いつきや小さな違和感を、ひとことから。メモをつないで関係を見渡し、「こうできそう」を自分の言葉で残せます。ログインも広告もありません。
```

### 説明文

```text
Kizashi Notes（きざしノート）は、思いつきや、まだ言葉にしきれない気づきを「種」として残すノートです。あとで見返し、関係がありそうなメモをつなぎ、自分の考えを少しずつ育てられます。

■ ひとことから書ける
タイトルや分類を決めなくても、本文ひとことから保存できます。気分・大切度・カテゴリは必要なときに。書きかけは下書きから再開できます。

■ つながりを見渡す
新しいメモを足したり、すでにあるメモを選んでつないだりできます。つながりは地図でもリストでも確認できます。それぞれの元のメモはそのまま残ります。

■ 「こうできそう」を芽にする
元のメモや参考にしたメモを読みながら、見えてきた可能性を自分の言葉で書きます。できたことや形になったことは「花」として残せます。

■ 日々のメモに再会する
ホームの「今日の種」から、以前に書いたメモを見返せます。本文やカテゴリを検索でき、庭では種・芽・花やつながりのあるメモを辿れます。

■ 自分のメモを入れる前に試せる
「例で使い方を見る」では、架空のメモで接続や芽の作り方を試せます。練習での操作は自分のメモには反映されません。

ログイン、広告、トラッキングはありません。メモは端末内に保存されます。設定から JSON・テキストで書き出したり、アプリ内のデータを削除したりできます。
```

### キーワード

```text
アイデア,思いつき,振り返り,オフライン,つながり,日々の記録
```

## App Privacy・年齢制限・審査情報

- **App Privacy の回答案は「データの収集なし」**。ログイン、広告、解析 SDK、トラッキング、クラウド同期、外部 AI 送信はありません。ユーザーが書き出すと、iOS の共有シートで自分で選んだ宛先にファイルを渡せます。アプリから開発者へ本文が送信される処理はありません。 [Apple のデータ収集の定義](https://developer.apple.com/app-store/app-privacy-details/)
- プライバシーポリシーは App Store Connect と、アプリのホーム →「設定・バックアップ」→「プライバシーポリシー」からアクセスできます。公開されるソースと文面を揃え、登録前にログインしない状態で両URLを開いて確認します。 [App Review ガイドライン 5.1.1](https://developer.apple.com/app-store/review/guidelines/#privacy)
- 端末内の保存と書き出しに使う Required Reason API は `app.json` から生成されるマニフェストと依存 SDK のマニフェストに記載します。アップロード時は同梱マニフェストに関する Apple の処理結果も確認します。 [Apple の Required Reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
- 年齢制限は現行の質問票に沿って回答します。メモは端末内の個人用で、アプリ内で他ユーザーに配信されません。メッセージ・チャット、広告、制限なしのアプリ内ウェブ閲覧、共有位置情報、出会い機能もありません。年齢区分は App Store Connect が計算します。子ども向けカテゴリには登録しません。 [年齢制限の設定](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)・[質問票の更新](https://developer.apple.com/help/app-store-connect/release-notes/)
- 暗号化申告は `ITSAppUsesNonExemptEncryption = false`。アプリには独自の暗号化通信や暗号化された書き出しを組み込んでいません。コンテンツ権利は配布する素材の実際の権利関係に沿って回答します。 [Apple の配布準備](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution)
- サインイン情報は不要です。審査担当者が連絡できる氏名、電話番号、メールアドレスは App Store Connect の審査情報に入力します。アクセシビリティのストア表示は対象操作を実機で検証した項目を申告します。 [アクセシビリティの表示](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/)

### 審査メモ

```text
ログインや審査用アカウントは不要です。メモの作成・検索・接続と芽の保存はオフラインで使えます。アプリ内課金はありません。

1. 初回はホームの「例で使い方を見る」で、架空のメモをつないで地図を見たり、芽を書く操作を試したりできます。練習内容は実際のメモに入りません。
2. 「書く」タブで本文を入力して「保存する」を押します。「続けて書く」で2件目を作成できます。
3. 「種一覧」タブで「選ぶ」を開いて2件のメモを選び「2つをつなげる」を押すと、詳細で地図とリストを切り替えられます。
4. 詳細の「ここに書いて芽にする」から、「こうできそう」を入力し「芽として保存」を押します。元のメモはそのままです。
5. ホーム下部の「設定・バックアップ」で、ポリシー、サポート、JSON・テキストの書き出しとデータの全削除を確認できます。

No sign-in or purchase is required. Tap the 「書く」 tab to write a memo and tap 「保存する」 to save it. Add a second memo, then open 「種一覧」 and use 「選ぶ」 to connect the two. The detail screen shows the connection as a map or list. Tap 「ここに書いて芽にする」 to record an idea alongside the original memo. Export, deletion, and privacy controls are under 「設定・バックアップ」 on the Home screen.
```

## スクリーンショット

[提出用 PNG](store-screenshots/) を表の順で使います。通常の iOS Release アプリを iPhone 17 Pro シミュレータ（1206×2622 px、縦向き）で撮影した、日本語用の画像です。メモは架空です。App Store Connect の「iPhone with Dynamic Island（medium display）」の枠に登録します。 [Apple のスクリーンショット仕様](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)

| ファイル | 画面 |
|---|---|
| `01-home.png` | 今日の種とホーム |
| `02-write.png` | ひとことを書く |
| `03-seeds.png` | 種の一覧と検索 |
| `04-detail.png` | 元のメモと本人が書いた芽 |
| `05-garden.png` | 庭で育ち方を見渡す |
| `06-links.png` | 実際につながったメモの地図 |

## 署名から審査まで

1. Apple Developer Program の利用資格と契約を確認します。Apple Developer で Bundle ID を確認または登録し、App Store Connect に同じ ID のアプリレコードを用意します。すでにある場合はそれを使います。 [アプリレコードの作成](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)
2. Expo にログインし、正しい Expo アカウント・プロジェクトに紐づけます。既存アップロードがある場合は、App Store Connect の最新ビルド番号を確認して EAS のリモート番号を設定します。 `production` は Xcode 26.2 を使い、ビルド番号をリモートで管理します。 [Expo のビルド番号管理](https://docs.expo.dev/build-reference/app-versions/)・[ビルド環境](https://docs.expo.dev/build-reference/infrastructure/)
3. Apple Distribution の証明書と App Store 用のプロビジョニングをチームで設定し、署名済みのビルドを作ります。配布ビルドを確認してから、同じアプリレコードへアップロードします。
   ```sh
   npm ci
   npm run check
   npx --yes eas-cli@27.11.0 login
   npx --yes eas-cli@27.11.0 init
   npm run build:ios
   npm run submit:ios
   ```
   すでに EAS プロジェクトに紐づいている場合は `init` を省略できます。過去のアップロード番号の取り込みには `npx --yes eas-cli@27.11.0 build:version:set --platform ios --profile production` を使います。アップロード時は対象の EAS ビルドを選択します。App Store Connect の数字の App ID が確定したら `submit.production.ios.ascAppId` に指定できます。ビルドのアップロード後は Apple の処理結果を確認し、内部 TestFlight に追加できます。 [EAS の iOS アップロード](https://docs.expo.dev/submit/ios/)
4. TestFlight の配布ビルドで [実機・初見利用の確認項目](core-growth-verification.md) を埋めます。掲載文、スクリーンショット、URL、App Privacy、年齢制限、審査連絡先を登録して、同じビルドを選択します。配信先の地域に応じた申告（EU の事業者情報など）をアカウント担当者が確定します。
5. レビュー提出前に [公開準備の記録](app-store-readiness.md) と残項目を確認します。現在のアップロード下限は Xcode 26 / iOS 26 SDK です。2027年4月以降にアップロードする場合は、Xcode・SDK とスクリーンショットの要件をその時点で再確認します。 [Apple の提出要件](https://developer.apple.com/news/upcoming-requirements/)・[提出の最新情報](https://developer.apple.com/app-store/submitting/)
