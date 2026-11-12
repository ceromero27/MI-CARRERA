/* Lógica de avisos compartida por la app y el service worker (que avisa con la app cerrada). */
(function (g) {
  const UMBRALES = [168, 48, 24, 6, 1]; // horas antes: 7 días, 2 días, 1 día, 6 h, 1 h

  function falta(h) {
    if (h < 1) return `en ${Math.max(1, Math.round(h * 60))} minutos`;
    if (h < 48) return `en ${Math.floor(h)} horas`;
    return `en ${Math.round(h / 24)} días`;
  }

  /** Avisos nuevos para mandar: uno por fecha, por el umbral más cercano que ya se cruzó. */
  function pendientes(data, notificados, ahora) {
    const out = [];
    const mats = {};
    for (const m of data.materias || []) mats[m.id] = m.nombre;
    for (const e of data.eventos || []) {
      if (e.hecho) continue;
      const d = new Date(e.fecha);
      if (isNaN(d)) continue;
      const h = (d - ahora) / 36e5;
      const materia = mats[e.materia] || "General";
      if (h < 0) {
        const k = e.id + ":vencido";
        if (!notificados[k] && h > -48) {
          out.push({ keys: [k], tag: e.id, titulo: `⚠ Venció: ${e.titulo}`, cuerpo: `${materia}. Si ya lo hiciste, marcalo como listo.` });
        }
        continue;
      }
      const cruzados = UMBRALES.filter(u => h <= u);
      if (!cruzados.length) continue;
      const keys = cruzados.map(u => `${e.id}:${u}`);
      if (keys.every(k => notificados[k])) continue;
      const atrasado = h < 48 && (e.progreso || 0) < 50;
      out.push({
        keys, tag: e.id,
        titulo: `${atrasado ? "⚠ " : "⏳ "}${e.titulo} ${falta(h)}`,
        cuerpo: `${materia}${atrasado ? ` · Vas ${e.progreso || 0} %: ¡a ponerle ritmo!` : e.progreso ? ` · Llevás ${e.progreso} %` : ""}`,
      });
    }
    return out;
  }

  g.AVISO = { UMBRALES, pendientes };
})(typeof self !== "undefined" ? self : window);
