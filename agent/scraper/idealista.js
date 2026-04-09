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

// ─── Extracción de teléfono en página de detalle ──────────────────────────────

async function extractPhone(page) {
  try {
    // Buscar botón "Ver teléfono" / "Mostrar teléfono"
    const btnSelectors = [
      'button.contact-phone-button',
      'button[class*="phone"]',
      'a[class*="phone"]',
      '.phone-btn',
      '[data-testid="phone-button"]',
      'button:has-text("Ver teléfono")',
      'span.icon-phone',
    ];

    let clicked = false;
    for (const sel of btnSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          await sleep(1000, 2000);
          clicked = true;
          break;
        }
      } catch { /* ignorar */ }
    }

    // Si no encontramos botón, intentar extraer número directamente
    const phoneSelectors = [
      '.contact-phone-number',
      '.phone-number',
      '[class*="phone-number"]',
      '[data-testid="phone-number"]',
      '.user-contact-phone',
    ];

    for (const sel of phoneSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const text = await el.evaluate(e => e.textContent.trim());
          const match = text.match(/[679]\d{8}/);
          if (match) return match[0];
        }
      } catch { /* ignorar */ }
    }

    // Fallback: buscar en todo el texto de la página
    const pageText = await page.evaluate(() => document.body.innerText);
    const match = pageText.match(/(?:6|7)\d{8}/);
    return match ? match[0] : null;

  } catch (err) {
    console.warn('[Scraper] Error extrayendo teléfono:', err.message);
    return null;
  }
}

// ─── Extracción de datos del vendedor ─────────────────────────────────────────

async function extractSellerInfo(page) {
  let nombre_vendedor = null;
  let es_particular = true;

  try {
    // Nombre del vendedor/agencia
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

    // Detectar si es agencia (no particular)
    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
    es_particular = !bodyText.includes('agencia') && !bodyText.includes('inmobiliaria') && !bodyText.includes('promotor');

  } catch { /* ignorar */ }

  return { nombre_vendedor, es_particular };
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

        // Extraer listado de anuncios
        const listings = await page.evaluate((precioMin, precioMax) => {
          const items = [];

          // Selectores para los artículos de la lista
          const articles = document.querySelectorAll('article.item, .item-info-container, [class*="item-info"]');

          articles.forEach(art => {
            try {
              // URL del anuncio
              const linkEl = art.querySelector('a.item-link, a[href*="/inmueble/"]');
              const url = linkEl ? linkEl.href : null;
              if (!url) return;

              // Título
              const titleEl = art.querySelector('.item-title, h3.item-title, [class*="item-title"]');
              const titulo = titleEl ? titleEl.textContent.trim() : '';

              // Precio
              const priceEl = art.querySelector('.item-price, .price-row, [class*="price"]');
              const precioText = priceEl ? priceEl.textContent.trim() : '';
              const precio = parseInt(precioText.replace(/[^\d]/g, ''), 10) || null;

              // Filtro de precio
              if (precioMin && precio && precio < precioMin) return;
              if (precioMax && precio && precio > precioMax) return;

              items.push({ url, titulo, precioText, precio });
            } catch { /* ignorar */ }
          });

          return items;
        }, params.precio_min || 0, params.precio_max || Infinity);

        console.log(`[Scraper] Encontrados ${listings.length} anuncios en página ${pageNum}`);

        // Si en la página 1 no hay ningún listing, probablemente los selectores
        // han cambiado o Idealista devolvió otra cosa. Abortar con un mensaje
        // claro para que el backend muestre el error en el CRM.
        if (pageNum === 1 && listings.length === 0) {
          throw new Error(
            `Página 1 sin anuncios detectables. URL final: ${finalUrl} · Título: "${pageTitle}". ` +
            `Verifica que la URL de Idealista sea correcta, o revisa si los selectores del scraper han quedado obsoletos.`
          );
        }

        // Para cada anuncio, abrir la página y extraer más info
        for (const listing of listings) {
          try {
            console.log(`[Scraper] Procesando: ${listing.titulo || listing.url}`);

            const detailPage = await browser.newPage();
            await detailPage.setUserAgent(
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );

            await detailPage.goto(listing.url, { waitUntil: 'networkidle2', timeout: 20000 });
            await sleep(1500, 3000);

            // Extraer teléfono
            const telefono = await extractPhone(detailPage);

            // Extraer info del vendedor
            const { nombre_vendedor, es_particular } = await extractSellerInfo(detailPage);

            await detailPage.close();

            leads.push({
              titulo: listing.titulo,
              precio: listing.precio,
              url_anuncio: listing.url,
              telefono,
              nombre_vendedor,
              es_particular,
              poblacion: params.poblacion || null,
              provincia: params.provincia || null,
              tipo: params.tipo || 'piso',
              portal: 'idealista',
            });

            // Pausa entre anuncios para no ser bloqueado
            await sleep(2000, 4000);

          } catch (err) {
            console.warn('[Scraper] Error procesando anuncio:', err.message);
            // Añadir el anuncio sin teléfono para no perder datos
            leads.push({
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
            });
          }
        }

        // Si no hay anuncios, salir del loop de páginas
        if (listings.length === 0) {
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
