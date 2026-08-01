# math-site

龍谷大学 先端理工学部 数理・情報科学課程の公式サイト
**[www.math.ryukoku.ac.jp](https://www.math.ryukoku.ac.jp)** のソースリポジトリです。

Markdownベースのドキュメントフレームワーク [Blume](https://useblume.dev)（Astro/Vite製）で構築されて
います。このリポジトリにはコンテンツ・設定・少数の手書きAstroページ/コンポーネントのみが含まれ、
フレームワーク自体のコードは含まれません。

## コンテンツの編集

ほとんどの編集は `docs/` 以下の `.mdx` ファイルを変更するだけで完結します。ローカルに開発環境がない
場合は、**[CONTRIBUTING.md](CONTRIBUTING.md)** にGitHubのWeb画面だけで編集する手順（ブランチ作成
→編集→Pull Request）をまとめています。

## News Editor（`/admin/news`）

ニュース記事の追加・編集をブラウザのフォームから行い、GitHub Pull Requestを自動作成するツールです。
GitHubアカウント（このリポジトリへの書き込み権限を持つコラボレーター）でログインして使います。
既存のブランチ保護・レビュー・Cloudflare Pagesプレビュー・毎日午前3時の本番反映といった仕組みは
変更していません。導入・運用の詳細は `CLAUDE.md` の「News Editor」セクションを参照してください。

利用には次の手動セットアップ（GitHub OAuth Appの登録、Cloudflare Pagesへの環境変数設定）が必要です。
未設定の環境では `/admin/news` を開いてもログインが機能しません。

- `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`（GitHub Developer settingsで手動登録した
  OAuth Appの値。本番用・開発用で別アプリが必要）
- `SESSION_COOKIE_SECRET`（セッションcookie署名用。`openssl rand -base64 32` 等で生成）
- `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` / `GITHUB_REPO_BRANCH`

環境変数の一覧は `.env.example` を参照してください。

## ローカル開発

```bash
npm install      # 依存関係をインストール
npm run dev      # 開発サーバー起動（ホットリロード付き、http://localhost:4321）
npm run build    # dist/ に静的出力をビルド
npm run doctor   # 設定・コンテンツの問題を診断
```

Lintやテストスイートはありません（コンテンツのみのプロジェクトのため）。変更内容は `npm run dev` で
実際のページを確認して検証してください。

## ライセンス

このリポジトリのコンテンツおよびコードは 龍谷大学 先端理工学部 数理・情報科学課程 に帰属します。
無断転載・再利用はご遠慮ください。
