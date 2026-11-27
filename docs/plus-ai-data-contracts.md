# Plus の AI 提案・データ・保存契約

設計日: 2026-11-27。確認した実装: `aef86a3433c3b1b5dae266c7419ae7083099b7f9`。

**本書は設計案・未実装。記載した型、API、保存版、制限値、受入試験は、現在提供している機能や実行済みの試験ではない。**

## 1. 対象と正本

本書は [Plus の体験設計](plus-experience-design.md)を、後続の実装で守れるデータ契約にする。[地図](plus-map-design.md)、[アトリエ・作品集](plus-atelier-collection-design.md)、[販売・検証](plus-commerce-validation.md)、[実装順](plus-implementation-plan.md)と併せて読む。

無料の「残す → 本人がつなぐ → 図で見る → 本人の言葉で芽にする」は維持する。AI は、本人に見えていなかった関係や、本人が求めた短い見方・タイトル・構成を**候補として**示す。原文、確定した接続、芽、作品を自動変更しない。長文の代筆・自動分類・自動公開・クラウド同期は初回販売の対象外。

### 現行との差

| 現行の根拠 | 現在の状態 | 本設計で追加するもの |
| --- | --- | --- |
| [types.ts](../src/domain/types.ts) | `SeedConnection` が無向接続の正本。`Seed.synthesis` は現在の芽を1件保持 | 候補、材料の版、地図表示、アトリエ、作品集、権限を別データとして保持 |
| [aiAssist.ts](../src/domain/aiAssist.ts) | `LocalOnlyAiAssistService` は常に `undefined` を返す準備用実装 | 送信同意、サーバー経由の提案、検証済み結果の受領。現行を実 AI と表示しない |
| [links.ts](../src/utils/links.ts) | 共通の言葉・カテゴリから理由つきのローカル候補を提示 | 語が一致しない関係の候補。ローカル候補は無料で残す |
| [gardenModel.ts](../src/data/gardenModel.ts) | v2 正規化は既知の項目を再構成し、追加した未知項目を保持しない | v3 の明示的な型・検証・移行。v2 に任意の項目を足すだけで済ませない |
| [gardenStorage.ts](../src/data/gardenStorage.ts)、[gardenWriter.ts](../src/data/gardenWriter.ts) | 単一 writer、主保存と lastGood、削除中 marker | 同じ保存原則を拡張。サーバーとの通信を端末保存と同一トランザクションと呼ばない |
| [gardenCommands.ts](../src/domain/gardenCommands.ts) | 接続と芽の更新をコマンド化し、材料の期待文章を照合 | 提案採用・版保存・作品固定を追加。既存コマンドの照合を迂回しない |
| [exportFormat.ts](../src/utils/exportFormat.ts) | JSON v2 と通常テキスト。取り込み UI はない | 全データ JSON v3 と作品の書出し。旧 JSON の意味と読める書出しを保持 |

[中核データ設計](core-growth-data.md)の原文保持・接続・芽の契約を引き継ぐ。実装状況は [中核の進捗記録](core-growth-progress.md)で確認し、過去の設計文書内の「未実装」を現在のコードの不在と取り違えない。

## 2. 関係・文章の意味を守る

### 2.1 AI が提案する関係

初回は次の種類を扱う。分類は提案理由を読みやすくするためのもので、原文の事実や本人の心理の断定ではない。

| `relationKind` | 表示例 | 根拠と仮説の分け方 |
| --- | --- | --- |
| `shared_question` | 同じ問いを考えているかもしれません | 両原文の問い・課題を引用し、同じ意図と断定しない |
| `goal_means` | この方法が手がかりになるかもしれません | 一方の目的と他方の方法を引用し、実現可能性は仮説とする |
| `constraint_resource` | この条件を補えるかもしれません | 制約と資源・習慣を示す。解決できると保証しない |
| `complementary_views` | 一緒に考えると見え方が変わるかもしれません | 異なる視点を示し、矛盾や価値観の問題と断定しない |
| `different_context` | 別の場面にも使えるかもしれません | 共通しそうな構造を説明し、適用に必要な条件を一言添える |

例は製品デモ用の架空データとして明示する。

- 「説明を読まずに遊べる入口を作りたい」と「音をまねる遊びにはすぐ参加してくれた」: 原文には課題と観察がある。「まねして参加する入口を考える材料になるかもしれない」が仮説。
- 「長い日記は続かない」と「散歩の写真は自然に撮り続けている」: 記録方法の制約と続く習慣が根拠。「写真を入口に記録を考えられるかもしれない」が仮説。
- 「話し始めやすい場所」と「黙って過ごせる場所」: 二つの希望が根拠。「同じ場所での両立を考えられるかもしれない」が仮説。

1処理につき最大3件。根拠が弱ければ0件でよい。関連度の百分率を正しさとして見せない。気分・記録日時・課金額だけから意味の関係を作らない。

### 2.2 四つのデータを混ぜない

| データ | 意味 | 自動で起こさないこと |
| --- | --- | --- |
| `ConnectionProposal` | AI またはローカル計算による未確定の関係候補 | 接続数の増加、本人の理由欄への転記 |
| `SeedConnection` | 本人が個別に結んだ実際の無向接続 | 親子・因果・同一テーマの断定 |
| 地図の表示上のまとまり | 配置・折りたたみ・本人の整理のための表示 | 接続、Seed の合体、カテゴリの自動変更 |
| 材料の選択・引用 | 一つの考えを検討するために読んだ文章 | Connection の作成、芽の採用、作品集掲載 |

A–B と B–C があっても A–C を作らない。候補の描画・クラスタの展開で隣接表を変更しない。無料の局所マップは直接接続だけを示す契約を継続する。有料の全体表示でも、線の正本は `connections` のまま。

## 3. 候補の状態と本人による採用

候補は「本人の判断」と「今も根拠を使えるか」の2軸で保存する。状態を一つの文字列にまとめて、原文変更で採用済みという事実を消さない。

| 操作・変化 | `decision` | `availability` | 保存・表示 |
| --- | --- | --- | --- |
| 検証済み候補を受領 | `pending` | `ready` | 候補の枠にだけ表示 |
| 本人が1件を採用 | `accepted` | 直前に `ready` を確認 | Connection と decision を同じ端末保存で確定 |
| 本人が見送る | `dismissed` | 状態は保持 | ペアの抑制設定を保存し、次回起動にも反映 |
| 使った原文・芽の文章を編集 | 変更しない | `stale` | 未採用候補は採用不可。「材料が変わりました」 |
| 原種の削除、参照欠落、自動収集した対象の除外 | 変更しない | `unavailable` | 候補本文・引用を通常画面から除く |
| 新しい版で再検討 | 古い候補を戻さず新 ID | 新候補として検証 | 古い判断を消さない。見送りは解除しない |

- 採用前に、両方の原種・選択部分・digest・権限世代・既存接続を再確認する。
- 本人の採用により作る Connection の `origin` は既存の `manual`。AI が本人の代わりに結んだという種別は追加しない。由来は候補側の `acceptedConnectionId` に保持する。
- AI の理由を `SeedConnection.note` に自動コピーしない。本人が内容を読んで任意に残す操作を別にする。
- 「すべて採用」は初回範囲外。候補1件ごとに判断できる。関係を検討するだけなら「アトリエの材料にする」でよく、接続は増やさない。
- 既に手動接続されていたら「つながっています」とし、件数・作成日時・本人メモを変えない。
- 原文変更で古い AI 根拠が失効しても、本人が作った Connection を勝手に消さない。現在の接続と古い提案理由の有効性は別に扱う。
- 見送りキーは正規化したペア。モデルや関係分類を変えて再提案しない。原文の軽微な変更でも抑制を解除しない。本人の「見送った候補を戻す」だけで再検討対象へ戻す。
- 採用後に本人が線を外したペアも再提案を抑制する。元の `accepted` は過去の判断として残し、現在の接続の有無は Connection から読む。
- 現行のローカル見送り設定を移行し、AI とローカルの両方に適用する。手動検索・手動接続を妨げない。

## 4. 送信許可・表示対象・派生データ

### 4.1 三つを独立に扱う

1. **自動発見の対象**: 自動候補、AI が自動で探す材料、地図の推薦、自動のまとまり案に使ってよいか。
2. **外部 AI への送信**: 本文・題名・引用・埋め込み生成用入力を外部処理へ渡してよいか。
3. **作品の外部書出し**: 本人が今回選んだ作品・原文・図を共有先へ書き出す操作。

自動発見の対象に含めても送信許可にはならない。AI へ送信できても公開許可にはならない。`discovery: exclude` の種は自動候補・推薦の件数・自動まとまり名に使わないが、**本人の全件検索・一覧・明示選択・手動接続・自作 MapView からは消さない**。記録全体を隠す設定は今回追加しない。本人が選んだ材料をアトリエで読むことも妨げない。

自動発見から外した種を本人が今回の AI 処理の材料として明示選択する場合は、その範囲を送信プレビューへ明記し、別途 `externalAi` と由来を確認する。自動の候補収集へ戻したり、明示選択を永続的な対象復帰として保存したりしない。

### 4.2 初期値と同意

- 既存・新規データとも `externalAi: unasked`。これは送信可能ではない。既存データ移行、Plus 購入、復元、試用開始で同意を作らない。
- `deny` は本人が「AI に送らない」と指定した状態。同意画面の一括ボタンで上書きしない。
- `allow` は送信対象の候補にできる状態。処理時にはサービスの説明への同意と、今回の材料を特定した `ConsentReceipt` が必要。
- `unasked` の選択材料は、本文の抜粋・件数・送信先・目的を示し「今回だけ使う」を選べる。永続設定を `allow` に変えない。
- 同意前は外部への検索・埋め込み・生成を一切実行しない。実データを送っていないのに「あなたのメモで結果が見つかった」と表示するデモも作らない。
- 同意対象には引用した材料だけでなく、探索のために送る候補集合全体を含む。全庫検索のように案内して、未送信のローカル領域まで調べたと見せない。

### 4.3 送信禁止の伝播

- `SourceSnapshot`、芽の `sources`、アトリエ版、作品、AI 出力に、由来となる原種の ID と版を保持する。本文を再帰的に複製せず、由来の参照集合を辿る。
- 派生物の送信可否は、現在の全由来に対して再計算する。一つでも `deny`、削除済み、参照不明があれば送信しない。別の作品へコピーして許可をリセットしない。
- AI 出力は引用に使った2件だけでなく、**モデルが入力として読んだ全材料**を `processingRootSeedIds` に持つ。引用が省かれた材料からの影響も非送信規則の対象になる。
- 現行の芽は `synthesis.sources` の由来を辿る。循環参照は visited set で停止し、不明な由来は `unknown` とする。不明なまま送信可にしない。
- 原種を材料一覧から外すだけでは、既に書かれた派生文章の由来を自動で消さない。出力を本人が言い換えても、自動で送信可能に戻さない。
- 制限を外して再利用したい場合は、許可された材料だけで別案を作り、送信範囲を再確認する。本人の任意の手入力に潜む由来まで完全に検出できるとは約束しない。
- ローカル検索用の意味ベクトルも派生データ。外部で作るなら元文と同じ同意が必要。ベクトルを匿名データとみなして送信しない。

### 4.4 取り消しと削除の通信

送信許可変更時は、同じローカルコマンドで `permissionEpoch` を進め、関連する待機要求・未採用候補を無効化し、サーバー取り消し要求を outbox に残す。以後のローカル送信は直ちに止める。

サーバーは取り消しを受領したら、未実行の処理を取り消し、実行中の処理は可能な範囲で中断し、結果・関連キャッシュ・検索索引を削除する。取り消した要求の後着結果を再配送しない。削除確認は request ID と処理世代だけを返し、本文を含めない。

**既に送られたデータを送信前に戻すことはできない。** オフライン中はサーバーへ取り消しが届いていないため、画面では「端末で停止済み／サーバー処理の確認待ち」を区別する。外部事業者の保存・削除条件は採用モデル決定時に確認し、満たせない条件を約束しない。

全データ削除には、端末削除とサーバー削除の2段階の進行を表示する。本文を含まない削除待ち ticket は遠隔削除確認まで必要最小限保持し、確認後に除く。端末の本文を削除するために通信回復を待たせない。「すべて削除完了」は対象が確認できた後だけに使う。

## 5. 追加データモデル（設計案・未実装）

以下は実装の境界を固定するための型案。既存の `Seed`、`SeedConnection`、`SeedSynthesis` の意味を変更するものではない。時刻は ISO 8601、ID は衝突しない生成規則で作る。

```ts
// 設計案・未実装。SourceRef は本文/芽などの部分まで含む安定参照。
type SourceRef = {
  seedId: string;
  part: 'body' | 'synthesis';
  synthesisId?: string; // synthesis の場合は必須
};
type SourceVersion = {
  ref: SourceRef;
  textDigest: string; // 端末で計算。送信時は要求内のopaque tokenへ置換
  updatedAt: string;
};
type Lineage = {
  rootSeedIds: string[];
  status: 'known' | 'unknown';
};
type SourceSnapshot = {
  id: string;
  source: SourceVersion;
  text: string;
  title?: string;
  capturedAt: string; // 実際に版を保存した時刻。原文の作成日時ではない
  lineage: Lineage;
};
type SeedPermission = {
  seedId: string;
  externalAi: 'unasked' | 'allow' | 'deny';
  discovery: 'include' | 'exclude'; // 自動発見のみ。本人の検索/一覧を隠さない
  epoch: number;
  changedAt: string;
};
type ConsentReceipt = {
  id: string;
  requestId: string;
  policyVersion: string;
  providerDisclosureVersion: string;
  purpose: 'connection_proposals' | 'atelier_suggestions';
  sources: Array<{
    source: SourceVersion;
    snapshotId?: string;
    versionMode: 'current' | 'historical';
    liveTextDigestAtConfirmation: string;
    permissionEpoch: number;
    selection: 'automatic_in_confirmed_scope' | 'explicit';
  }>;
  confirmedAt: string;
  expiresAt: string;
};
type Evidence = {
  source: SourceVersion;
  quote: string;
  start: number; // 実際に送った文字列のUTF-16 code unit offset
  end: number;
};
type ConnectionProposal = {
  id: string;
  requestId: string;
  resultId: string;
  pair: [string, string]; // Seed ID昇順、自己参照不可
  relationKind: 'shared_question' | 'goal_means' | 'constraint_resource'
    | 'complementary_views' | 'different_context';
  evidence: Evidence[]; // 両端の根拠を最低1つずつ
  hypothesis: string; // 断定でなく、なぜ一緒に見る提案か
  processingRootSeedIds: string[];
  decision: 'pending' | 'accepted' | 'dismissed';
  availability: 'ready' | 'stale' | 'unavailable';
  unavailableReason?: 'source_deleted' | 'source_missing' | 'scope_excluded'
    | 'consent_revoked' | 'result_invalid';
  acceptedConnectionId?: string;
  decidedAt?: string;
  inputFingerprint: string;
  permissionEpochs: Record<string, number>;
  createdAt: string;
};
type ProposalSuppression = {
  pair: [string, string];
  reason: 'dismissed' | 'connection_removed';
  createdAt: string;
};
type MapScope =
  | { kind: 'selection'; seedIds: string[] }
  | {
      kind: 'query';
      query: {
        queryVersion: 1;
        text: string;
        tags: string[];
        tagMode: 'any' | 'all';
        growthStates: Array<'seed' | 'sprout' | 'tree' | 'archived'>;
        connection: 'all' | 'linked' | 'unlinked';
        hasSynthesis?: boolean;
      };
    };
type MapFocus =
  | { viewMode: 'overview'; centerSeedId?: never; expandedHop?: never }
  | {
      viewMode: 'neighborhood';
      centerSeedId: string;
      expandedHop: number; // 初期1。本人が追加表示した実接続の段数
    };
type MapView = {
  id: string;
  revision: number;
  name?: string;
  scope: MapScope;
  layoutVersion: number;
  positions: Record<string, { x: number; y: number; pinned: boolean }>;
  displayGroups: Array<{ id: string; seedIds: string[]; label?: string; collapsed: boolean }>;
  viewport: { x: number; y: number; scale: number };
  selectedSeedId?: string;
  updatedAt: string;
} & MapFocus;
type MapReturnContext = {
  mapViewId?: string;
  mapRevision: number;
  scope: MapScope;
  focus: MapFocus;
  viewport: MapView['viewport'];
  expandedGroupIds: string[];
  selectedSeedIds: string[];
  navigationTrail: string[];
  focusedControlId?: string;
  listScrollOffset?: number;
};
type AtelierProject = {
  id: string;
  title?: string;
  centerSeedId?: string;
  status: 'drafting' | 'archived';
  branches: Array<{ id: string; name?: string; headRevisionId?: string }>;
  activeBranchId: string;
  originNavigation?: MapReturnContext;
  createdAt: string;
  updatedAt: string;
};
type AtelierDraft = {
  projectId: string;
  branchId: string;
  baseRevisionId?: string;
  text: string;
  materials: Array<{
    snapshotId: string; // 材料選択時の文章。毎入力で複製しない
    versionMode: 'current' | 'historical';
  }>;
  pinnedExcerpts: Array<{ id: string; text: string; start: number; end: number }>;
  insertedSuggestionIds: string[];
  lineage: Lineage;
  editRevision: number;
  updatedAt: string;
};
type AtelierRevision = {
  id: string;
  projectId: string;
  branchId: string;
  parentRevisionId?: string;
  text: string;
  title?: string;
  materialSnapshotIds: string[];
  pinnedExcerpts: Array<{ id: string; text: string; start: number; end: number }>;
  insertedSuggestionIds: string[];
  lineage: Lineage;
  savedAt: string;
};
type AtelierSuggestion = {
  id: string;
  requestId: string;
  resultId: string;
  projectId: string;
  branchId: string;
  baseEditRevision: number;
  baseTextDigest: string;
  kind: 'perspective' | 'title' | 'outline';
  content: string;
  evidence: Evidence[];
  processingRootSeedIds: string[];
  permissionEpochs: Record<string, number>;
  decision: 'pending' | 'inserted' | 'dismissed';
  availability: 'ready' | 'stale' | 'unavailable';
  insertedAt?: string;
  createdAt: string;
};
type AdoptionRecord = {
  id: string;
  atelierRevisionId: string;
  centerSeedId: string;
  synthesisId: string;
  previousSynthesisSnapshotId?: string;
  adoptedAt: string;
};
type CollectionItem = {
  id: string;
  currentRevisionId: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};
type CollectionRevision = {
  id: string;
  itemId: string;
  previousRevisionId?: string;
  kind: 'word_card' | 'map_and_text_page';
  templateId: 'word_card_v1' | 'map_text_v1';
  styleVersion: number;
  outputSpecVersion: number;
  title?: string;
  textSnapshot: string;
  atelierRevisionId?: string;
  synthesisRef?: SourceVersion;
  materialSnapshotIds: string[];
  mapSnapshot?: {
    viewId?: string;
    positions: MapView['positions'];
    nodes: Array<{
      seedId: string;
      labelSnapshot: string;
      sourceSnapshotId: string;
    }>;
    confirmedConnections: Array<{
      id: string;
      aSeedId: string;
      bSeedId: string;
      noteSnapshot?: string;
    }>;
    layoutVersion: number;
  };
  lineage: Lineage;
  savedAt: string;
};
type CollectionExportReceipt = {
  id: string;
  itemId: string;
  collectionRevisionId: string;
  format: 'text' | 'png' | 'pdf';
  outputSpecVersion: number;
  createdAt: string;
};
type CollectionDraft = {
  itemId: string;
  baseCollectionRevisionId: string;
  title?: string;
  text: string;
  editRevision: number;
  updatedAt: string;
};
```

### 型の不変条件

- `SourceVersion.textDigest` は選択した文章の一致判定に使う。タグ変更だけで本文を別版にしない。digest は暗号化や匿名化ではない。
- `MapView` は表示状態。原文・実接続を複製する正本にはしない。表示上のまとまりに置いても Connection は増えない。
- `scope.kind: selection` は本人が固定した集合で、新規メモを無断追加しない。`query` は保存した条件を現在の原文へ適用する動的集合。両方の優先順位を曖昧にせず、画面に種類を表示する。queryは構造化した条件であり、任意コード・任意SQL・未検証の式として実行しない。
- 全体/周辺はscopeと別の表示軸。周辺の初期値は実接続1段、本人の「もう一段見る」でのみexpandedHopを増やす。表示を広げても線は実際のConnectionだけ。scope外の検索結果を開いても固定集合を変更しない。
- `MapReturnContext` はアトリエ等からの端末内の戻り文脈。IDだけでなく範囲・焦点・位置・展開・選択・読み上げの戻り先を保持する。元の地図が変更/削除されたら、残る種へ戻し変更を説明する。古い戻り文脈で現在のMapViewを上書きしない。AIに送信しない。
- `AtelierDraft` は現在の作業内容。材料の選択時にSourceSnapshotを1度だけ保存し、その参照を下書きと同じ更新で確定する。原文編集・再起動で「選んだ時の文章」を失わない。各入力で本文snapshotや履歴を増やさず、既存下書きと同様に短いdebounceでまとめて保存する。
- 材料は当時/現在を区別する。原文が変わったら、現在の文章へ選び直すか「当時の材料のまま残す」へ明示的に切り替える。後者ならそのsnapshotを使った文の編集・節目の版保存・作品化は可能。本人がその判断をするまで入力を消さず、過去文を現在文として確定しない。
- `AtelierRevision` は本人が「版を残す」等で確定した節目だけ。未変更版は作らず、同じ材料 snapshot を再利用する。過去版を黙って削る件数上限も設けない。保存量・速度の検証後に明示的な整理方法を追加する。
- 本人が固定した一節を AI 採用で変更しない。候補の挿入場所を本人が選び、固定範囲と重なる操作は拒否する。本人自身の変更も「固定を外す」後に行う。
- 固定一節はID・本文一致・位置を併用し、前方の編集で範囲を移動させる。同じ文が複数ある場合に文字列検索で別の一節へ付け替えない。
- `CollectionItem` は私的な作品のID・順序・現在版参照。実際の固定文面/図はimmutableな`CollectionRevision`へ保存する。本文編集は編集用下書きで行い、本人の確定で新しい版とcurrentRevisionIdを同時保存する。原文変更で自動更新しない。
- 作品の地図 snapshot は選択時のラベルと位置を保持するため、本文を含み得る派生データとして扱う。AI 未採用候補を確定線に変換して保存しない。
- 作品の確定線は当時の両端・必要な理由のsnapshotを持ち、現在のConnection IDは由来参照として併存する。元接続の解除だけで作品から線を消さない。原種の削除時はlabel/noteを含む引用のマスク契約を優先する。
- template/style/outputSpecの版とCollectionExportReceiptの対象版を対応させる。出力済みファイルを現在版に見せない。スタイルを更新しても既存作品へ無断適用せず、現在の組版で作り直す操作と保存当時の版を読む操作を分ける。
- `AtelierSuggestion` を下書きに入れても、版の確定・芽の採用・Connection・作品集掲載は行わない。
- 既存 `Seed.synthesis` の現在1件という約束は維持する。アトリエの枝を Seed の複製や複数の現在芽として保存しない。
- v3 でも `Seed` 自体の既存フィールドは保持できるため `Seed.schemaVersion: 2` を継続する案とし、Envelope の `storeVersion` を3にする。Seed に非互換な追加変更が必要なら、その PR で別途版を上げ、移行を追加する。

## 6. AI 入出力と根拠の検証（設計案・未実装）

### 6.1 送信まで

1. 本人が「つながりの候補を見る」またはアトリエの候補種別を選ぶ。
2. 端末で削除・見送り・既存接続・権限を先に確認し、自動の材料収集では discovery除外を先に除く。本人が今回明示した材料はその選択を記録し、送信可否を別に確認する。全メモをサーバーへ送り、サーバー側で除外する順序にしない。
3. 本人が選んだ探索範囲から、近い候補と異なる文脈の候補を混ぜて最大16件の材料集合を作る。語句・タグの一致だけで絞り切らない。具体的な取り方は次項に従う。
4. 長文は送信する抜粋と前後の必要な文脈を確認できるようにする。黙って末尾を切り、全文を理解したような提案をしない。
5. 固定した材料・版・権限世代・目的を `ConsentReceipt` に記録して送る。過去の材料を本人が選ぶ場合はhistoricalと明示し、送るsnapshotのdigestと、確認時の現在原文のdigestを別々に持つ。題名、気分、大切度、全接続網、アカウント個人情報は目的に不要なら送らない。
6. 原種 ID は要求内だけの opaque alias に置き換える。サーバーが原種へ勝手に追加アクセスする API は作らない。

### 初回の探索集合を偏らせない

本人が範囲だけを選んだ場合、初期案は中心1件、語句・タグ等で近い候補を最大5件、異なる本人の表示グループ/カテゴリから最大5件、古い記録・未接続・まだ今回選ばれていない範囲から最大5件とする。重複を除き、不足分は許可された残りから補う。手動で選んだ材料を黙って置き換えず、最大16件に収まらないときは本人が範囲を絞る。古さ・未接続は探索を多様にする選び方であり、関係があるという根拠には使わない。

削除・自動発見除外・見送り等を先に適用し、サンプリング方法と実際の材料を端末に記録する。送信前には**今回AIが読む実際の最大16件**を確認でき、追加・除外・別の組み合わせを本人が選べる。「対象範囲の全N件を意味検索した」とは案内しない。二者を最初から本人が指定した場合も扱うが、それだけを唯一の探索方法にしない。

同じ材料数・同じモデル予算で、語一致のみの選び方と上記の多様な選び方を比較し、異なるテーマ間に有用な関係が出るかを人が評価する。弱い関係や過剰な断定が増えた場合も記録する。埋め込みによる全庫索引は、独立した同意・保存/削除・費用検証を伴う後続機能であり、初回を自動全庫探索として宣伝しない。

### 6.2 要求・結果の最小契約

以下も設計案・未実装。サービス名、実際の HTTP パス、モデル ID は実装 PR で確定し、本契約の意味を保持する。

```ts
type AiProposalRequest = {
  requestId: string;
  contextId: string;
  contextGeneration: number;
  purpose: 'connection_proposals' | 'atelier_suggestions';
  inputFingerprint: string;
  consentReceiptId: string;
  sources: Array<{ alias: string; text: string; versionToken: string }>;
  selectedPairs?: Array<[string, string]>;
  atelier?: { kind: 'perspective' | 'title' | 'outline'; text?: string };
};
type AiProposalResult = {
  requestId: string;
  resultId: string;
  inputFingerprint: string;
  modelVersion: string;
  promptVersion: string;
  proposals: unknown[]; // schema検証完了までドメイン型として扱わない
  quota: { reservationId: string; state: 'reserved' | 'committed' | 'released' };
};
type AiServiceError = {
  requestId: string;
  code: 'consent_required' | 'permission_changed' | 'scope_invalid'
    | 'entitlement_required' | 'quota_exhausted' | 'rate_limited'
    | 'input_too_large' | 'timeout' | 'provider_unavailable'
    | 'invalid_output' | 'no_valid_proposals' | 'cancelled'
    | 'stale_result' | 'result_expired' | 'request_conflict';
  retryable: boolean;
  retryAfter?: string;
  quotaState: 'none' | 'reserved' | 'committed' | 'released';
  publicMessage: string;
};
```

### 6.3 サーバーと端末で検証する

- モデルの出力は schema、最大件数、文字数、許可した alias、関係種別を検証する。存在しない source、自己ペア、重複ペアを拒否する。
- `quote === sentText.slice(start, end)` を完全一致で照合する。引用は両原種に必要。Unicode 正規化で原文を勝手に変換せず、絵文字・結合文字・同じ文が複数ある場合を試験する。
- 引用一致は「解釈が正しい」保証ではない。仮説文に引用にない出来事・感情・因果を加えないことを別に評価する。
- 端末では応答時と採用時の両方で、選択版のdigest、確認時の現在原文のdigest、権限世代、送信対象、削除状態、contextGenerationを検証する。historicalでは明示されたsnapshotが根拠であることを表示し、現在の文章と一致したように見せない。処理中の現在原文の変更はhistoricalを選んだ場合も結果再確認の対象にする。
- 候補のタイトルと本文を HTML や実行可能 Markdown として評価しない。外部リンクを自動で開かない。
- 材料内の「前の指示を無視」「他のメモを送れ」等はメモ本文として扱う。モデルに外部検索・ファイル操作・送信・接続更新のツール権限を与えない。instruction と source data を構造上分離する。
- アトリエの短文候補は最大3案、各案は見方・タイトル・短い構成に限定する。本人の下書きが入力に含まれる場合も、全由来の許可を確認する。
- 「下書きへ入れる」は、提示した挿入位置・期待文章・`baseEditRevision`・digest を再確認し、1回のコマンドで挿入記録と下書きを保存する。本文が変わっていたら候補を自動で挿入し直さず、入力を残して再確認する。

## 7. 非同期処理・消費枠・秘密情報

### 7.1 要求の再送と応答順

- `requestId` は最初に一度生成し、同じ入力の再送で変えない。サーバーは利用者＋requestId＋inputFingerprint を照合する。同じ ID で異なる入力は `request_conflict`。
- 同じ requestId は既存の処理状態・結果を返す。タイムアウト直後に新しい ID で二重発注しない。
- 作成した材料集合を編集したら別 contextGeneration にする。旧要求が後から戻っても新しい画面や候補を上書きしない。
- 戻る・取消・全削除で、端末は結果を採用しない状態へ直ちに進める。サーバー取消は別に追跡する。取消要求を送ったことだけでサーバー完了と表示しない。
- timeout は成否不明。自動再実行より先に同じ ID の状態を確認する。0件を得るまで自動再生成するループは作らない。

### 7.2 利用者の枠と実際の原価

販売上の枠・試用・更新期間は [販売設計](plus-commerce-validation.md)を正本とする。**有効な候補を利用可能な形で届けた1処理**を1単位とし、候補の件数や採用件数を課金単位にしない。

1. 要求開始時に枠を `reserved` にする。
2. schema・根拠・現在版を検証し、端末の単一 writer で結果を保存する。失敗なら利用可能な結果とは扱わない。
3. usable 受領確認を outbox に残し、サーバーで `committed` にする。同じ受領確認の再送は追加消費しない。
4. 通信・解析失敗、根拠不正、有効候補0件、配送前の stale、取消は `released`。同じ結果の再配送も追加消費しない。
5. 有効な候補を届けた後の本人の見送り・採用しない判断は、成功した1処理の消費を取り消さない。見送る操作で追加消費はしない。配送後の原文編集も既存消費を増減させない。

端末保存とサーバー確定は分散した処理であり、完全な同時成功を前提にしない。受領確認の再送・予約照会を実装し、成否不明の要求を二重消費させない。枠状態が不明なら次の有料要求だけを一時停止し、無料の保存・閲覧は続けられる。

失敗時も provider 原価は発生し得る。利用者枠を返すことと、サーバーの原価計上を別にする。悪用・0件連打への抑制は以下の技術上限と全体予算で行い、失敗を成功扱いして枠を消費させない。

### 7.3 初期の技術上限（検証値・未実装）

| 対象 | 初期の上限 | 扱い |
| --- | --- | --- |
| 同時要求 | 利用者ごと1件 | 別要求で置換せず、待機・取消を選べる |
| 新規要求の速度 | 直近60秒で3件 | 同じ requestId の状態照会・再配送は新規に数えない |
| 新規要求数 | 直近24時間で60件 | 販売枠とは別。正常な利用を妨げるなら発売前に改定 |
| 1要求の材料 | 最大16件 | 範囲を表示し、追加対象は本人が選ぶ |
| モデル入出力 | 入力12,000 token／出力1,500 token以下 | tokenizerで計測。日本語の文字数をtoken数として扱わない |
| 有効候補 | 最大3件 | 根拠のない埋め合わせをしない |
| 処理の待機 | 20秒で待機案内、provider 実行上限60秒 | 上限後は結果照会へ。新規の自動再発注なし |
| 予約・結果の再取得 | 最大24時間 | 期限後は `result_expired`。自動で同じ処理を買い直さない |

技術上限を隠して「無制限」と販売しない。利用中は制限理由・再開時刻を示す。初回発売前に、実測原価、長文、日常利用の頻度から値を見直し、変更理由を記録する。

サーバーには1要求の最大原価、利用者別日次原価、サービス全体の日次・月次予算を設定する。値が未設定なら本番 AI を有効化しない。予算残高を原子的に予約し、競合要求で上限を越えない。残高不足ならモデル呼出し前に停止し、利用者枠を確定しない。モデルの公式単価を実装時点で確認し、token実績と実請求の差を定期照合する。モデルの無料枠・固定利益を前提にしない。

### 7.4 保存・秘密情報・モデル選定

- API キー、サーバー認証秘密、ストア署名検証の秘密をアプリ・リポジトリ・ログに入れない。アプリから provider を秘密キー付きで直接呼ばない。
- サーバーは購入権利・試用枠を検証し、利用者のデータ分離を行う。ローカルの Plus フラグだけを課金認証にしない。
- 原文は処理に必要な時間だけ扱い、解析・障害ログへ本文・題名・引用を出さない。結果再取得用キャッシュは暗号化して最長24時間。要求の本文を長期保存するキューを作らない。
- 冪等性・消費枠の台帳には ID、時刻、原価、状態、要求の keyed fingerprint を保持し、本文を保持しない。削除対象と、購入・原価処理で必要な本文を含まない記録を分けて説明する。
- provider 側の保存期間・学習利用・削除可能範囲を確認し、画面とポリシーに反映する。端末内の現行 AsyncStorage を本書追加だけで「暗号化済み」と案内しない。
- モデル名は未決。日本語の短文・曖昧な種・異分野の関係・根拠不在・prompt injection を含む評価で選定する。API 接続が成功しただけでは完成としない。

## 8. v3 保存と非破壊移行（設計案・未実装）

### 8.1 一つの意味データ Envelope

v3 は現行の seeds / connections / drafts に、permissions / sourceSnapshots / mapViews / atelierProjects / atelierDrafts / atelierRevisions / atelierSuggestions / adoptionRecords / collectionItems / collectionDrafts / collectionRevisions / collectionExportReceipts / connectionProposals / proposalSuppressions / AI request receipts / outbox を追加する。`storeVersion: 3`、`revision`、`lastMutationId` を持つ。

意味的に一つの操作となるデータは同じ writer に通す。Seed を保存してから別キーへ作品・許可を書き、途中失敗で半分だけ確定する方式は採用しない。購読状態の検証キャッシュは別でもよいが、購読失効で意味データを変更する保存処理を作らない。

主保存の完了が確定点であり、lastGood は補助。新しい型を v2 の normalize 関数へ渡して追加項目が消える実装を禁止する。必要な新配列の欠落・不正参照・重複 ID を「空配列に直した」として保存せず、読取保護と診断へ進める。

### 8.2 移行の順序

新キーは `kizashi-notes:garden:v3` と同じ版の lastGood。移行状態を記録する marker を用い、複数キーの更新をトランザクションと呼ばない。

入口は現行の検証済みload/normalize経路を再利用する。v1だけなら元文字列を保持してv1→v2相当の正規化結果から、完全新規なら空の確定状態から、v2 main破損・lastGood正常なら破損原本を退避した上で検証済みlastGoodからv3 stagingへ進む。移行記録に`source: v1 | empty | v2 | v2-backup`を残し、回復元を最新の正常mainと同一視しない。

1. 起動では全削除 marker を最優先する。次に移行 marker を確認し、未完了なら通常編集より先に再開する。
2. writer を止め、v2 原本・lastGood の元文字列を移行退避へ保存して読み直す。退避できなければ移行しない。v1 原本も全削除対象として保持する。
3. v2 の Seed ID・原文・既存芽・材料 snapshot・接続・日時・削除状態・下書きを保持する。追加配列は空、全 permission は unasked/include とし、既存の見送りペアを移行する。日時不明の接続や過去の履歴を新しく作らない。
4. v3 を staging キーへ書き、全文・ID・件数・既存の材料・復元下書きまで読み直して照合する。移行 marker に段階と ID を記録する。
5. 退避確認後、v2 の main と lastGood に `storeVersion: 3` の移行フェンスを置く。既存 v2 アプリの parser が未知版として止まるためのもので、v2 原本は退避から復旧できる。旧版へ戻して古い v2 を編集できる状態を成功としない。
6. v3 main を確定・照合し、active version を3として移行完了する。途中終了は staging・marker・フェンスの状態から再開し、古い v2 を最新として黙って復元しない。
7. 成功後も元データを自動で削除しない。ただし本人の全データ削除では v1/v2 退避、staging、フェンス、v3、lastGood、破損退避をすべて対象にする。

各段階の中断試験を必須にする。v3 が壊れている場合に v2 の退避を黙って最新データとして開かない。v3 不明版は自動保存を止める。旧アプリへのインストール戻しを逆移行と呼ばない。

フェンスが停止させることを確認できるのは、現行v2の「未知storeVersionなら保存停止」というparser経路である。v1アプリ等を含む全旧版の挙動まで保証しない。対応外旧版へのダウングレードを保存互換として案内しない。

### 8.3 現行の芽とアトリエを両立させる

- アトリエの初回表示は既存芽を読むだけで、現在の芽を変更しない。
- 本人が「この版を芽として残す」を選んだ時だけ、中心 Seed を明示し、原文・本人の文・選んだ材料を確認する。
- 中心原文は材料に含める。中心だけで芽にできる既存条件を維持する。
- 現行の expectedText と新しい digest を両方確認する。原文または選んだ芽が変わっていれば保存を拒否し、アトリエの入力は残す。
- 当時の材料を保持したアトリエ版は保存・作品化できるが、**現在の芽へ採用する操作では**現在原文を読み直し、採用する材料を選び直す。過去のsnapshotをcurrent材料として既存のexpectedText照合へ通す迂回を作らない。
- 既存芽の差替えは明示した見直し操作にする。同じ保存で旧芽の固定版・新しい現在芽・AdoptionRecord・対応下書きの確定を行う。
- 現在芽に渡す材料は現行 `SynthesisSource` と同じ body/synthesis。アトリエ全体を擬似 Seed にしたり、材料の材料を再帰コピーしたりしない。
- 芽にしただけで材料同士をつなげない。候補やアトリエの完成表示だけで growthState を変更しない。

## 9. 原文の編集・削除・引用・履歴

| 変化 | 未採用 AI 候補 | アトリエ・確定芽・作品 | 接続・再送信 |
| --- | --- | --- | --- |
| 原文/芽の本文編集 | `stale`、採用不可 | 固定版は維持し「材料に更新あり」。本人の更新操作だけで取り込む | 既存接続は保持。AI は新しい版で再確認 |
| タグ等の変更のみ | 使用した根拠に影響する場合だけ再検証 | 原文変更と誤表示しない | 使用していないメタ情報で digest を変えない |
| 原種の soft-delete | `unavailable`、引用を通常表示しない | 材料欄を「最近削除した種」に置換。固定文の引用もマスク | 原本・接続・snapshot は復元用に保持。新規採用・送信は禁止 |
| 原種の復元 | 古い候補を勝手に再表示しない | 材料を再参照できる。作品本文は再生成しない | 両端が有効なら既存接続を再表示 |
| discovery 除外 | 自動候補・推薦・自動まとまりから除外 | 本人の検索・一覧・明示選択・自作地図・既存作品は残す | 既存接続を解除せず、手動接続も維持 |
| externalAi を deny | 未完了要求取消、後着結果破棄 | 本人の文は残す。派生物の新規 AI 送信も禁止 | 送信キャッシュ・索引を削除対象へ |
| 接続解除 | 同じペアを再推薦しない | 材料 snapshot と作品は保持 | 該当 Connection だけ除去 |
| 全データ削除 | 候補・要求結果も削除 | snapshot、版、作品、書出し cache、下書きも対象 | 古い応答・outbox再実行から復活させない |

本人が書いた芽・作品本文は、材料の削除だけで勝手に部分削除しない。ただし独立した本文にも削除済み材料の内容が残り得るので、書出し前に「削除した材料を使っている箇所があります」と対象を示して本人が確認できるようにする。自動の由来欄・引用はマスクし、本人の文章を機械的に書換えない。

初回は個別の永久削除を追加しない。既存の「最近削除」と全データ削除の契約を維持する。個別永久削除を後で追加する場合は、全派生コピー・索引・バックアップ・作品中の引用をどう扱うかを先に定義する。

アトリエの版・作品固定日時は、機能を使い始めてから実際に記録する。既存の `updatedAt`、芽の `promotedAt`、現在残る接続だけから全編集履歴や過去の心境を復元しない。事実として表示できる日付と AI の見立てを分ける。

## 10. コマンドと更新の原子性

各コマンドは最初に commandId と生成する ID を固定する。直前の `lastMutationId` だけに依存せず、生成ID・版ID・決定状態・要求IDの照合でも冪等にする。

| コマンド案 | 同じ端末保存で確定するもの | 拒否する条件 |
| --- | --- | --- |
| `receiveProposals` | 検証済み候補、受領記録、消費枠受領確認 outbox | digest/epoch/context不一致、重複、不正根拠 |
| `acceptConnectionProposal` | 1件の `manual` Connection、候補判断 | stale、削除、対象外、既に見送り |
| `dismissProposal` | 判断、正規化ペアの抑制 | 存在しない候補 |
| `updateSeedPermission` | 新権限世代、候補の無効化、取消outbox | 古い期待世代からの更新 |
| `saveAtelierDraft` / `selectAtelierMaterial` | 最新の下書き・選択時snapshot参照・固定一節・由来 | 別の baseEditRevision、固定文の無断変更、新しい削除済み材料採用 |
| `insertAtelierSuggestion` | 指定位置への取込、由来、inserted記録 | 本文/材料/権限変更、固定範囲への侵入 |
| `saveAtelierRevision` | immutable版、snapshot参照、枝のhead | current材料の不一致、当時版を使う明示判断なし、異なるheadからの上書き。本人の本文入力は保持 |
| `adoptAtelierRevision` | 旧芽控え、現在芽、採用記録、状態 | 中心/材料変更、明示されていない既存芽差替え |
| `saveCollectionItem` / `saveCollectionRevision` | immutable作品版、現在版参照、必要な地図snapshot、由来、対応下書き確定 | 不明版、別の現在版からの上書き、削除済みの引用を新しく採用。当時版の明示利用は可能 |
| `removeCollectionItem` | 該当作品の除去 | 原種・芽・アトリエへ連鎖削除しない |

主保存失敗は入力と予定IDを残し、成功通知を出さない。主保存成功・lastGood失敗は保存成功と控えの失敗を分ける。応答不明は読み直してから後続の意味データ操作を進める。

AI の受領や大きい地図の配置保存で入力を止めない。背景処理は保存キューへ渡し、現在の編集状態を古い全体 snapshot で上書きしない。毎入力で全文索引・全地図・全材料 snapshot を再構築しない。

## 11. 書出し・持ち帰り・購読満了

- JSON v3 は schema/export 版、旧 Seed/Connection/芽/下書き、Plus の版・作品・権限・由来・見送りを含む。既存 JSON v2 の読み取り仕様を残す。新データを落としたファイルを「完全なバックアップ」と表示しない。
- 認証秘密、provider キー、購入検証の秘密、サーバー用アクセストークンはエクスポートしない。同意の履歴は記録として書き出しても、インポート後の送信許可や有効な bearer token にしない。
- 通常のテキスト・作品の書出しは、削除済み原文とその自動の引用コピーを除く。JSON全データ書出しには復元用の削除済みデータ等が含まれることを、現在と同様に事前表示する。自動発見の除外・非送信は本人自身によるバックアップを禁止する設定ではないが、収録範囲を確認させる。
- ことばカードと地図＋文章1ページは、作品の固定版を出す。現在の原文へ自動で差し替えない。引用・出典を含めるかは本人が選ぶ。公開URLの発行やSNS投稿を自動で行わない。
- 「バックアップから戻せる」と販売する前に、v2/v3インポートの検証・プレビュー・既存データとの衝突処理を実装する。現行の書出しだけで復元可能と案内しない。
- インポート時の externalAi は unasked に戻し、deny と discovery除外は保持する。候補は再検証が済むまで stale、取得した同意を再利用しない。ID衝突は黙って既存原文を上書きせず、プレビューと新ID対応表で参照を保つ。
- 満了後も、保存済みの配置、アトリエ下書き・版、確定芽、作品を読める。既存文面の基本編集、手動接続、削除、基本の書出しも維持する。Plus 専用の作成画面しかなく成果に到達できない設計は禁止。
- 満了時に地図を初期配置へ戻さない。既存作品は、保存済みの形式・template・layout設定を使い、手動の本文編集後もPNG/PDFを再出力できる。AIは再実行せず、削除した引用のマスクは現在状態を反映する。新規の高度構成・新形式の適用と、既存作品の持ち帰りを分ける。詳しい可否は [販売設計](plus-commerce-validation.md)に従う。
- 満了とデータ削除は別の操作。端末に残る成果と、サービスの期限付きキャッシュ・将来のクラウド同期を混同しない。

## 12. 受入条件（設計案・未実施）

以下を [統合検証](plus-commerce-validation.md)に組み込む。機能別の実装と同じ PR で必要な再現試験を追加し、全項目を形だけのUI snapshot試験に置き換えない。

| ID | 再現条件 | 合格条件 |
| --- | --- | --- |
| DATA-01 | v2の原文・芽・削除済み材料・下書き・見送りをv3へ移行 | 全ID/本文/意味/日時を維持。全データ送信は初期無効 |
| DATA-02 | 移行各段階・フェンス・主保存・lastGoodで中断 | 再開でき、旧v2を最新として上書きしない。未知版で保存停止 |
| DATA-03 | A–B、B–C、同タグ、クラスタだけを用意 | A–C・新Seed・芽が自動生成されない |
| DATA-04 | 有効候補の受領・表示・見送り・再起動 | Connection数不変。見送りをモデル変更や軽微編集で再提案しない |
| DATA-05 | 1件採用を二重タップ・同一ID再送 | 正規化ペア1件、本人メモ不変、AI根拠は候補側に保持 |
| DATA-06 | 応答待ちに原文編集/削除/権限撤回/画面移動 | 後着結果が採用可能にならない。古い文で確定しない |
| DATA-07 | 捏造引用・他source引用・自己ペア・emoji offset・指示文を入力 | 不正出力は不採用。本文命令で外部通信/保存/接続を起こさない |
| DATA-08 | deny原種→芽snapshot→アトリエ→作品→別要求 | 派生経路でも送信されない。全入力由来を保持 |
| DATA-09 | discovery除外、未送信範囲、同意前の画面 | 自動候補/推薦件数/自動まとまりに使わず、本人の検索/一覧/明示選択/手動接続/自作地図は維持。同意前の外部呼出しゼロ |
| DATA-10 | アトリエ提案後に下書き変更、固定一節と重なる挿入、材料選択後の原文編集/再起動 | 自動差替えなし。固定文不変、採用は下書きだけ。選択時snapshotを保持し当時版での保存/作品化と現在芽への採用を分ける |
| DATA-11 | 版保存→芽採用→作品固定→原種変更/接続解除 | 3操作が独立。作品は固定文面と両端/理由を持つ図を保持。原種に戻れ、更新は本人選択 |
| DATA-12 | 原種soft-delete→通常表示/export→復元 | 自動引用はマスク、本人の文は残る。復元で古いAI候補は自動再掲しない |
| DATA-13 | 主保存失敗/応答不明/別更新後の再試行 | 入力不消失・半分だけの採用なし・二重作成なし |
| DATA-14 | 成功/0件/不正/通信失敗/重複配送/見送り | reserved→committed/releasedが冪等。成功後見送りの追加消費なし |
| DATA-15 | rate/budget競合・timeout・再送 | provider二重発注を抑制。全体予算超過前に停止、無料操作は継続 |
| DATA-16 | オフライン撤回/全削除→後着応答→再接続 | 端末に復活しない。遠隔削除待ちと完了を区別 |
| DATA-17 | 大量種/高次数/長文材料/多版を保存 | 毎入力の全版複製なし。入力・閲覧を妨げない実機計測を記録 |
| DATA-18 | 購読満了・返金反映・通信障害 | 原文/配置/下書き/確定成果の閲覧・基本編集を維持。既存設定で手動編集後もPNG/PDF再出力、削除引用を再表示しない |
| DATA-19 | 旧JSON/新JSONを書出し・取り込み | 権限を勝手に有効化せず参照を維持。取り込み未完成なら復元可能と表示しない |
| DATA-20 | 根拠あり/なし、異分野、両立視点、短い日本語の評価セット。語一致のみ/多様化集合を同予算で比較 | 有効な根拠・仮説区別・0件判断・異テーマの有用な関係を人が確認。単なるAPI疎通で完了にしない |

モデル評価は、作成者の試用メモまたは同意を得た評価資料で行う。利用者の全メモを品質測定のために自動収集しない。採用率だけを正解率にせず、誤った関係、過剰な断定、見送りのしやすさも記録する。

## 13. 実装へ渡す境界

本書追加ではコード、依存、DB、課金商品、API キー、モデル、サーバー、申請・公開状態を変更しない。実装は [Plus 実装計画](plus-implementation-plan.md)の Phase 11.0〜11.6 に従う。

最初に行うのは保存・移行・権限・候補と本人データの分離である。現在の無料機能を条件分岐で先に塞ぎ、後から Plus の価値を作る順序にはしない。
