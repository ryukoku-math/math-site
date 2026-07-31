// セッションcookie(署名付き)とOAuthのstate cookieを扱うための小さなユーティリティ。
// Cloudflare Pages FunctionsはWorkersランタイム上で動くため、crypto.subtle (WebCrypto)を
// そのまま使い、Node向けの署名ライブラリには依存しない。

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const padLength = (4 - (value.length % 4)) % 4;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// セッション本体(トークン・login名など)をJSON→base64url化し、HMAC署名を付与して
// `<payload>.<signature>` の形にする。cookie値としてそのまま使える。
export async function signSession(payload, secret) {
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(signature))}`;
}

// 署名を検証し、改ざん・不正な値であれば null を返す。
export async function verifySession(cookieValue, secret) {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const [payloadB64, sigB64] = cookieValue.split(".");
  if (!payloadB64 || !sigB64) return null;

  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(sigB64),
    encoder.encode(payloadB64),
  );
  if (!valid) return null;

  try {
    return JSON.parse(decoder.decode(fromBase64Url(payloadB64)));
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  parts.push("HttpOnly");
  parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

// news/*系のFunctionsから共通で使う、リクエストからセッションを取り出すヘルパー。
export async function getSessionFromRequest(request, env) {
  const cookies = parseCookies(request.headers.get("Cookie"));
  return verifySession(cookies.gh_session, env.SESSION_COOKIE_SECRET);
}
