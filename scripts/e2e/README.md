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
| `phase-10-2.js` | 書く→後からつなぐ→マップ/リスト→外す→メモを足す→編集下書き | `FAIL` 行があれば確認 |
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
