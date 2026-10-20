// Lichess OAuth2 PKCE login. Lichess needs no client registration: any client_id
// works and the redirect URI only has to match between the two requests.
const LICHESS = "https://lichess.org";
const CLIENT_ID = "outofbook-poc";
// Board API: play games from our own board; preferences: play with the user's own Lichess board settings.
const SCOPES = "board:play preference:read";

const redirectUri = () => `${location.origin}/`;
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function login() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  sessionStorage.setItem("oauth", JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES,
    state,
  });
  location.href = `${LICHESS}/oauth?${q}`;
}

/** Call on page load: finishes a login redirect if there is one. */
export async function completeLogin(): Promise<string | null> {
  const q = new URLSearchParams(location.search);
  const code = q.get("code");
  if (!code) return getToken();
  const saved = JSON.parse(sessionStorage.getItem("oauth") ?? "{}");
  history.replaceState(null, "", "/");
  if (q.get("state") !== saved.state) throw new Error("OAuth state mismatch");
  const res = await fetch(`${LICHESS}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: saved.verifier,
      redirect_uri: redirectUri(),
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status}`);
  const token = (await res.json()).access_token as string;
  localStorage.setItem("lichessToken", token);
  return token;
}

export const getToken = () => {
  try {
    return localStorage.getItem("lichessToken");
  } catch {
    return null;
  }
};

export async function logout() {
  const t = getToken();
  localStorage.removeItem("lichessToken");
  localStorage.removeItem("lichessPrefs");
  if (t) await fetch(`${LICHESS}/api/token`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
}

export async function account(token: string): Promise<{ username: string } | null> {
  const r = await fetch(`${LICHESS}/api/account`, { headers: { Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

/** Scopes granted to a token (empty string when it has none or is invalid). */
export async function tokenScopes(token: string): Promise<string> {
  const r = await fetch(`${LICHESS}/api/token/test`, { method: "POST", body: token });
  if (!r.ok) return "";
  const j = await r.json();
  return j[token]?.scopes ?? "";
}
