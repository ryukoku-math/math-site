
## 2026-08-02T21:12:20+09:00

KES → Cloudflare 移行計画の検討（実装なし）

- News Editor と KES GAS を比較。Notion/Sheets 正本はやめ、math-site の YAML 正本へ移行する方針を整理
- 入力は News 風フォーム（共同編集者は Git 操作なし）。管理者のみ PR マージ
- 告知は abstract あり／履歴はなし（同一 YAML・別テンプレ）。毎朝3時 JS ビルドで upcoming/past（マージ無しでも実行）
- calendar フィールド: waiting | <event-id> | cancel（キー無し＝cancel）。同期後は Actions が YAML に event-id を書き戻して main コミット（案 a）
- 計画書は KES 書込不可のため temp/移行計画-cloudflare.md に退避（temp/ は gitignore 予定）
- 関連: README whale2 リンク修正 PR #17（別件）
