/**
 * Scraper de Idealista usando Puppeteer.
 *
 * Modo principal: se conecta al Chrome ya abierto por el usuario (puerto 9222).
 * El usuario abre Chrome con start-chrome.sh, navega a la búsqueda de Idealista
 * que quiere y luego pulsa "Iniciar scraping" en el CRM.
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

/** Limpia un precio extraído del DOM */
function cleanPrice(text) {
  if (!text) return null;
  const num = text.replace(/[^\d]/g, '');
  return num ? parseInt(num, 10) : null;
}

// ─── Construcción de URL de paginación ───────────────────────────────────────
/**
 * Dada una URL base de Idealista, devuelve la URL de la página N.
 *
 * Maneja correctamente URLs con query strings (ej. "?ordenado-por=...") —
 * el segmento "pagina-N.htm" se inserta en el path ANTES del "?", no al
 * final de la URL. Idealista rechaza las URLs con "pagina-N.htm" tras el
 * query string y las redirige a la home.
 *
 * Ejemplos:
 *   /venta-viviendas/madrid/                  + 2 → /venta-viviendas/madrid/pagina-2.htm
 *   /venta-viviendas/madrid/?ordenado=foo     + 2 → /venta-viviendas/madrid/pagina-2.htm?ordenado=foo
 *   /venta-viviendas/madrid/con-filtro_X/     + 2 → /venta-viviendas/madrid/con-filtro_X/pagina-2.htm
 *   /venta-viviendas/madrid/pagina-3.htm      + 2 → /venta-viviendas/madrid/pagina-2.htm
 */
function buildPageUrl(baseUrl, pageNum) {
  if (pageNum <= 1) return baseUrl;
  try {
    const u = new URL(baseUrl);
    let path = u.pathname;

    if (/\/pagina-\d+\.htm$/.test(path)) {
      // Ya hay un pagina-N — reemplazar el número
      path = path.replace(/\/pagina-\d+\.htm$/, `/pagina-${pageNum}.htm`);
    } else {
      // Asegurar que el path termine en / antes de añadir pagina-N.htm
      if (!path.endsWith('/')) path += '/';
      path += `pagina-${pageNum}.htm`;
    }

    u.pathname = path;
    // u.search se preserva automáticamente al serializar con toString()
    return u.toString();
  } catch (err) {
    console.warn('[Scraper] Error parseando URL para paginación:', err.message);
    return baseUrl;
  }
}



async function extractPhone(page) {
  try {
    // ── Estrategia 1: buscar por TEXTO del botón ("Ver teléfono") ─────────
    // Es la más fiable porque Idealista puede cambiar las clases CSS pero
    // el texto "Ver teléfono" / "Mostrar teléfono" es estable.
    const clickedByText = await page.evaluate(() => {
      const candidates = document.querySelectorAll('button, a, [role="button"]');
      for (const c of candidates) {
        const txt = ((c.innerText || c.textContent || '') + ' ' + (c.getAttribute('aria-label') || '')).toLowerCase();
        if (txt.includes('ver teléfono') || txt.includes('ver telefono')
            || txt.includes('mostrar teléfono') || txt.includes('mostrar telefono')
            || txt.includes('ver móvil') || txt.includes('ver movil')
            || txt.includes('mostrar número') || txt.includes('mostrar numero')) {
          c.scrollIntoView({ block: 'center' });
          c.click();
          return true;
        }
      }
      return false;
    });

    if (clickedByText) {
      await sleep(1000, 2000);
    } else {
      // ── Estrategia 2: selectores de clase (fallback) ──────────────────────
      const btnSelectors = [
        'button.contact-phone-button',
        'button[class*="phone"]',
        'a[class*="phone"]',
        '.phone-btn',
        '[data-testid="phone-button"]',
        'span.icon-phone',
      ];

      for (const sel of btnSelectors) {
        try {
          const btn = await page.$(sel);
          if (btn) {
            await btn.click();
            await sleep(1000, 2000);
            break;
          }
        } catch { /* ignorar */ }
      }
    }

    // ── Buscar el número revelado ─────────────────────────────────────────
    // 1. Regex permisiva sobre el texto completo de la página (inline reveal)
    const pageText = await page.evaluate(() => document.body.innerText);
    const re = /(?:\+?34[\s-]?)?([679]\d{2})[\s-]?(\d{2,3})[\s-]?(\d{2,3})/;
    const m = pageText.match(re);
    if (m) {
      const clean = (m[1] + m[2] + m[3]).replace(/[\s-]/g, '');
      if (/^[679]\d{8}$/.test(clean)) return clean;
    }

    // 2. Buscar en enlaces tel: (a veces Idealista pone uno tras el reveal)
    const telPhone = await page.evaluate(() => {
      const tel = document.querySelector('a[href^="tel:"]');
      return tel ? tel.href.replace('tel:', '') : null;
    });
    if (telPhone) {
      const clean = telPhone.replace(/[\s-+]/g, '').replace(/^34/, '');
      if (/^[679]\d{8}$/.test(clean)) return clean;
    }

    return null;

  } catch (err) {
    console.warn('[Scraper] Error extrayendo teléfono:', err.message);
    return null;
  }
}

// ─── Extracción de características del piso ──────────────────────────────────
/**
 * Extrae las "Características básicas", "Edificio", "Certificado energético",
 * "Equipamiento" y similares de la página de detalle del anuncio. Devuelve
 * un objeto con cada sección como clave y un array de strings con los bullets.
 *
 * Ejemplo de resultado:
 * {
 *   "Características básicas": ["110 m² construidos", "4 habitaciones", ...],
 *   "Edificio": ["Planta 2ª exterior", "Con ascensor"],
 *   "Certificado energético": ["En trámite"]
 * }
 */
async function extractCaracteristicas(page) {
  try {
    return await page.evaluate(() => {
      const result = {};
      const wantedSections = [
        'características básicas',
        'caracteristicas basicas',
        'características',
        'edificio',
        'certificado energético',
        'certificado energetico',
        'equipamiento',
        'extras',
      ];

      const allHeaders = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const h of allHeaders) {
        const title = (h.textContent || '').trim();
        const lowTitle = title.toLowerCase();
        if (!wantedSections.some(s => lowTitle.includes(s))) continue;

        // Buscar el siguiente <ul> (puede estar directamente al lado del
        // header o dentro de un wrapper pocos niveles por debajo)
        let container = h.nextElementSibling;
        let ul = null;
        for (let i = 0; container && i < 5 && !ul; i++) {
          if (container.tagName === 'UL') {
            ul = container;
            break;
          }
          const innerUl = container.querySelector && container.querySelector('ul');
          if (innerUl) {
            ul = innerUl;
            break;
          }
          container = container.nextElementSibling;
        }

        if (ul) {
          const items = Array.from(ul.querySelectorAll('li'))
            .map(li => (li.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(t => t.length > 0 && t.length < 250);
          if (items.length > 0) {
            result[title] = items;
          }
        }
      }

      return Object.keys(result).length > 0 ? result : null;
    });
  } catch (err) {
    console.warn('[Scraper] Error extrayendo características:', err.message);
    return null;
  }
}

// ─── Extracción de datos del vendedor ─────────────────────────────────────────

async function extractSellerInfo(page) {
  let nombre_vendedor = null;
  let es_particular = true;

  try {
    const sellerSelectors = [
      '.professional-name',
      '.advertiser-name',
      '[class*="advertiser"]',
      '.contact-info-agent',
      '.user-info-name',
    ];

    for (const sel of sellerSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          nombre_vendedor = await el.evaluate(e => e.textContent.trim());
          break;
        }
      } catch { /* ignorar */ }
    }

    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
    es_particular = !bodyText.includes('agencia') && !bodyText.includes('inmobiliaria') && !bodyText.includes('promotor');

  } catch { /* ignorar */ }

  return { nombre_vendedor, es_particular };
}

// ─── Extrae listings de la página actual ─────────────────────────────────────

async function extractListingsFromPage(page, precioMin, precioMax) {
  return page.evaluate((precioMin, precioMax) => {
    const items = [];
    const seen = new Set(); // deduplicar por URL

    // Selectores actualizados para Idealista 2024
    // Nota: los selectores se solapan (un mismo anuncio puede matchear tanto
    // `article.item` como el `div[class*="item-info-container"]` de dentro),
    // por eso deduplicamos por URL.
    const articles = document.querySelectorAll(
      'article.item, div[class*="item-info-container"], .items-list article'
    );

    articles.forEach(art => {
      try {
        const linkEl = art.querySelector('a.item-link, a[href*="/inmueble/"]');
        const url = linkEl ? linkEl.href : null;
        if (!url || !url.includes('/inmueble/')) return;
        if (seen.has(url)) return;
        seen.add(url);

        const titleEl = art.querySelector('.item-title, h3.item-title, [class*="item-title"]');
        const titulo = titleEl ? titleEl.textContent.trim() : '';

        const priceEl = art.querySelector('.item-price, .price-row, [class*="price"]');
        const precioText = priceEl ? priceEl.textContent.trim() : '';
        const precio = parseInt(precioText.replace(/[^\d]/g, ''), 10) || null;

        if (precioMin && precio && precio < precioMin) return;
        if (precioMax && precio && precio > precioMax) return;

        items.push({ url, titulo, precioText, precio });
      } catch { /* ignorar */ }
    });

    return items;
  }, precioMin || 0, precioMax || Infinity);
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Scrape Idealista.
 * Se conecta al Chrome ya abierto por el usuario en el puerto 9222.
 * El usuario debe tener abierta la página de resultados de Idealista, o
 * bien haber rellenado params.url_inicial en la campaña.
 *
 * @param {Object} params
 * @param {string} params.url_inicial — URL de Idealista pegada en la campaña (prioritaria)
 * @param {string} params.poblacion
 * @param {string} params.provincia
 * @param {string} params.tipo
 * @param {number} params.precio_min
 * @param {number} params.precio_max
 * @param {number} params.maxPages
 * @param {(lead: object) => Promise<void>} [onLead] — callback opcional,
 *        llamado cada vez que se scrapea un nuevo lead (para streaming al CRM)
 * @returns {Promise<Array>}
 */
async function scrapeIdealista(params, onLead) {
  const maxPages = params.maxPages || 5;
  const leads = [];

  console.log('[Scraper] Iniciando scraping Idealista:', params);

  // ── Conectar al Chrome del usuario (puerto 9222) ──────────────────────────
  let browser;
  let ownBrowser = false;

  try {
    browser = await puppeteer.connect({
      browserURL: 'http://localhost:9222',
      defaultViewport: null,
    });
    console.log('[Scraper] Conectado al Chrome del usuario.');
  } catch (e) {
    console.warn('[Scraper] No hay Chrome con debugging activo. Lanzando navegador propio...');
    browser = await puppeteer.launch({
      headless: false,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
      defaultViewport: null,
    });
    ownBrowser = true;
  }

  try {
    // ── Decidir qué URL usar ──────────────────────────────────────────────
    // Prioridad:
    //   1. url_inicial pegada en la campaña (modo totalmente automático)
    //   2. Pestaña de Idealista ya abierta por el usuario (modo manual)
    //   3. URL construida con buildSearchUrl (último recurso)
    const urlFromCampaign = (params.url_inicial
      && typeof params.url_inicial === 'string'
      && params.url_inicial.includes('idealista.com'))
      ? params.url_inicial
      : null;

    const pages = await browser.pages();
    let page;

    if (urlFromCampaign) {
      // Prioridad 1: navegar a la URL que el usuario pegó en la campaña.
      // Reutilizamos una pestaña de Idealista si ya hay una (para no
      // acumularlas), si no, abrimos una nueva.
      const existingIdealista = pages.find(p => p.url().includes('idealista.com'));
      page = existingIdealista || pages[0] || await browser.newPage();
      console.log('[Scraper] Navegando a url_inicial de la campaña:', urlFromCampaign);
      if (ownBrowser) {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      }
      await page.goto(urlFromCampaign, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000, 4000);
    } else {
      // Prioridad 2: usar pestaña de Idealista ya abierta por el usuario
      page = pages.find(p => p.url().includes('idealista.com'));

      if (!page) {
        // Prioridad 3: construir URL con buildSearchUrl y navegar
        page = pages[0] || await browser.newPage();
        const baseUrl = buildSearchUrl(params);
        console.log('[Scraper] Navegando a (fallback):', baseUrl);
        if (ownBrowser) {
          await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        }
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(2000, 4000);
      } else {
        console.log('[Scraper] Usando pestaña de Idealista ya abierta:', page.url());
      }
    }

    // ── Scrapear páginas ──────────────────────────────────────────────────────
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      if (pageNum > 1) {
        // Pausa más larga entre páginas para reducir probabilidad de ser
        // detectado como bot por Idealista tras muchas peticiones.
        console.log(`[Scraper] Pausa de 8s antes de la siguiente página...`);
        await sleep(7000, 10000);

        // Construir la URL de la página siguiente. Usamos buildPageUrl que
        // maneja correctamente query strings: pagina-N.htm va en el PATH
        // antes del "?", no al final de la URL (eso confunde a Idealista
        // y redirige a la home).
        const currentUrl = page.url();
        const nextUrl = buildPageUrl(currentUrl, pageNum);

        console.log(`[Scraper] Navegando a página ${pageNum}:`, nextUrl);
        try {
          await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await sleep(2500, 4500);

          // Log de sanidad: confirma título y URL final tras redirects
          const finalUrl = page.url();
          const pageTitle = await page.title();
          console.log(`[Scraper] Página ${pageNum} cargada. Título: "${pageTitle}" · URL final: ${finalUrl}`);

          // Detectar si Idealista redirigió a página de error / captcha
          const problemas = await page.evaluate(() => {
            const body = (document.body?.innerText || '').toLowerCase();
            return {
              noResults: body.includes('no hemos encontrado ningún anuncio') || body.includes('no se han encontrado inmuebles'),
              captcha: body.includes('no soy un robot') || body.includes('verificar que eres humano'),
              notFound: body.includes('página no encontrada') || body.includes('la página que buscas no existe'),
            };
          });

          if (problemas.captcha) {
            console.warn(`[Scraper] Página ${pageNum}: CAPTCHA detectado. Esperando 60s para intervención manual...`);
            await sleep(60000, 61000);
          } else if (problemas.noResults) {
            console.log(`[Scraper] Página ${pageNum}: Idealista dice que no hay más anuncios. Parando.`);
            break;
          } else if (problemas.notFound) {
            console.warn(`[Scraper] Página ${pageNum}: página no existe. Parando.`);
            break;
          }
        } catch (err) {
          console.error(`[Scraper] Error navegando a página ${pageNum}: ${err.message}`);
          console.error(`[Scraper] URL intentada: ${nextUrl}`);
          break;
        }
      }

      const listings = await extractListingsFromPage(page, params.precio_min, params.precio_max);
      console.log(`[Scraper] Encontrados ${listings.length} anuncios en página ${pageNum}`);

      if (listings.length === 0) {
        if (pageNum === 1) {
          console.warn('[Scraper] Página 1 sin anuncios — verifica que la URL de la campaña o la pestaña abierta en Chrome apunta a resultados de búsqueda válidos.');
        } else {
          console.log('[Scraper] Sin más anuncios en esta página. Parando paginación.');
        }
        break;
      }

      // ── Para cada anuncio abrir detalle ──────────────────────────────────────
      for (const listing of listings) {
        try {
          console.log(`[Scraper] Procesando: ${listing.titulo || listing.url}`);

          const detailPage = await browser.newPage();
          await detailPage.goto(listing.url, { waitUntil: 'networkidle2', timeout: 20000 });
          await sleep(1500, 3000);

          const telefono = await extractPhone(detailPage);
          const { nombre_vendedor, es_particular } = await extractSellerInfo(detailPage);
          const caracteristicas = await extractCaracteristicas(detailPage);

          await detailPage.close();

          const lead = {
            titulo: listing.titulo,
            precio: listing.precio,
            url_anuncio: listing.url,
            telefono,
            nombre_vendedor,
            es_particular,
            caracteristicas,
            poblacion: params.poblacion || null,
            provincia: params.provincia || null,
            tipo: params.tipo || 'piso',
            portal: 'idealista',
          };
          leads.push(lead);

          // Streaming: enviar al CRM en cuanto se tiene el lead (no al final)
          if (onLead) {
            try { await onLead(lead); } catch (e) { /* no bloquear el scraping */ }
          }

          await sleep(2000, 4000);

        } catch (err) {
          console.warn('[Scraper] Error procesando anuncio:', err.message);
          const lead = {
            titulo: listing.titulo,
            precio: listing.precio,
            url_anuncio: listing.url,
            telefono: null,
            nombre_vendedor: null,
            es_particular: true,
            poblacion: params.poblacion || null,
            provincia: params.provincia || null,
            tipo: params.tipo || 'piso',
            portal: 'idealista',
          };
          leads.push(lead);
          if (onLead) {
            try { await onLead(lead); } catch (e) { /* ignore */ }
          }
        }
      }

      await sleep(3000, 6000);
    }

  } finally {
    if (ownBrowser) {
      await browser.close();
    } else {
      // No cerramos el browser del usuario, solo desconectamos
      browser.disconnect();
    }
  }

  console.log(`[Scraper] Scraping completado. Total leads: ${leads.length}`);
  return leads;
}

/** Construye la URL de búsqueda de Idealista (fallback si no hay pestaña abierta) */
function buildSearchUrl(params) {
  const { poblacion, provincia, tipo = 'piso' } = params;
  const tipoMap = {
    piso: 'pisos', casa: 'casas', local: 'locales-comerciales',
    nave: 'naves-almacenes', solar: 'terrenos', edificio: 'edificios', otro: 'otros-inmuebles',
  };
  const tipoUrl = tipoMap[tipo] || 'pisos';

  function normalizeLocation(text) {
    if (!text) return '';
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  let location;
  if (poblacion && provincia) {
    location = `${normalizeLocation(poblacion)}-${normalizeLocation(provincia)}`;
  } else {
    location = normalizeLocation(poblacion || provincia || 'madrid');
  }

  return `https://www.idealista.com/venta-${tipoUrl}/${location}/`;
}

module.exports = { scrapeIdealista };
