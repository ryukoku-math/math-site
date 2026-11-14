import { defineConfig } from "blume";

export default defineConfig({
  title: "数理・情報科学課程",
  description: "龍谷大学 先端理工学部 数理・情報科学課程",
  logo: "/images/zero.png",
  feedback: false,
  // 検索索引のトークナイザは i18n.defaultLocale から選ばれる（blume 1.2.1 以降）。
  // 日本語・中国語・韓国語・タイ語では Intl.Segmenter による分かち書きに切り替わり、
  // 既定の英語トークナイザが日本語をすべて区切り文字として捨てる問題を回避する。
  // サイト内検索・MCP の search_docs・Ask AI の grounding が同じ索引を共有するため、
  // ここを設定しない限りどれも日本語では 0 件になる。
  // 単一ロケールなので URL 接頭辞は付かず（hideDefaultLocalePrefix の既定は true）、
  // 言語切替 UI も出ない（Header は locales が 2 つ以上のときだけ描画する）。
  i18n: {
    defaultLocale: "ja",
    locales: [{ code: "ja", label: "日本語" }],
  },
  search: {
    indexing: {
      // news / awards は sidebar.hidden: true（ナビには出さず、pages/news
      // ・pages/awards の一覧ページから辿らせる）。既定ではそれらが丸ごと
      // 検索索引から外れ、180ページ中 7ページしか索引されていなかった。
      // サイト内検索と Ask AI の grounding の両方がこの索引を使うため、
      // ニュース・受賞記事について一切答えられない状態になっていた。
      includeHiddenPages: true,
    },
  },
  analytics: {
    scripts: [
      {
        src: "https://www.googletagmanager.com/gtag/js?id=G-MYSRG869PY",
        strategy: "defer",
      },
      {
        content: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-MYSRG869PY');`,
      },
    ],
  },
  theme: {
    accent: "#f50000",
    radius: "none",
    fonts: {
      display: "figtree",
      body: "inter",
      mono: "ibm-plex-mono",
    },
  },
  seo: {
    // blume の自動生成 robots.txt は「Allow: /」固定で Disallow を足せないため、
    // 生成を止めて public/robots.txt を配信する（/admin/ を除外するため）。
    // Sitemap: 行も public/robots.txt に手書きしている。
    robots: false,
    // JSON-LD の Organization ノード（サイトの運営主体）。WebSite・記事ノードの publisher になる
    organization: {
      name: "龍谷大学 先端理工学部 数理・情報科学課程",
      logo: "/images/zero.png",
      address: {
        addressLocality: "大津市",
        addressRegion: "滋賀県",
        addressCountry: "JP",
      },
    },
    og: {
      // OG 画像の既定フォント（theme.fonts 由来の Lora/Inter）は日本語の字形を持たず、
      // タイトルが豆腐になるため Noto Sans JP を明示する
      fonts: [{ name: "Inter", weight: [400, 700] }, { name: "Noto Sans JP", weight: [400, 700] }],
      palette: { accent: "#f50000" },
      // カスタムページ（pages/*.astro）の OG 画像タイトル。未指定だと URL から "Awards" 等になる
      titles: {
        "/news": "News",
        "/awards": "優秀プレゼンテーション賞",
      },
    },
  },
  deployment: {
    // 公開URL。sitemap・OG画像・canonical・JSON-LD・エージェント向けマニフェストの
    // 絶対URL化に必要（未設定だと sitemap と og:image が出力されない）。
    site: "https://www.math.ryukoku.ac.jp",
    output: "server",
    adapter: "node",
  },
  ai: {
    ask: {
      enabled: false,
      provider: "openai-compatible",
      // whale2 ローカルの ask-shim 経由で slab-llm の Ollama を叩く。
      //
      // 直接 Ollama を指さない理由: Ollama の OpenAI 互換エンドポイントは
      // think:false を無視するため、素で叩くと thinking の生成に 40 秒以上かかる。
      // reasoning_effort:"none" を送れば抑制できるが、AskConfig にはリクエスト
      // フィールドを足す口が無い。ask-shim はそれを 1 個差し込むだけの中継。
      baseUrl: "http://127.0.0.1:11435/v1",
      // Ollama は認証なし（アクセス制御は slab-llm 側の pf が担う）。この変数は
      // ダミー値を送るためだけに残している。
      apiKeyEnv: "OLLAMA_API_KEY",
      model: "qwen3.8:27b-mlx",
      suggestions: [
        { label: "数理・情報科学課程にはどんな教員がいますか？", icon: "users" },
        { label: "オープンキャンパスではどんな体験ができますか？", icon: "flask-conical" },
        { label: "入学後の進路にはどんなものがありますか？", icon: "graduation-cap" },
      ],
    },
  },
});
