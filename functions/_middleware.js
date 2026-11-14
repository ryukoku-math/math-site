const ORIGIN = "https://whale2.math.ryukoku.ac.jp/origin-math";
// Cloudflare Pagesの本番ブランチ。これ以外のブランチのデプロイ(=PRプレビュー)は
// whale2にプロキシせず、そのデプロイ自身のビルドを配信する。
const PRODUCTION_BRANCH = "main";
const TIMEOUT_MS = 3000;
// Ask AI streams an LLM completion — a few seconds of generation time is
// normal, not a sign the origin is down, so it needs a much longer allowance
// than the fast-fail used for ordinary page requests.
//
// The budget is time-to-first-byte, not total generation: `clearTimeout` runs
// as soon as `fetch` resolves, which is when the origin's response headers
// arrive. Those headers wait on the model prefilling the grounded prompt, and
// the retrieved excerpts injected ahead of the question differ per query, so
// the prefix Ollama can reuse across requests is only the fixed instruction —
// every new question pays a full prefill. 30s was set while retrieval was
// silently returning nothing, which made the prompt tiny and the response
// near-instant; once grounding started working, measured TTFB rose to 21–36s
// (48.9s on a synthetic 10,000-character prompt) and real questions began
// falling through to the static fallback's 405.
const ASK_TIMEOUT_MS = 60000;

// --- エージェント向け（Accept: text/markdown のコンテンツネゴシエーション等） ---
// blume の Node アダプタ（whale2 の SSR）は Accept ヘッダーによる Markdown の出し分けも
// Link ヘッダーの付与もしない（Vercel / Cloudflare アダプタのみ対応）。そのため、
// blume が生成する `<route>.md` ミラーと `/404.md` を使って、ここで同じ振る舞いを再現する。
// （slab-site の functions/_middleware.js と同じ実装。こちらはカスタムページ /news・/awards に
// `.md` が無いため、Markdown が無いページは HTML を返す点だけが異なる）
const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";
const NOT_FOUND_MARKDOWN_PATH = "/404.md";
const HOME_MARKDOWN_PATH = "/index.md";
// x-markdown-tokens の概算に使う 1 トークンあたりの文字数（Cloudflare の慣例）
const CHARS_PER_TOKEN = 4;
// ページではないパス（静的アセット・API・管理画面・生成物）。出し分けもヘッダー付与もしない
const NON_PAGE_PREFIXES = ["/api/", "/admin/", "/_astro/", "/og/", "/.well-known/", "/images/"];
// すべてのページに付ける発見用 Link ヘッダー（RFC 8288）。各ファイルは blume が生成する
const DISCOVERY_LINKS = [
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</agent-readability.json>; rel="describedby"; type="application/json"',
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/ai-catalog+json"',
  '</openapi.json>; rel="service-desc"; type="application/json"',
];

// Accept ヘッダーの各メディアタイプの q 値を返す（指定がなければ 0）
function acceptQuality(accept, mediaType) {
  for (const part of accept.split(",")) {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    if (type.trim() !== mediaType) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const value = q ? Number.parseFloat(q.slice(2)) : 1;
    return Number.isNaN(value) ? 0 : value;
  }
  return 0;
}

// text/markdown を明示し、かつ text/html 以上に優先しているときだけ Markdown を返す
function prefersMarkdown(request) {
  const accept = request.headers.get("accept");
  if (!accept) return false;
  const markdownQ = acceptQuality(accept, "text/markdown");
  return markdownQ > 0 && markdownQ >= acceptQuality(accept, "text/html");
}

// 拡張子のない、アセット以外のパスを「ページ」とみなす
function isPageRoute(pathname) {
  if (NON_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  const lastSegment = pathname.split("/").pop();
  return !lastSegment.includes(".");
}

// ページの URL に対応する Markdown ミラーのパス（`/` → `/index.md`、`/a/` → `/a.md`）
function markdownPathFor(pathname) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? HOME_MARKDOWN_PATH : `${trimmed}.md`;
}

function appendVaryAccept(headers) {
  const vary = headers.get("vary");
  if (!vary) {
    headers.set("vary", "Accept");
    return;
  }
  if (!vary.toLowerCase().split(",").some((v) => v.trim() === "accept")) {
    headers.set("vary", `${vary}, Accept`);
  }
}

function pageLinkHeader(pathname) {
  const alternate = `<${markdownPathFor(pathname)}>; rel="alternate"; type="text/markdown"`;
  return [...DISCOVERY_LINKS, alternate].join(", ");
}

// method を指定すると元のリクエストと異なるメソッドで取得する（本文なしの GET 等）
async function fetchOrigin(request, pathname, search, timeoutMs, method = request.method) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const hasBody = method !== "GET" && method !== "HEAD";
  try {
    return await fetch(ORIGIN + pathname + search, {
      method,
      headers: request.headers,
      body: hasBody ? request.body : undefined,
      // Cloudflare Workers' fetch() throws synchronously when forwarding a
      // streamed request body (POST/PUT/etc.) without this — the error was
      // silently swallowed by the caller's catch block and fell through to the
      // static fallback, which has no /api/ask route and returned 405.
      duplex: hasBody ? "half" : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Markdown は HEAD でもトークン数を数えるため本文ごと GET で取得する
function fetchMarkdown(request, pathname) {
  return fetchOrigin(request, pathname, "", TIMEOUT_MS, "GET");
}

// オリジンの Markdown を、ネゴシエーション結果として返すレスポンスに包み直す
async function markdownResponse(request, originResponse, status, pagePath) {
  const body = await originResponse.text();
  const headers = new Headers({
    "content-type": MARKDOWN_CONTENT_TYPE,
    "x-markdown-tokens": String(Math.ceil(body.length / CHARS_PER_TOKEN)),
    "cache-control": originResponse.headers.get("cache-control") ?? "public, max-age=0",
  });
  appendVaryAccept(headers);
  if (pagePath) headers.set("link", pageLinkHeader(pagePath));
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

// 存在しないページへの Markdown 要求には、ステータス 404 のまま /404.md の本文を返す
async function notFoundMarkdown(request) {
  const notFound = await fetchMarkdown(request, NOT_FOUND_MARKDOWN_PATH);
  if (!notFound.ok) return null;
  return markdownResponse(request, notFound, 404, null);
}

// HTML ページに Vary: Accept と発見用 Link ヘッダーを付ける
function decoratePage(originResponse, pathname) {
  const contentType = originResponse.headers.get("content-type") ?? "";
  if (!contentType.startsWith("text/html")) return originResponse;
  const response = new Response(originResponse.body, originResponse);
  appendVaryAccept(response.headers);
  if (originResponse.ok) response.headers.set("link", pageLinkHeader(pathname));
  return response;
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // News EditorのGitHub認証・PR作成処理(/api/github/*)だけはCloudflare Pages
  // Functions側で完結させる必要がある — GitHub OAuthのシークレットはCloudflare
  // Pagesの環境変数としてのみ存在し、whale2の.envには無い。
  // 逆に /admin/* 配下のページ自体は除外してはいけない(本番では実体が
  // whale2のNode SSRサーバーにしかない)。
  if (url.pathname.startsWith("/api/github/")) {
    return next();
  }

  // PRプレビュー(本番ブランチ以外のデプロイ)は、そのブランチのビルドをそのまま
  // 配信する。ここでプロキシしてしまうとwhale2 = mainの内容が返り、
  // 「プレビューを開いても変更が反映されていない」ことになる(実際そうなっていた)。
  // プレビューはCloudflare上の静的ビルドなので、SSRが必要なもの(Ask AIの
  // /api/ask、編集画面の /admin/news/<slug>)はプレビューでは動かない。
  if (env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== PRODUCTION_BRANCH) {
    return next();
  }

  const isRead = request.method === "GET" || request.method === "HEAD";
  const isPage = isRead && isPageRoute(url.pathname);
  const timeoutMs = url.pathname === "/api/ask" ? ASK_TIMEOUT_MS : TIMEOUT_MS;
  // Markdown を要求されたが Markdown ミラーが無かった（HTML も無ければ 404 を Markdown で返す）
  let markdownMissing = false;

  try {
    if (isPage && prefersMarkdown(request)) {
      const markdown = await fetchMarkdown(request, markdownPathFor(url.pathname));
      if (markdown.ok) return markdownResponse(request, markdown, 200, url.pathname);
      if (markdown.status >= 500) throw new Error(`origin returned ${markdown.status}`);
      // カスタムページ（/news・/awards）は .md が無いので、下で HTML を返す
      markdownMissing = true;
    }

    const originResponse = await fetchOrigin(request, url.pathname, url.search, timeoutMs);

    // 404はフォールバックさせず、そのままクライアントに返す。
    // このPagesプロジェクトはビルドを実行せず、配信対象は pages-fallback/
    // (「一時的にご利用いただけません」の1枚) だけなので、next()で拾える
    // サイト本体の静的ビルドは存在しない。404をフォールバックに回すと、
    // whale2が返した正しい404(Blumeの Page not found ページ)が
    // 「サーバーに接続できません」+ ステータス200 に化けてしまう。
    if (originResponse.status >= 500) {
      throw new Error(`origin returned ${originResponse.status}`);
    }
    // 存在しないページを Markdown で要求された場合と、存在しない `.md` URL は
    // HTML の 404 ページではなく Markdown の 404 を返す
    if (isRead && originResponse.status === 404 && (markdownMissing || url.pathname.endsWith(".md"))) {
      const notFound = await notFoundMarkdown(request);
      if (notFound) return notFound;
    }
    return isPage ? decoratePage(originResponse, url.pathname) : originResponse;
  } catch (err) {
    // whale2に到達不能 → Pagesの「一時的にご利用いただけません」ページへフォールバック
    return next();
  }
}
