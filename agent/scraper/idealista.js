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

// ─── Detectar y resolver bloqueos de Idealista ──────────────────────────────
/**
 * Detecta si Idealista muestra un bloqueo temporal de IP ("uso indebido")
 * o el CAPTCHA slider ("desliza hacia la derecha") y los resuelve:
 *
 * - Bloqueo IP: espera 10s y recarga la página (el usuario dice que basta
 *   con refrescar para que vuelva a funcionar).
 * - Slider CAPTCHA: simula un drag de ratón de izquierda a derecha.
 *
 * @param {Page} page
 * @returns {boolean} true si se detectó algo y se intentó resolver
 */
async function detectAndSolveCaptcha(page) {
  const pageState = await page.evaluate(() => {
    const body = (document.body?.innerText || '').toLowerCase();
    return {
      isBlocked: body.includes('uso indebido') || body.includes('acceso se ha bloqueado'),
      isSlider: body.includes('desliza hacia la derecha') || body.includes('muchas peticiones tuyas') || body.includes('velocidad sobrehumana'),
    };
  });

  // ── Bloqueo temporal de IP ─────────────────────────────────────────────
  if (pageState.isBlocked) {
    console.warn('[Scraper] Bloqueo temporal de IP detectado ("uso indebido"). Esperando 15s y recargando...');
    await sleep(12000, 18000);
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000, 4000);
    } catch (err) {
      console.warn('[Scraper] Error recargando tras bloqueo:', err.message);
    }

    // Verificar si sigue bloqueado tras recargar
    const stillBlocked = await page.evaluate(() =>
      (document.body?.innerText || '').toLowerCase().includes('uso indebido')
    );

    if (stillBlocked) {
      console.warn('[Scraper] Sigue bloqueado tras recargar. Esperando 60s más...');
      await sleep(55000, 65000);
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(3000, 5000);
      } catch {}
    }

    const finalCheck = await page.evaluate(() =>
      (document.body?.innerText || '').toLowerCase().includes('uso indebido')
    );

    if (!finalCheck) {
      console.log('[Scraper] ✓ Bloqueo de IP resuelto tras recargar.');
    } else {
      console.error('[Scraper] ✗ Bloqueo persiste. Puede que la IP esté baneada más tiempo.');
    }
    return true;
  }

  // ── CAPTCHA slider ─────────────────────────────────────────────────────
  if (!pageState.isSlider) return false;

  console.log('[Scraper] CAPTCHA slider de Idealista detectado — resolviendo automáticamente...');

  // Estrategia: buscar el elemento del slider y arrastrarlo a la derecha.
  // El slider de Idealista suele ser un <button> o <div> con flechas (→)
  // dentro de un contenedor. Lo buscamos por varias vías.
  const solved = await page.evaluate(() => {
    // Buscar todos los elementos interactivos en la zona del slider
    const candidates = document.querySelectorAll(
      'button, [role="slider"], input[type="range"], [class*="slider"], [class*="slide"], [class*="puzzle"], [class*="drag"], [class*="handle"]'
    );

    // También buscar por contenido de flecha →
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const txt = (btn.innerText || btn.textContent || '').trim();
      if (txt === '→' || txt === '›' || txt.includes('→')) {
        // Marcar este como el posible slider handle
        btn.setAttribute('data-captcha-handle', 'true');
        return true;
      }
    }

    // Buscar por clase
    for (const el of candidates) {
      el.setAttribute('data-captcha-handle', 'true');
      return true;
    }

    return false;
  });

  // Método 1: Arrastrar el elemento marcado con drag simulado
  const handle = await page.$('[data-captcha-handle="true"]');
  if (handle) {
    const box = await handle.boundingBox();
    if (box) {
      console.log(`[Scraper] Slider encontrado en (${Math.round(box.x)}, ${Math.round(box.y)}), arrastrando...`);
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      const endX = startX + 300; // Arrastrar 300px a la derecha

      // Simular un drag humano: movimiento gradual con micro-pausas
      await page.mouse.move(startX, startY);
      await sleep(200, 400);
      await page.mouse.down();
      await sleep(100, 200);

      // Mover en pasos pequeños aleatorios (parecer humano)
      const steps = 15 + Math.floor(Math.random() * 10);
      const dx = (endX - startX) / steps;
      for (let i = 1; i <= steps; i++) {
        const jitter = (Math.random() - 0.5) * 3; // ±1.5px de ruido vertical
        await page.mouse.move(
          startX + dx * i + (Math.random() - 0.5) * 2,
          startY + jitter
        );
        await sleep(20, 60);
      }

      await sleep(100, 300);
      await page.mouse.up();
      console.log('[Scraper] Slider arrastrado. Esperando resultado...');

      // Esperar a que la página cambie (redirect, o el CAPTCHA desaparece)
      await sleep(2000, 4000);

      // Comprobar si sigue estando el CAPTCHA
      const stillCaptcha = await page.evaluate(() => {
        const body = (document.body?.innerText || '').toLowerCase();
        return body.includes('desliza hacia la derecha') || body.includes('muchas peticiones tuyas');
      });

      if (!stillCaptcha) {
        console.log('[Scraper] ✓ CAPTCHA resuelto con éxito.');
        return true;
      }
      console.warn('[Scraper] Primer intento de slider no funcionó, probando método alternativo...');
    }
  }

  // Método 2: si el método 1 falló, intentar un approach más amplio —
  // buscar CUALQUIER elemento arrastrable en la zona central de la página
  // y hacer drag desde el centro-izquierda hacia centro-derecha.
  console.log('[Scraper] Intentando drag genérico en la zona del slider...');
  const viewport = await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  // El slider suele estar centrado verticalmente, un poco arriba del medio
  const dragY = viewport.h * 0.45;
  const dragStartX = viewport.w * 0.3;
  const dragEndX = viewport.w * 0.7;

  await page.mouse.move(dragStartX, dragY);
  await sleep(300, 500);
  await page.mouse.down();
  await sleep(100, 200);

  const genSteps = 20 + Math.floor(Math.random() * 10);
  const genDx = (dragEndX - dragStartX) / genSteps;
  for (let i = 1; i <= genSteps; i++) {
    await page.mouse.move(
      dragStartX + genDx * i + (Math.random() - 0.5) * 2,
      dragY + (Math.random() - 0.5) * 4
    );
    await sleep(15, 50);
  }

  await sleep(200, 400);
  await page.mouse.up();

  await sleep(3000, 5000);

  const stillCaptcha2 = await page.evaluate(() => {
    const body = (document.body?.innerText || '').toLowerCase();
    return body.includes('desliza hacia la derecha') || body.includes('muchas peticiones tuyas');
  });

  if (!stillCaptcha2) {
    console.log('[Scraper] ✓ CAPTCHA resuelto con drag genérico.');
    return true;
  }

  console.error('[Scraper] ✗ No se pudo resolver el CAPTCHA automáticamente. Esperando 60s por si el usuario lo resuelve manualmente...');
  await sleep(60000, 61000);
  return true; // Devolver true para que el scraper reintente la página
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
    // ── Interceptar la respuesta de red que contiene el teléfono ──────
    // Cuando se clica "Ver teléfono", Idealista hace una petición AJAX
    // (a /ajax/...phone... o similar) que devuelve el número. Interceptar
    // esa respuesta es más fiable que buscar en el DOM.
    let phoneFromNetwork = null;
    const networkPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 8000);
      const handler = async (response) => {
        try {
          const url = response.url();
          if (url.includes('phone') || url.includes('telefono') || url.includes('contact')) {
            const text = await response.text().catch(() => '');
            // Buscar teléfono en la respuesta (JSON o texto plano)
            const re = /(?:\+?34[\s-]?)?([679]\d{2})[\s.-]?(\d{2,3})[\s.-]?(\d{2,3})/;
            const m = text.match(re);
            if (m) {
              const clean = (m[1] + m[2] + m[3]).replace(/[\s.-]/g, '');
              if (/^[679]\d{8}$/.test(clean)) {
                phoneFromNetwork = clean;
                clearTimeout(timeout);
                page.off('response', handler);
                resolve(clean);
              }
            }
          }
        } catch {}
      };
      page.on('response', handler);
      // Limpiar listener después del timeout
      setTimeout(() => { page.off('response', handler); }, 8500);
    });

    // ── Buscar y clicar el botón "Ver teléfono" ──────────────────────
    const clickedByText = await page.evaluate(() => {
      const candidates = document.querySelectorAll('button, a, [role="button"], span[role="button"], div[role="button"]');
      for (const c of candidates) {
        const txt = ((c.innerText || c.textContent || '') + ' ' + (c.getAttribute('aria-label') || '')).toLowerCase();
        if (txt.includes('ver teléfono') || txt.includes('ver telefono')
            || txt.includes('mostrar teléfono') || txt.includes('mostrar telefono')
            || txt.includes('ver móvil') || txt.includes('ver movil')
            || txt.includes('mostrar número') || txt.includes('mostrar numero')
            || txt.includes('llamar') || txt.includes('teléfono')) {
          c.scrollIntoView({ block: 'center' });
          c.click();
          return txt.slice(0, 40);
        }
      }
      return null;
    });

    if (clickedByText) {
      console.log(`[Scraper]     Botón clicado: "${clickedByText}"`);
      // Esperar a que la respuesta de red llegue con el teléfono
      const networkPhone = await networkPromise;
      if (networkPhone) {
        return networkPhone;
      }
      // Si la red no dio resultado, esperar un poco más y buscar en DOM
      await sleep(1000, 2000);
    } else {
      // Sin botón — buscar tel: link directo
      const directTel = await page.evaluate(() => {
        const tel = document.querySelector('a[href^="tel:"]');
        return tel ? tel.href.replace('tel:', '') : null;
      });
      if (directTel) {
        const clean = directTel.replace(/[\s-+]/g, '').replace(/^34/, '');
        if (/^[679]\d{8}$/.test(clean)) return clean;
      }
      console.log('[Scraper]     No se encontró botón "Ver teléfono"');
    }

    // ── Fallback: buscar en DOM (por si el network no lo capturó) ─────
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(1500, 2500);

      const phone = await page.evaluate(() => {
        // 1. tel: links
        const tels = document.querySelectorAll('a[href^="tel:"]');
        for (const tel of tels) {
          const num = tel.href.replace('tel:', '').replace(/[\s-+]/g, '').replace(/^34/, '');
          if (/^[679]\d{8}$/.test(num)) return num;
        }
        // 2. Texto en zonas de contacto
        const re = /(?:\+?34[\s.-]?)?([679]\d{2})[\s.-]?(\d{2,3})[\s.-]?(\d{2,3})/;
        const zones = document.querySelectorAll(
          '[class*="contact"], [class*="phone"], [class*="aside"], [class*="sidebar"], [class*="owner"], [class*="detail-info"]'
        );
        for (const zone of zones) {
          const m = (zone.innerText || '').match(re);
          if (m) {
            const clean = (m[1] + m[2] + m[3]).replace(/[\s.-]/g, '');
            if (/^[679]\d{8}$/.test(clean)) return clean;
          }
        }
        // 3. Botón que ahora muestra el número (reemplazó "Ver teléfono")
        const buttons = document.querySelectorAll('button, a, [role="button"]');
        for (const btn of buttons) {
          const txt = (btn.innerText || btn.textContent || '').trim();
          const m = txt.match(re);
          if (m) {
            const clean = (m[1] + m[2] + m[3]).replace(/[\s.-]/g, '');
            if (/^[679]\d{8}$/.test(clean)) return clean;
          }
        }
        return null;
      });
      if (phone) return phone;
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
  try {
    return await page.evaluate(() => {
      // ── Estrategia 1: buscar por selectores específicos conocidos ────────
      const sellerSelectors = [
        // Clases actuales de Idealista 2025-2026
        '.about-advertiser-name',
        '.professional-name',
        '.advertiser-name',
        '.name-container .name',
        '.contact-info-container .name',
        '[class*="about-advertiser"] [class*="name"]',
        '[class*="advertiser"] [class*="name"]',
        '[class*="professional"] [class*="name"]',
        '[data-testid*="advertiser"]',
        '[data-testid*="professional"]',
        // Clases antiguas como fallback
        '.contact-info-agent',
        '.user-info-name',
      ];

      let nombre_vendedor = null;
      for (const sel of sellerSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt && txt.length > 1 && txt.length < 150) {
            nombre_vendedor = txt;
            break;
          }
        }
      }

      // ── Estrategia 2: alt del logo del anunciante ─────────────────────────
      if (!nombre_vendedor) {
        const logoSelectors = [
          '.about-advertiser img',
          '.professional-info img',
          '[class*="advertiser"] img',
          '[class*="professional"] img',
          '.logo-advertiser img',
          'picture[class*="logo"] img',
        ];
        for (const sel of logoSelectors) {
          const img = document.querySelector(sel);
          if (img && img.alt && img.alt.trim().length > 1) {
            nombre_vendedor = img.alt.trim();
            break;
          }
        }
      }

      // ── Estrategia 3: buscar por texto en la zona del anunciante ─────────
      // Típicamente hay una sección <aside> o similar con el anunciante
      if (!nombre_vendedor) {
        const aside = document.querySelector('aside, [class*="about-advertiser"], [class*="contact-info"], [class*="side-info"]');
        if (aside) {
          // Buscar títulos/nombres dentro de ese aside
          const heading = aside.querySelector('h1, h2, h3, h4, .name, [class*="name"]');
          if (heading) {
            const txt = (heading.innerText || heading.textContent || '').trim();
            if (txt && txt.length > 1 && txt.length < 150) {
              nombre_vendedor = txt;
            }
          }
        }
      }

      // ── Determinar si es particular o agencia ────────────────────────────
      // Señales de particular:
      //   - Texto explícito "Anunciante particular" / "Particular"
      //   - No hay logo de agencia
      // Señales de agencia:
      //   - Texto "Profesional" / "Agencia" / "Inmobiliaria" en la zona del anunciante
      //   - Logo con alt name
      //   - Enlace "Ver más anuncios de <agencia>"
      let es_particular = true;

      // Buscar solo en la zona del anunciante, no en toda la página
      const advertiserZone = document.querySelector(
        'aside, [class*="about-advertiser"], [class*="advertiser-info"], [class*="professional-info"], [class*="contact-info"]'
      );
      const zoneText = advertiserZone
        ? (advertiserZone.innerText || '').toLowerCase()
        : '';

      if (zoneText.includes('anunciante particular') || zoneText.includes('particular en')) {
        es_particular = true;
      } else if (
        zoneText.includes('profesional') ||
        zoneText.includes('agencia') ||
        zoneText.includes('inmobiliaria') ||
        zoneText.includes('promotor') ||
        zoneText.includes('ver más anuncios de') ||
        zoneText.includes('ver otros anuncios')
      ) {
        es_particular = false;
      } else if (nombre_vendedor) {
        // Si hay un nombre pero ninguna pista, asumir particular
        // (las agencias suelen tener palabras clave claras)
        es_particular = true;
      }

      // También: presencia de logo → casi seguro es agencia
      const hasLogo = !!document.querySelector(
        '.about-advertiser img[alt], [class*="logo-advertiser"] img[alt], [class*="professional"] img[alt]'
      );
      if (hasLogo) es_particular = false;

      return { nombre_vendedor, es_particular };
    });
  } catch (err) {
    console.warn('[Scraper] Error extrayendo vendedor:', err.message);
    return { nombre_vendedor: null, es_particular: true };
  }
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
async function scrapeIdealista(params, onLead, shouldAbort) {
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
      // Si aparece CAPTCHA al cargar la búsqueda, resolverlo
      await detectAndSolveCaptcha(page);
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
      // Checkpoint de cancelación entre páginas
      if (shouldAbort && shouldAbort()) {
        console.log('[Scraper] Abortando scraping (usuario pausó).');
        break;
      }
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
              captcha: body.includes('desliza hacia la derecha') || body.includes('muchas peticiones tuyas') || body.includes('velocidad sobrehumana') || body.includes('no soy un robot') || body.includes('verificar que eres humano'),
              notFound: body.includes('página no encontrada') || body.includes('la página que buscas no existe'),
            };
          });

          if (problemas.captcha) {
            // Intentar resolver automáticamente el slider CAPTCHA
            await detectAndSolveCaptcha(page);
            // Reintentar la navegación a esta página tras resolver
            try {
              await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await sleep(2000, 3000);
            } catch { /* ignorar, lo detectará en el siguiente chequeo */ }
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

      // ── Fase 1: extraer URL, título, precio y vendedor del LISTADO ──────
      // Importante: NO usamos ElementHandles persistentes porque Idealista
      // modifica el DOM al scrollear/cargar lazy images y los handles se
      // quedan obsoletos ("same JavaScript world" / Protocol errors). En
      // su lugar hacemos una única `page.evaluate()` que devuelve datos
      // planos para todos los anuncios a la vez.
      const listingData = await page.evaluate(() => {
        const articles = document.querySelectorAll('article.item, div[class*="item-info-container"], .items-list article');
        const seen = new Set();
        const out = [];
        for (const el of articles) {
          const link = el.querySelector('a.item-link, a[href*="/inmueble/"]');
          const href = link ? link.href : null;
          if (!href || !href.includes('/inmueble/') || seen.has(href)) continue;
          seen.add(href);

          const titleEl = el.querySelector('.item-title, h3.item-title, [class*="item-title"]');
          const titulo = titleEl ? (titleEl.textContent || '').trim() : '';

          // Precio: extraer solo el PRIMER número con formato de precio.
          // Idealista a veces muestra "89.900 € 94.900 €" (original + tachado)
          // y si hacemos replace(/[^\d]/g) concatena todos los dígitos.
          const priceEl = el.querySelector('.item-price, .price-row, [class*="price"]');
          const precioText = priceEl ? (priceEl.textContent || '').trim() : '';
          const priceMatch = precioText.match(/([\d.]+)\s*€/);
          const precio = priceMatch
            ? parseInt(priceMatch[1].replace(/\./g, ''), 10) || null
            : null;

          // Vendedor: buscar el logo/nombre de la agencia, pero filtrar alt-texts
          // genéricos que NO son el nombre del vendedor (fotos, miniaturas, etc.)
          const NOMBRE_VENDEDOR_BASURA = [
            'primera foto', 'foto principal', 'foto del inmueble', 'foto anuncio',
            'imagen', 'picture', 'photo', 'logo', 'logotipo',
            'salón', 'salon', 'cocina', 'dormitorio', 'habitación', 'habitacion',
            'baño', 'bano', 'terraza', 'balcón', 'balcon', 'fachada', 'vista',
            'plano', 'planos', 'exterior', 'interior', 'pasillo', 'entrada',
          ];
          const esNombreValido = (s) => {
            if (!s) return false;
            const low = s.toLowerCase().trim();
            if (low.length < 3 || low.length > 80) return false;
            return !NOMBRE_VENDEDOR_BASURA.some(b => low.includes(b));
          };

          // Solo logos dentro de secciones de branding/advertiser, NO imgs de galería
          const logoImg = el.querySelector(
            '[class*="logo-branding"] img, [class*="branding-name"] img, ' +
            'a[href*="/agencias/"] img, a[href*="/pro/"] img, picture.logo img'
          );
          const nombreLogo = logoImg ? (logoImg.alt || '').trim() : '';
          const nameEl = el.querySelector('[class*="advertiser"], [class*="professional"], [class*="branding-name"], .item-branding, a[href*="/agencias/"]');
          const nombreTexto = nameEl ? (nameEl.innerText || '').trim() : '';
          const candidato = esNombreValido(nombreLogo) ? nombreLogo
            : esNombreValido(nombreTexto) ? nombreTexto
            : null;
          const nombre_vendedor = candidato;
          const hasBranding = !!(logoImg || nameEl);

          out.push({
            url: href,
            titulo,
            precio,
            nombre_vendedor,
            es_particular: !hasBranding,
          });
        }
        return out;
      });

      console.log(`[Scraper] Encontrados ${listingData.length} anuncios en página ${pageNum}`);

      if (listingData.length === 0) {
        if (pageNum === 1) {
          console.warn('[Scraper] Página 1 sin anuncios — verifica que la URL de la campaña o la pestaña abierta en Chrome apunta a resultados de búsqueda válidos.');
        } else {
          console.log('[Scraper] Sin más anuncios en esta página. Parando paginación.');
        }
        break;
      }

      // ── Fase 2: abrir ficha para teléfono + características + vendedor ───
      // El teléfono lo extraemos aquí, no en la fase 1, porque el botón
      // "Ver teléfono" está siempre en la página de detalle y es donde
      // `extractPhone()` funciona de forma fiable.
      for (let i = 0; i < listingData.length; i++) {
        // Checkpoint de cancelación entre fichas
        if (shouldAbort && shouldAbort()) {
          console.log('[Scraper] Abortando scraping (usuario pausó).');
          break;
        }

        const ld = listingData[i];

        // Filtro de precio
        if (params.precio_min && ld.precio && ld.precio < params.precio_min) continue;
        if (params.precio_max && ld.precio && ld.precio > params.precio_max) continue;

        console.log(`[Scraper] [${i + 1}/${listingData.length}] ${ld.titulo || ld.url}`);

        let telefono = null;
        let caracteristicas = null;
        let nombre_vendedor = ld.nombre_vendedor;
        let es_particular = ld.es_particular;

        let detailPage = null;
        try {
          detailPage = await browser.newPage();
          await detailPage.goto(ld.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await sleep(1000, 2000);
          await detectAndSolveCaptcha(detailPage);

          // Clic en "Ver teléfono" dentro de la ficha
          telefono = await extractPhone(detailPage);

          // Características del piso
          caracteristicas = await extractCaracteristicas(detailPage);
          const numCar = caracteristicas ? Object.keys(caracteristicas).length : 0;
          if (numCar === 0) {
            console.warn(`[Scraper]   ⚠ características vacías en ${ld.url}`);
          }

          // SIEMPRE intentar sacar el vendedor de la ficha — el del listado
          // puede ser basura (alt-text de imágenes, "Primera foto...", etc.)
          const sellerDetail = await extractSellerInfo(detailPage);
          if (sellerDetail.nombre_vendedor) {
            nombre_vendedor = sellerDetail.nombre_vendedor;
            es_particular = sellerDetail.es_particular;
          }
        } catch (err) {
          console.warn(`[Scraper] Error extrayendo detalles de ${ld.url}:`, err.message);
        } finally {
          if (detailPage) {
            try { await detailPage.close(); } catch {}
          }
        }

        if (telefono) {
          console.log(`[Scraper]   ✓ Tel: ${telefono} · ${nombre_vendedor || '(particular)'} · ${ld.precio ? ld.precio + '€' : 'sin precio'}`);
        } else {
          console.log(`[Scraper]   ✗ Sin teléfono revelable · ${ld.precio ? ld.precio + '€' : 'sin precio'}`);
        }

        const lead = {
          titulo: ld.titulo,
          precio: ld.precio,
          url_anuncio: ld.url,
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

        if (onLead) {
          try { await onLead(lead); } catch (e) { /* no bloquear el scraping */ }
        }

        await sleep(1500, 3000);
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
