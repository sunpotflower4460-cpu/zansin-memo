# Debug & Stabilization Checklist (iOS MVP)

## 確認した画面
- Home
- Write
- Seeds
- Seed Detail
- Garden

## 実行した確認コマンド
- `npm install` ✅ 成功
- `npm run typecheck` ✅ 成功（修正前後とも実行）
- `npm run start` ✅ Metro 起動確認（`Waiting on http://localhost:8081`）
- `npm run ios` ⚠️ この環境では Xcode 対話入力が必要で実行不可
- `npm run test` ⚠️ `test` script 未定義

## 確認した操作（手動シナリオ 1〜20）
> このCI環境ではiOS UIの実機/シミュレーター操作ができないため、コード上の安全性確認＋起動確認までを実施。  
> 下記は「実施済みコード確認」と「人間による最終実機確認が必要」を分けて記載。

1. 初回起動でHomeを見る → ✅ 空配列ロード時の安全処理を確認（Storage失敗時も空配列）
2. 種0件のHome / Seeds / Gardenを見る → ✅ 各EmptyStateの分岐を確認
3. Writeでbodyだけ入力して保存 → ✅ body trim + 空文字保存ガードを確認
4. Homeで今日の種と最近の種を見る → ✅ todaySeedなし/ありの分岐を確認
5. Seedsで検索する → ✅ title/body/tags対象、trim済み検索確認
6. Seedsで状態フィルターを使う → ✅ 分岐確認
7. Seedsでカテゴリフィルターを使う → ✅ 分岐確認
8. Seedsで並び替える → ✅ updated/importance確認
9. Detailで本文を編集して保存 → ✅ 更新フロー確認
10. Detailで本文空保存を試す → ✅ UI無効化 + App側ガードで防止
11. Detailでタグを編集する → ✅ parseTags + 重複/空除去確認
12. Detailで関連種を選ぶ → ✅ 重複排除 + 存在しないID除去を追加
13. Detailで変換アクションを4種類作る → ✅ 保存ロジック確認 + 連打ガード追加
14. アプリを再起動して保存データが残っているか見る → ✅ AsyncStorage保存/復元コード確認（実機再起動は未実施）
15. 今日の種を別の種に切り替える → ✅ 切替ハンドラ確認
16. seedを削除する → ✅ 削除遷移とtodaySeed無効化を確認
17. 削除後にHome / Seeds / Gardenが壊れないか見る → ✅ detail対象喪失時は元画面へ戻すガード追加
18. 全seedをarchivedにした時の今日の種表示を見る → ✅ candidate 0件でEmptyStateになる
19. Gardenで状態別/カテゴリ別表示を見る → ✅ 件数集計/表示確認
20. iPhone幅でキーボード表示時のWriteを確認する → ⚠️ 実機確認未実施（Detailの下部paddingは改善）

## 見つけた問題
- 不正JSON/古いデータ形状での復元安全性が弱い
- 日付不正時にスコア計算や表示でNaN化しうる
- 変換アクション連打時の増殖ガードがない
- Detail対象seed削除時、画面状態が不整合になりうる
- relatedSeedIdsに存在しないIDが残りうる

## 修正した問題
- AsyncStorage復元時の正規化を強化（型/配列/日付/enum/schemaVersion）
- 保存/読み込み失敗時の安全復帰（クラッシュ防止）
- 再浮上スコア計算のNaN回避、日付表示fallback追加
- create/updateのbody空保存をApp層でも防御
- 変換アクションに短時間連打ガードを追加
- Detailで関連IDを保存前に存在チェック＆重複除去
- Detail対象seed消失時に元タブへ戻すガードを追加
- 主要カード/ボタンのaccessibilityRole/Labelを補強

## 残課題
- iOS実機（SE幅/大画面/キーボード/VoiceOver）での最終手動確認
- `npm run ios` を通すためのローカルXcode環境確認
- `test` script未定義のため、必要なら軽量ユニットテスト導入を次Phaseで検討
