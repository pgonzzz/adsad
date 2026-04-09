/**
 * Scraper de Idealista usando Puppeteer.
 *
 * El agente corre en un PC dedicado (headless: false para poder resolver
 * posibles CAPTCHAs manualmente si fuera necesario).
 *
 * Devuelve array de leads con: titulo, precio, url_anuncio, telefono,
 * nombre_vendedor, es_particular, poblacion, provincia, tipo.
 */

const puppeteer = require('puppeteer');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Espera un tiempo aleatorio entre min y max ms para parecer más humano */
function sleep(min = 1000, max = 3000) {
  const ms = min + Math.floor(Math.random() * (max - min));
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Construye un fallback de URL de búsqueda de Idealista.
 *
 * IMPORTANTE: esto es solo un fallback de último recurso. Idealista tiene
 * slugs muy específicos (ej. "alacant" en vez de "alicante", "madrid-madrid"
 * en vez de solo "madrid" según el caso) y muchas ciudades comparten nombre
 * con barrios de Madrid o Barcelona. Para resultados fiables se debe usar
 * el campo `url_inicial` de la campaña, que el usuario pega directamente
 * desde su navegador tras filtrar la búsqueda en idealista.com.
 */
function buildSearchUrl(params) {
  const { poblacion, provincia } = params;

  // Normalizar la ubicación: minúsculas, sin tildes, espacios → guiones
  function normalizeLocation(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  const pob = normalizeLocation(poblacion);
  const prov = normalizeLocation(provincia);

  // Patrón habitual de Idealista: venta-viviendas/<municipio>-<provincia>/
  // Usamos "venta-viviendas" (todas las viviendas) en vez de "venta-pisos"
  // porque es más general y evita mismatches cuando el anuncio es de chalets.
  let slug;
  if (pob && prov) slug = `${pob}-${prov}`;
  else if (pob) slug = pob;
  else if (prov) slug = `${prov}-provincia`; // agregador de provincia completa
  else slug = 'madrid';

  return `https://www.idealista.com/venta-viviendas/${slug}/`;
}

/** Valida que una URL sea realmente de idealista.com */
function isValidIdealistaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.hostname.endsWith('idealista.com');
  } catch {
    return false;
  }
}

/**
 * Compone la URL para la página N dada una URL base de Idealista.
 * Idealista usa el formato `pagina-N.htm` anexado al path final.
 */
function pageUrlFromBase(baseUrl, n) {
  if (n <= 1) return baseUrl;
  // Quitar query y fragment para construir, luego re-adjuntarlos
  let u;
  try {
    u = new URL(baseUrl);
  } catch {
    return baseUrl;
  }
  let path = u.pathname;
  if (!path.endsWith('/')) path += '/';
  u.pathname = `${path}pagina-${n}.htm`;
  return u.toString();
}

/** Limpia un precio extraído del DOM */
function cleanPrice(text) {
  if (!text) return null;
  const num = text.replace(/[^\d]/g, '');
  return num ? parseInt(num, 10) : null;
}

// ─── Regex de teléfono español ────────────────────────────────────────────────
// Acepta formatos con/sin espacios, guiones, y prefijo +34 opcional.
// Ej: 612345678, 612 34 56 78, 612-345-678, +34 612 345 678, 34 612345678
const SPANISH_PHONE_RE = /(?:\+?34[\s-]?)?[679]\d{2}[\s-]?\d{2,3}[\s-]?\d{2,3}[\s-]?\d{0,2}/;

/** Extrae y normaliza un teléfono español de un string arbitrario. */
function extractSpanishPhone(text) {
  if (!text) return null;
  const match = String(text).match(SPANISH_PHONE_RE);
  if (!match) return null;
  const clean = match[0].replace(/[\s-]/g, '').replace(/^\+?34/, '');
  return /^[679]\d{8}$/.test(clean) ? clean : null;
}

// ─── Cerrar modal abierto si lo hay ───────────────────────────────────────────
async function closeOpenModal(page) {
  try {
    const hasModal = await page.evaluate(() => {
      return !!document.querySelector('[role="dialog"]:not([aria-hidden="true"]), .modal.show, dialog[open]');
    });
    if (!hasModal) return;
    await page.keyboard.press('Escape');
    await sleep(300, 600);
  } catch { /* ignorar */ }
}

// ─── Revelar teléfono clicando en "Ver teléfono" dentro de una tarjeta ────────
/**
 * Busca el botón "Ver teléfono" DENTRO de un <article> concreto del listado,
 * lo clica y devuelve el teléfono revelado. Mucho más rápido que abrir la
 * ficha del anuncio entera.
 *
 * Estrategia de búsqueda (en orden):
 *   1. Cualquier botón/enlace cuyo innerText contenga "ver teléfono"
 *   2. Elementos con clases que incluyan "phone"
 *   3. Iconos con clase "icon-phone"
 *
 * Tras clicar, busca el número en:
 *   1. El texto del propio article (reveal inline)
 *   2. Un modal/dialog global abierto
 *   3. Un enlace `tel:` en la página
 */
async function revealPhoneInArticle(page, article) {
  // Scroll al article para que sea clicable
  try {
    await article.evaluate(el => el.scrollIntoView({ block: 'center' }));
  } catch { /* stale handle */ return null; }
  await sleep(250, 550);

  // Buscar y clicar el botón dentro del article
  const clicked = await article.evaluate(el => {
    // 1. Buscar por texto
    const candidates = el.querySelectorAll('button, a, [role="button"]');
    for (const c of candidates) {
      const txt = ((c.innerText || c.textContent || '') + ' ' + (c.getAttribute('aria-label') || '')).toLowerCase();
      if (txt.includes('ver teléfono') || txt.includes('ver telefono') || txt.includes('mostrar teléfono') || txt.includes('mostrar telefono')) {
        c.click();
        return 'text-match';
      }
    }
    // 2. Buscar por clase "phone"
    const byClass = el.querySelector('button[class*="phone"]:not([disabled]), a[class*="phone"]');
    if (byClass) { byClass.click(); return 'class-phone'; }
    // 3. Buscar contenedor del icono de teléfono y clicar el botón padre
    const icon = el.querySelector('[class*="icon-phone"], svg[class*="phone"]');
    if (icon) {
      const btn = icon.closest('button, a, [role="button"]');
      if (btn) { btn.click(); return 'icon-phone'; }
    }
    return null;
  });

  if (!clicked) return null;

  // Esperar a que Idealista revele el número (inline o modal)
  await sleep(700, 1400);

  // 1. Buscar número en el texto del propio article (reveal inline)
  let phone = await article.evaluate(el => {
    const re = /(?:\+?34[\s-]?)?[679]\d{2}[\s-]?\d{2,3}[\s-]?\d{2,3}[\s-]?\d{0,2}/;
    const txt = el.innerText || '';
    const match = txt.match(re);
    if (match) return match[0];
    // También mirar atributos href tel: dentro del article
    const tel = el.querySelector('a[href^="tel:"]');
    return tel ? tel.href.replace('tel:', '') : null;
  }).then(extractSpanishPhone).catch(() => null);

  if (phone) return phone;

  // 2. Buscar en un modal/dialog global
  phone = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]:not([aria-hidden="true"]), .modal.show, dialog[open]');
    if (!dialog) return null;
    const tel = dialog.querySelector('a[href^="tel:"]');
    if (tel) return tel.href.replace('tel:', '');
    return dialog.innerText || null;
  }).then(extractSpanishPhone).catch(() => null);

  if (phone) {
    await closeOpenModal(page);
    return phone;
  }

  // 3. Buscar cualquier tel: link recién añadido a la página
  phone = await page.evaluate(() => {
    const tel = document.querySelector('a[href^="tel:"]');
    return tel ? tel.href.replace('tel:', '') : null;
  }).then(extractSpanishPhone).catch(() => null);

  await closeOpenModal(page);
  return phone || null;
}

// ─── Extracción del vendedor directamente desde la tarjeta del listado ────────
async function extractSellerFromArticle(article) {
  try {
    return await article.evaluate(el => {
      // Nombre/logo de la agencia — suele estar en una imagen con alt
      const logoImg = el.querySelector(
        'picture[class*="logo"] img, [class*="logo-branding"] img, [class*="branding"] img, img[class*="logo"]'
      );
      const nombreLogo = logoImg ? (logoImg.alt || '').trim() : '';

      // Texto de anunciante
      const nameEl = el.querySelector(
        '[class*="advertiser"], [class*="professional"], [class*="branding-name"], .item-branding'
      );
      const nombreTexto = nameEl ? (nameEl.innerText || '').trim() : '';

      const nombre_vendedor = (nombreLogo || nombreTexto || '').trim() || null;

      // Hay branding de agencia → no es particular
      const hasBranding = !!(
        logoImg ||
        el.querySelector('[class*="branding"], [class*="professional"], [class*="agency"]')
      );

      return { nombre_vendedor, es_particular: !hasBranding };
    });
  } catch {
    return { nombre_vendedor: null, es_particular: true };
  }
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Scrape Idealista con los params dados.
 *
 * @param {Object} params
 * @param {string} params.poblacion
 * @param {string} params.provincia
 * @param {string} params.tipo — piso|casa|local|nave|solar|edificio|otro
 * @param {number} params.precio_min
 * @param {number} params.precio_max
 * @param {number} params.maxPages — máximo de páginas a scrapear (default 3)
 * @returns {Promise<Array>} — array de leads
 */
async function scrapeIdealista(params) {
  const maxPages = params.maxPages || 3;
  const leads = [];

  console.log('[Scraper] Iniciando scraping Idealista:', params);

  const browser = await puppeteer.launch({
    headless: false, // visible en el PC dedicado para debugging y CAPTCHA manual
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: null,
  });

  try {
    const page = await browser.newPage();

    // User agent real para evitar detección
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // ─── Elegir URL base ──────────────────────────────────────────────────
    // Preferir `url_inicial` pegada por el usuario. Si no, construir una
    // con el fallback a partir de poblacion/provincia.
    let baseUrl;
    if (isValidIdealistaUrl(params.url_inicial)) {
      baseUrl = params.url_inicial;
      console.log('[Scraper] Usando url_inicial de la campaña:', baseUrl);
    } else {
      baseUrl = buildSearchUrl(params);
      console.log('[Scraper] url_inicial no definida, usando fallback:', baseUrl);
      if (params.url_inicial) {
        console.warn('[Scraper] url_inicial ignorada por no ser de idealista.com:', params.url_inicial);
      }
    }

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const url = pageUrlFromBase(baseUrl, pageNum);
      console.log(`[Scraper] Scrapeando página ${pageNum}:`, url);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(2000, 4000);

        // ─── Chequeo de sanidad: título y URL real tras posibles redirects ─
        const finalUrl = page.url();
        const pageTitle = await page.title();
        console.log(`[Scraper] Página cargada — título: "${pageTitle}" · url: ${finalUrl}`);

        // Verificar si hay CAPTCHA (Idealista usa Cloudflare o su propio sistema)
        const isCaptcha = await page.evaluate(() => {
          const title = (document.title || '').toLowerCase();
          const body = (document.body?.innerText || '').toLowerCase();
          return title.includes('captcha')
              || title.includes('verificación')
              || title.includes('un momento')
              || body.includes('no soy un robot')
              || body.includes('verificar que eres humano')
              || !!document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="challenges.cloudflare"]');
        });

        if (isCaptcha) {
          console.warn('[Scraper] CAPTCHA/verificación detectado en página', pageNum, '— esperando 60s para resolución manual en la ventana visible...');
          await sleep(60000, 61000);
        }

        // ─── Detectar redirect a página de error/404/buscador genérico ────
        // Si tras navegar estamos en una URL distinta y claramente genérica
        // (ej. la home de idealista, o una búsqueda sin filtros), avisar.
        const isLikelyWrongPage = await page.evaluate(() => {
          const body = (document.body?.innerText || '').toLowerCase();
          return body.includes('no hemos encontrado ningún anuncio')
              || body.includes('no se han encontrado inmuebles')
              || body.includes('página no encontrada')
              || body.includes('la página que buscas no existe');
        });

        if (isLikelyWrongPage) {
          console.warn(`[Scraper] Página ${pageNum} parece no tener resultados (URL final: ${finalUrl}). Título: "${pageTitle}".`);
          if (pageNum === 1) {
            // Abortar pronto: mejor fallar rápido que procesar basura.
            throw new Error(`Idealista no devolvió resultados para la URL: ${url}. Pega una URL directa de idealista.com en la campaña (campo "URL de Idealista").`);
          }
          break;
        }

        // ─── Obtener handles de los artículos del listado ─────────────────
        const articles = await page.$$(
          'article.item, article[class*="item"], [class*="item-info-container"]'
        );

        console.log(`[Scraper] Encontrados ${articles.length} artículos en página ${pageNum}`);

        // Si en la página 1 no hay ningún listing, probablemente los selectores
        // han cambiado o Idealista devolvió otra cosa. Abortar con un mensaje
        // claro para que el backend muestre el error en el CRM.
        if (pageNum === 1 && articles.length === 0) {
          throw new Error(
            `Página 1 sin anuncios detectables. URL final: ${finalUrl} · Título: "${pageTitle}". ` +
            `Verifica que la URL de Idealista sea correcta, o revisa si los selectores del scraper han quedado obsoletos.`
          );
        }

        // ─── Procesar cada artículo: datos + clic en "Ver teléfono" ───────
        for (let i = 0; i < articles.length; i++) {
          const article = articles[i];
          let basic = null;

          try {
            // Datos básicos desde el propio article
            basic = await article.evaluate(el => {
              const linkEl = el.querySelector('a.item-link, a[href*="/inmueble/"]');
              const url = linkEl ? linkEl.href : null;
              const titleEl = el.querySelector('.item-title, h3.item-title, [class*="item-title"]');
              const titulo = titleEl ? (titleEl.textContent || '').trim() : '';
              const priceEl = el.querySelector('.item-price, .price-row, [class*="price"]');
              const precioText = priceEl ? (priceEl.textContent || '').trim() : '';
              const precio = parseInt(precioText.replace(/[^\d]/g, ''), 10) || null;
              return { url, titulo, precio };
            });

            if (!basic || !basic.url) continue;

            // Filtro de precio (se aplica también cuando se usa url_inicial como
            // segunda capa de seguridad si el usuario no lo metió en Idealista)
            if (params.precio_min && basic.precio && basic.precio < params.precio_min) continue;
            if (params.precio_max && basic.precio && basic.precio > params.precio_max) continue;

            console.log(`[Scraper] [${i + 1}/${articles.length}] ${basic.titulo || basic.url}`);

            // Vendedor/agencia desde la tarjeta
            const { nombre_vendedor, es_particular } = await extractSellerFromArticle(article);

            // Clic en "Ver teléfono" dentro del article y extraer el número
            const telefono = await revealPhoneInArticle(page, article);
            if (telefono) {
              console.log(`[Scraper]   ✓ Tel: ${telefono}${nombre_vendedor ? ` · ${nombre_vendedor}` : ''}`);
            } else {
              console.log(`[Scraper]   ✗ Sin teléfono (botón "Ver teléfono" no encontrado o reveal vacío)`);
            }

            leads.push({
              titulo: basic.titulo,
              precio: basic.precio,
              url_anuncio: basic.url,
              telefono,
              nombre_vendedor,
              es_particular,
              poblacion: params.poblacion || null,
              provincia: params.provincia || null,
              tipo: params.tipo || 'piso',
              portal: 'idealista',
            });

            // Pausa aleatoria entre reveals para no gatillar rate-limit
            await sleep(1500, 3500);

          } catch (err) {
            console.warn('[Scraper] Error procesando artículo:', err.message);
            if (basic && basic.url) {
              leads.push({
                titulo: basic.titulo,
                precio: basic.precio,
                url_anuncio: basic.url,
                telefono: null,
                nombre_vendedor: null,
                es_particular: true,
                poblacion: params.poblacion || null,
                provincia: params.provincia || null,
                tipo: params.tipo || 'piso',
                portal: 'idealista',
              });
            }
          } finally {
            // Liberar el handle del artículo
            try { await article.dispose(); } catch { /* ignorar */ }
          }
        }

        // Si no hay anuncios, salir del loop de páginas
        if (articles.length === 0) {
          console.log('[Scraper] Sin más anuncios, parando.');
          break;
        }

        // Pausa entre páginas
        await sleep(3000, 6000);

      } catch (err) {
        console.error(`[Scraper] Error en página ${pageNum}:`, err.message);
        break;
      }
    }

  } finally {
    await browser.close();
  }

  console.log(`[Scraper] Scraping completado. Total leads: ${leads.length}`);
  return leads;
}

module.exports = { scrapeIdealista };
