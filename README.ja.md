# math-site

[English version here](README.md)

龍谷大学 先端理工学部 数理・情報科学課程の公式サイト
**[www.math.ryukoku.ac.jp](https://www.math.ryukoku.ac.jp)** のソースリポジトリです。

Markdownベースのドキュメントフレームワーク [Blume](https://useblume.dev)（Astro/Vite製）で構築されて
います。このリポジトリにはコンテンツ・設定・少数の手書きAstroページ/コンポーネントのみが含まれ、
フレームワーク自体のコードは含まれません。

## コンテンツの編集

ほとんどの編集は `docs/` 以下の `.mdx` ファイルを変更するだけで完結します。ローカルに開発環境がない
場合は、**[CONTRIBUTING.md](CONTRIBUTING.md)** にGitHubのWeb画面だけで編集する手順（ブランチ作成
→編集→Pull Request）をまとめています。

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
