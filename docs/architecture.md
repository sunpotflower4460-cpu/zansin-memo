# Architecture (Draft)

## 目的
実装前に、MVP〜将来拡張まで破綻しにくい設計方針を定義する。

## データモデル案
中心エンティティは Seed。  
MVPでは単一コレクション中心で十分だが、将来の関連表示・再浮上・変換アクションに耐える項目を保持する。

### Seed 型定義案
```ts
type GrowthState = "seed" | "sprout" | "tree" | "archived";

type Mood = "calm" | "excited" | "uncertain" | "heavy" | "bright";

type Importance = 1 | 2 | 3 | 4 | 5;

type TransformOutputType = "question" | "task" | "article" | "project";

type TransformOutput = {
  id: string;
  type: TransformOutputType;
  content: string;
  createdAt: string;
};

type Seed = {
  id: string;
  title?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  mood?: Mood;
  importance: Importance;
  growthState: GrowthState;
  tags: string[];
  relatedSeedIds: string[];
  resurfacingScore?: number;
};
```

補足:
- UI文脈の「カテゴリ」は保存上 `tags` として扱う（分類の強制はしない）。
- 実装時の変数名・型名・コメントは `tags` を基準にし、UIラベルのみ「カテゴリ」を使う。
- `importance` は入力時に任意扱いでもよく、未指定時は既定値（例: 3）で保存する。

## Tag / Mood / Importance / GrowthState の考え方
- **Tag**: 厳密分類ではなく再発見の補助。複数付与可。
- **Mood**: 記録時の感情文脈。検索・再浮上ヒントに利用。
- **Importance**: ユーザー主観の重み。再浮上優先度に反映可能。
- **GrowthState**: 育成段階の可視化。作業ステータスではなく思考状態を表す。

## 保存戦略（ローカル→クラウド移行可能）
- Phase 1〜3: ローカル保存（LocalStorage / IndexedDB / 軽量DB）
- 抽象化層: `SeedRepository` インターフェースでデータアクセスを分離
- 将来: 同一インターフェース実装でクラウド保存へ差し替え

例（概念）:
- `LocalSeedRepository`
- `CloudSeedRepository`

## Phase 5〜7に向けた追加候補（必要時のみ）
MVPを重くしない前提で、次の項目は将来拡張候補として扱う。

- `lastResurfacedAt?: string`
- `archivedAt?: string`
- `sourceType?: "manual" | "import" | "transform"`
- `transformOutputs?: TransformOutput[]`
- `softDeletedAt?: string`
- `schemaVersion?: number`

## AI連携を後から追加できる構成
- Transform / Resurfacing の判定ロジックをユースケース層に分離
- `AiAssistService` を任意注入可能にし、未設定時はローカルロジックで動作
- APIキー必須にしないフォールバック設計を維持

## UIとデータ層を分ける方針
- UI: 表示とユーザー操作に集中
- Application: ユースケース（作成・更新・再浮上・変換）
- Data: Repository / Storage 実装

この分離により、MVPの速度を保ちながら、将来のAI・同期・分析拡張を安全に追加できる。
