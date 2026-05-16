# Final Execution Plan

## 実装を始める前の最終方針
1. すべてのPRは Phase契約に厳密準拠し、Phase外は提案止まりにする。
2. 最優先は「低圧で書ける」「後から再会できる」「育てられる」体験であり、タスク管理化を避ける。
3. 初期はローカル完結を維持し、AI/API/認証/課金/クラウド依存を入れない。
4. 1PRは小さく、レビューで戻しやすい粒度を守る。
5. UI変更時はモバイル表示とアクセシビリティを必ず確認する。

## Phase 1からの推奨実装順
1. **Phase 1 App Shell**
2. **Phase 2 Seed Data Model**
3. **Phase 3 Write Experience**
4. **Phase 4 Seed List & Detail**
5. **Phase 5 Gentle Resurfacing**
6. **Phase 6 Transform Actions**
7. **Phase 7 Garden View**
8. **Phase 8 AI Assist Preparation**

## 1PRあたりの推奨範囲
- Phase 1: 画面枠と遷移のみ（データ接続しない）
- Phase 2: Seed型 + Repository + ローカルCRUDのみ
- Phase 3: Write最短入力と任意メタ入力のみ
- Phase 4: 一覧/検索/詳細/更新の見返し導線のみ
- Phase 5: 今日の種表示と軽量再浮上ロジックのみ
- Phase 6: テンプレ変換UI + 保存のみ（AIなし）
- Phase 7: 軽量Garden表示のみ（非3D）
- Phase 8: AI接続点の定義のみ（本接続なし）

## 途中レビューのポイント
1. コンセプト逸脱（メモアプリ一般化、タスク管理化）を起こしていないか
2. 書くハードルを上げる必須入力が増えていないか
3. MVP外の重機能（AI前提/認証/課金/クラウド/重可視化）が混入していないか
4. Phase完了条件を満たす最小実装になっているか
5. 次Phaseへ引き渡す成果物が明確か

## 各Phaseで人間確認が必要な可能性がある箇所
- Phase 1: 画面導線の分かりやすさ、トーンの適合性
- Phase 2: データ項目の過不足（特に再浮上・変換保存・将来移行）
- Phase 3: 「低圧」文言と入力負担
- Phase 4: 一覧の情報密度と検索性のバランス
- Phase 5: 再浮上頻度/理由表示が義務感を生まないか
- Phase 6: 変換結果が押し付けになっていないか
- Phase 7: 見た目優先で重くなっていないか
- Phase 8: AI未接続時の完全フォールバックが担保されるか

## Cloud Agentに次に渡すべきIssue/タスク文
1. 「Phase 1 App Shell 実装: Home/Write/Seeds/Seed Detail/Gardenの最小画面枠と遷移を実装。仮データのみ。永続化・AI・重UIは実装しない。」
2. 「Phase 2 Seed Data Model 実装: Seed型、Repository抽象、ローカルCRUDを実装。Phase 3〜7が必要とする項目を満たす。クラウド同期は行わない。」
3. 「Phase 3 Write Experience 実装: 一言入力中心、タイトル非必須、任意メタ入力で低圧保存体験を実装。分類強制を入れない。」
4. 「Phase 4 Seed List & Detail 実装: 一覧/検索/フィルタ/並び替え/詳細更新を実装し、再会と育成の基盤を固める。」

## 実装前チェックリスト
- [ ] docs/mvp.md と docs/phase-roadmap.md を読み、今回Phase範囲を固定
- [ ] docs/non-goals.md を読み、禁止事項を確認
- [ ] docs/phase-contracts.md の該当Phase契約を確認
- [ ] 変更が1PRでレビュー可能な大きさか確認
- [ ] PR本文テンプレ項目（Phase/実装したこと/未実装/テスト/次Phase）を準備
