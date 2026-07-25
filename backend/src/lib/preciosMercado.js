// Precios reales de mercado por municipio, extraídos del índice inmobiliario de Fotocasa.
// Cache en memoria de 7 días; si la petición falla se usan los valores de respaldo.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TTL_MS = 7 * 24 * 3600 * 1000;

const cache = new Map(); // slug -> { pm2, alqM2, fuente, ts }

const num = (s) => parseFloat(s.replace(/\./g, '').replace(',', '.'));

function extraer(html, marcador) {
  const i = html.indexOf(marcador);
  if (i === -1) return null;
  const m = html.slice(i, i + 3000).match(/([\d.,]+)\s*€\/m²/);
  return m ? num(m[1]) : null;
}

export async function precioMunicipio(slug, fallback) {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit;

  try {
    const res = await fetch(`https://www.fotocasa.es/indice-precio-vivienda/${slug}/todas-las-zonas`, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const pm2 = extraer(html, 'Precio de compra');
    const alqM2 = extraer(html, 'Precio del alquiler');
    if (!pm2 || !alqM2) throw new Error('sin datos en la página');

    const data = { pm2, alqM2, fuente: 'fotocasa', ts: Date.now() };
    cache.set(slug, data);
    return data;
  } catch {
    // Respaldo con valores estáticos aproximados; cache corta para reintentar pronto
    const data = { ...fallback, fuente: 'estimado', ts: Date.now() - TTL_MS + 3600 * 1000 };
    cache.set(slug, data);
    return data;
  }
}
