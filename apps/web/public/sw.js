// OutOfBook service worker: keeps the app and its engine files so that it
// opens, and the bot can be played, with no connection. The page itself is
// fetched fresh when online (the cached copy is the fallback); Vite's hashed
// bundles never change and are served from the cache; other files (engines,
// Maia, icons) are served from the cache and refreshed in the background.
// The API and other sites are never cached, except Lichess's piece sets,
// boards and sounds, kept once used so the chosen look works offline.
const CACHE = "outofbook-v3";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add("/")));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The Android app asks for everything up front (precache.json), so it works offline from the first launch.
self.addEventListener("message", (e) => {
  if (e.data?.type !== "precache") return;
  e.waitUntil(
    fetch("/precache.json")
      .then((r) => r.json())
      .then(async (urls) => {
        const c = await caches.open(CACHE);
        const have = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
        for (const u of urls) if (!have.has(u)) await c.add(u).catch(() => {});
        e.source?.postMessage({ type: "precached", files: urls.length });
      }),
  );
});

const keep = (req, res) => {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

const LICHESS_LOOK = /^\/assets\/(piece|images\/board|sound)\//;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === "GET" && url.origin === "https://lichess1.org" && LICHESS_LOOK.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => keep(req, res))));
    return;
  }
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/releases") || url.pathname === "/sw.js") return;
  if (req.mode === "navigate") {
    // Fresh when online; the cached app when not. Query strings (the login's ?code=) do not matter.
    e.respondWith(
      fetch(req)
        .then((res) => (url.pathname === "/" ? keep("/", res) : res))
        .catch(() => caches.match("/", { ignoreVary: true })),
    );
    return;
  }
  e.respondWith(
    // ignoreVary: the server's "Vary: Origin" (CORS) would otherwise miss module scripts, which carry an Origin.
    caches.match(req, { ignoreVary: true }).then((hit) => {
      const fresh = fetch(req).then((res) => keep(req, res));
      if (!hit) return fresh;
      if (!url.pathname.startsWith("/assets/")) fresh.catch(() => {});
      return hit;
    }),
  );
});
