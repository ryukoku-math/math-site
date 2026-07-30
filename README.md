# math-site

[日本語版はこちら](README.ja.md)

The source for **[www.math.ryukoku.ac.jp](https://www.math.ryukoku.ac.jp)**, the public site of the
Applied Mathematics and Informatics Course, Faculty of Advanced Science and Technology, Ryukoku
University.

Built with [Blume](https://useblume.dev), a Markdown-first docs framework on Astro/Vite. This
repository holds only content, configuration, and a couple of hand-built Astro pages/components —
there is no framework code to maintain here.

## Editing content

Most edits are just changing a `.mdx` file under `docs/`. If you don't have a local dev setup, see
**[CONTRIBUTING.md](CONTRIBUTING.md)** for a step-by-step guide to editing directly from the GitHub
web UI (branch → edit → pull request).

## Local development

```bash
npm install      # install dependencies
npm run dev      # dev server with hot reload (http://localhost:4321)
npm run build    # build static output to dist/
npm run doctor   # diagnose config/content problems
```

There is no lint or test suite — this is a content-only project. Verify changes by running `npm run
dev` and checking the rendered page.

## License

Content and code in this repository are © Ryukoku University, Applied Mathematics and Informatics
Course. Not for reuse without permission.
