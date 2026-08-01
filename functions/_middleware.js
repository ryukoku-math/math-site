const ORIGIN = "https://whale2.math.ryukoku.ac.jp/origin-math";
// Cloudflare Pagesの本番ブランチ。これ以外のブランチのデプロイ(=PRプレビュー)は
// whale2にプロキシせず、そのデプロイ自身のビルドを配信する。
const PRODUCTION_BRANCH = "main";
const TIMEOUT_MS = 3000;
// Ask AI streams an LLM completion — a few seconds of generation time is
// normal, not a sign the origin is down, so it needs a much longer allowance
// than the fast-fail used for ordinary page requests.
const ASK_TIMEOUT_MS = 30000;

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

  const originUrl = ORIGIN + url.pathname + url.search;

  const controller = new AbortController();
  const timeoutMs = url.pathname === "/api/ask" ? ASK_TIMEOUT_MS : TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  try {
    const originResponse = await fetch(originUrl, {
      method: request.method,
      headers: request.headers,
      body: hasBody ? request.body : undefined,
      // Cloudflare Workers' fetch() throws synchronously when forwarding a
      // streamed request body (POST/PUT/etc.) without this — the error was
      // silently swallowed by the catch block below and fell through to the
      // static fallback, which has no /api/ask route and returned 405.
      duplex: hasBody ? "half" : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // 404はフォールバックさせず、そのままクライアントに返す。
    // このPagesプロジェクトはビルドを実行せず、配信対象は pages-fallback/
    // (「一時的にご利用いただけません」の1枚) だけなので、next()で拾える
    // サイト本体の静的ビルドは存在しない。404をフォールバックに回すと、
    // whale2が返した正しい404(Blumeの Page not found ページ)が
    // 「サーバーに接続できません」+ ステータス200 に化けてしまう。
    if (originResponse.status >= 500) {
      throw new Error(`origin returned ${originResponse.status}`);
    }
    return originResponse;
  } catch (err) {
    clearTimeout(timeout);
    // whale2に到達不能 → Pagesの「一時的にご利用いただけません」ページへフォールバック
    return next();
  }
}
