/* Service worker de Mi Carrera: funciona sin internet y avisa con la app cerrada. */
importScripts("frases.js", "aviso.js");

const VERSION = "micarrera-v2";
const DATOS = "micarrera-datos";
const ARCHIVOS = ["./", "index.html", "frases.js", "aviso.js", "manifest.webmanifest",
                  "icon-192.png", "icon-512.png", "icon-maskable.png", "icon-180.png", "icon-badge.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== DATOS) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.endsWith("/__datos.json") || url.pathname.endsWith("/__notificados.json")) return;
  const propio = url.origin === location.origin;
  const fuentes = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!propio && !fuentes) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: propio });
    const red = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) cache.put(req, r.clone()); return r; }).catch(() => null);
    if (fuentes && hit) { e.waitUntil(red); return hit; } // fuentes: lo guardado alcanza
    // Archivos de la app: la versión nueva si hay internet (así llegan las mejoras),
    // y si no responde en 3 segundos, la guardada (funciona sin conexión).
    const espera = new Promise(res => setTimeout(() => res(null), 3000));
    const r = await Promise.race([red, hit ? espera : red]);
    if (r) return r;
    if (hit) { e.waitUntil(red); return hit; }
    if (req.mode === "navigate") return (await cache.match("index.html")) || (await cache.match("./")) || Response.error();
    return Response.error();
  })());
});

function hoyISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function revisar() {
  const c = await caches.open(DATOS);
  const r = await c.match("./__datos.json");
  if (!r) return;
  const data = await r.json();
  const prev = await c.match("./__notificados.json");
  const extra = prev ? await prev.json() : {};
  const notif = { ...(data.notificados || {}), ...extra };
  const opciones = (cuerpo, tag) => ({ body: cuerpo, tag, icon: "icon-192.png", badge: "icon-badge.png", lang: "es" });
  const ahora = new Date();
  const conf = { fechas: true, frase: true, ...(data.notis || {}) };

  if (conf.fechas) {
    for (const n of AVISO.pendientes(data, notif, ahora)) {
      await self.registration.showNotification(n.titulo, opciones(n.cuerpo, n.tag));
      for (const k of n.keys) { notif[k] = Date.now(); extra[k] = Date.now(); }
    }
  }
  // Frase del día: una vez por día, desde las 7 de la mañana.
  const kf = "frase:" + hoyISO(ahora);
  if (conf.frase && ahora.getHours() >= 7 && !notif[kf]) {
    await self.registration.showNotification("✨ Frase del día", opciones(fraseDelDia(ahora), "frase"));
    extra[kf] = Date.now();
  }
  await c.put("./__notificados.json", new Response(JSON.stringify(extra), { headers: { "Content-Type": "application/json" } }));
}

self.addEventListener("periodicsync", e => { if (e.tag === "avisos") e.waitUntil(revisar()); });

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  })());
});
