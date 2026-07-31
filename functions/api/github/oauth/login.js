import { serializeCookie } from "../../../lib/cookie.js";

// GitHub OAuth Appの認可画面へリダイレクトする。scopeは登録時ではなく
// ここで指定する — このリポジトリは公開リポジトリなので repo ではなく
// より狭い public_repo で十分。
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const state = crypto.randomUUID().replace(/-/g, "");
  const redirectUri = `${url.origin}/api/github/oauth/callback`;

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.GITHUB_OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set("scope", "public_repo");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      // CSRF対策のstateはコールバックで完全一致を見るだけなので署名は不要。5分で失効させる。
      "Set-Cookie": serializeCookie("gh_oauth_state", state, { maxAge: 300 }),
    },
  });
}
