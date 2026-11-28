# Web 動作確認の再実行手順（Playwright）

Phase 10.1〜10.6 の動作を、ブラウザ（Chromium）で確かめるスクリプト。製品のコードではなく、検証用。
`npm run check` には含まれない。**実機（iOS）・VoiceOver・初見ユーザーの確認の代わりにはならない。**
結果の記録は [core-growth-verification.md](../../docs/core-growth-verification.md)。

## 準備

```sh
npm install
npx expo export -p web          # dist/ を作る
npx serve dist -l 8099 &        # 任意の静的サーバーでよい（既定は http://localhost:8099/）
```

Playwright は依存パッケージに含めていない（検証用）。ローカルに入っているもの、または `npm i -D playwright` 等を使う。
`require('playwright')` が解決できない場合は `NODE_PATH` を指定する。

```sh
export NODE_PATH=$(npm root -g):$PWD/node_modules
export E2E_URL=http://localhost:8099/   # 省略時は同じ値
export E2E_OUT=/tmp/e2e-out             # スクリーンショットの出力先（省略時はOSの一時ディレクトリ）
```

## スクリプト

| ファイル | 内容 | 終了コード |
|---|---|---|
| `phase-10-1.js` | v1→v2移行、原本維持、下書き、再読込 | v1原本が変わったら失敗 |
| `phase-10-2.js` | 書く→後からつなぐ→マップ/リスト→外す→メモを足す→編集下書き | `FAIL` または画面エラーで終了コード1 |
| `phase-10-3.js` | 材料を選ぶ→芽→取り消し→再保存→材料の変更→考え直し | 同上 |
| `phase-10-4.js` | 空の状態の案内、練習（実データに触れない）、再体験 | 同上 |
| `phase-10-5.js [件数]` | 大量（既定2,000件）＋300本の中心の探索。例: `node scripts/e2e/phase-10-5.js 5000` | 同上 |
| `layout-keyboard.js` | 幅320/390/768の横はみ出し、Tab移動、検索の正規化、44px未満の要素の一覧 | 横はみ出し・Tab・検索・コンソールエラーが失敗なら終了コード1 |

各行は `PASS` / `FAIL` / `INFO` で出力される。`INFO` は合否ではなく、記録のための観測値。

## 限界

- WebのCSS pxと、iOSのpt・hitSlop・Dynamic Typeは同じではない。
- Webでは `Alert.alert` が動かない（削除・書出しの確認ダイアログは確認できない）。
- `localStorage` はAsyncStorageの代用。保存の速度・容量・書込み失敗は端末で異なる。
- テストデータは `scripts/make-testdata.ts` でも作れる（`node --import tsx scripts/make-testdata.ts 2000 out.json --hub=300`）。

## Plusの開発プレビュー

### 無料と Plus の比較版

内部配布の iOS ビルドは `npx --yes eas-cli@27.11.0 build --platform ios --profile comparison` で生成する。iPhone では「きざし比較」を開き、ホームの「無料と Plus を比較」から「例の庭を開く」か「自分でメモを書いて試す」を選び、「Plus を試す」をオンにする。メモ、デザイン設定、振り返り、アトリエと作品は比較を閉じた後も端末内に残る。アプリIDは `com.sunpotflower4460.kizashinotes.comparison`。その他の購入・復元は試験用の状態で動作する。

- 地図の「マインドマップ」「星座」「つながり一覧」を切り替える。メモをタップすると、画面下の「原文」「中心にする」「つながり」などが選んだメモに合わせて切り替わる。地図の左上に表示される前の中心の名前を押すと、そのとき選んでいたメモと拡大位置へ戻る。
- マインドマップの「2つ先まで」で、途中のメモを経由する経路が見える。「経路」で、各線に保存したつながりの理由を読み、途中のメモを地図で選べる。「ほか◯件」から図に収まらないメモを検索し、今の中心のまま表示できる。星座では「まとまり」から各グループのメモを探す。
- 検索結果は一致した語句の周辺を表示する。「原文」で内容を確かめ、検索語と結果を保ったまま戻れる。「地図へ」で中心を移す。検索欄が空のときは「最近見た中心」から直前までの地図に戻れる。
- マインドマップの「配置」でカードをドラッグできる。「配置を保存」で中心ごとに保存し、「移動を元に戻す」「自動配置」で調整できる。「その他」の「地図を整える」からも配置を開ける。「表示するメモを選ぶ」で絞り込みや保存した地図を使える。
- 「その他」のアトリエは「書く」「材料」「残した版」を切り替える。作品集からも残した版を選んで作品にできる。データ管理はテキストと全データJSONの書き出しを備える。Plus の利用状態では購入・復元と試験条件を操作できる。
- 「表示スタイル」で和紙・藍・月夜を切り替えると、その場で地図に反映される。図はドラッグ・ピンチと拡大ボタンで操作し、「全体」で元の倍率へ戻せる。全画面からも検索できる。文字が大きい設定では検索できる一覧で開く。
- 「AIの提案」を開くと、起点のメモをもとに候補と原文の引用が表示される。「候補を地図で見る」で点線の先のメモをタップすると、理由と引用を確認し、その地図に戻って採用した実線を見られる。「元の画面に戻る」で候補に戻れる。候補に使う文章は端末内で照合する。iOS 17 以降は利用できる言語モデルも用いる。OS のモデルが未準備のときは文章の照合が先に動き、任意で言語モデルだけを取得できる。 [Apple の言語モデル](https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding)
- 「記録」ではカレンダーと足あとを切り替え、日付ごとのメモ・つながり・作品を見返し、振り返りを保存できる。足あとを種類で絞り、つながりを押すと該当の二件が地図で強調される。「元の画面に戻る」で足あとに戻る。既存の振り返りは比較を無料に戻したあとも見返せる。

ブラウザーの比較試験では同じチェックアウトから比較版・通常版の順に書き出す。Metro キャッシュを引き継いだ通常版で比較の入口が無効になり、比較でオフに戻したときに下書きが残ることを確認する。

```sh
EXPO_PUBLIC_KIZASHI_PLUS_COMPARISON=1 npx expo export -p web --output-dir /tmp/kizashi-comparison
EXPO_PUBLIC_KIZASHI_PLUS_COMPARISON=0 npx expo export -p web --output-dir /tmp/kizashi-standard
```

比較版を8104、通常版を8102で配信し、`node scripts/e2e/plus-comparison.js`、`node --import tsx scripts/e2e/plus-studio.js`、`node scripts/e2e/plus-more.js` を実行する。ポートを変更した場合は `COMPARISON_URL` と `FREE_E2E_URL` を指定する。「その他」ではアトリエから作品・PNG出力、データの書き出し、模擬購入と復元、地図の絞り込み、カードの移動・取消・再読込を確認する。地図は375px幅で中心、原文、経路、配色の切り替えを確認する。320×568pxでは64件の架空メモを使い、操作領域と「ほか◯件」から地図に戻る流れを確認する。ブラウザーでは端末内の文章照合を確認する。Apple のモデルは iOS ビルドの「AIの提案」で確認する。

### Plus 専用の開発プレビュー

通常Webと、架空データ専用のPlus開発Webを別のポートで起動する。Playwrightは上の準備を参照。標準のChromiumがある場合は `CHROMIUM_EXEC` にパスを指定できる。

```sh
npx expo export -p web --output-dir dist
npx serve dist -l 8102
```

別のターミナルで実行する。

```sh
EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW=1 npx expo start --web --port 8101 --offline
```

```sh
node scripts/e2e/plus-integration.js
node scripts/e2e/plus-storage.js
node --import tsx scripts/e2e/plus-map.js
PLUS_FIRST=1 node --import tsx scripts/e2e/plus-map.js
node --import tsx scripts/e2e/plus-map-dense.js
node scripts/e2e/plus-proposals.js
node scripts/e2e/plus-atelier.js
PLUS_TEST_EXPIRY=1 node scripts/e2e/plus-collection.js
```

`FREE_E2E_URL` と `PLUS_E2E_URL` で配信先を変更できる。作品の検証ファイルは `PLUS_EXPORT_DIR` に出力される。指定がなければ一時ディレクトリ下の `kizashi-plus-files` に出力する。失敗は非ゼロの終了コードになる。

`plus-map.js` は全体図と周辺図の表示、原文への往復、表示位置の復帰、配置の確認と元に戻す操作を確認する。`plus-map-dense.js` は50・500・2,000・5,000件の架空メモで、初回表示と20回の選択切替を測り、循環を含む周辺の展開と長文への到達を確認する。

プレビューの保存先は `kizashi-plus-preview:` で始まる別の領域。開発ビルドでは `EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_AI=0` などで機能への入口を個別に閉じられる。接尾辞は `MAP`、`AI`、`ATELIER`、`COLLECTION`、`COMMERCE`。保存済みの文章・作品の閲覧と持ち出しは引き続き利用できる。

Webでは保存するタブが一つずつ切り替わる。`plus-storage.js` は同一ブラウザー領域の二つのタブで引き継ぎと全削除を確認する。Web Locksが使えない場合は、各タブ専用の一時領域で例を試せる。

## 保存計測画面

通常・Plusのプレビューとは別の開発画面を起動する。ブラウザー試験は軽い条件で約60秒かかる。

```sh
EXPO_PUBLIC_KIZASHI_PLUS_STORAGE_MEASURE=1 npx expo start --web --port 8103 --offline
```

```sh
node scripts/e2e/plus-storage-measure.js
```

アドレスを変えた場合は `PLUS_STORAGE_MEASURE_URL` を設定する。実iPhoneでの起動と照合方法は [保存方式の判断記録](../../docs/plus-storage-adr.md#保存計測を実行できる開発画面) を参照。
