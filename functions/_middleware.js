const ORIGIN = "https://whale2.math.ryukoku.ac.jp/origin-math";
const TIMEOUT_MS = 3000;

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  const originUrl = ORIGIN + url.pathname + url.search;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

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

    if (originResponse.status >= 500) {
      throw new Error(`origin returned ${originResponse.status}`);
    }
    const proxied = new Response(originResponse.body, originResponse);
    proxied.headers.set("x-math-proxy", "origin");
    return proxied;
  } catch (err) {
    clearTimeout(timeout);
    // whale2に到達不能 → Pagesの静的コンテンツへフォールバック
    const fallback = await next();
    const tagged = new Response(fallback.body, fallback);
    tagged.headers.set("x-math-proxy", `fallback:${err.message}`);
    return tagged;
  }
}
