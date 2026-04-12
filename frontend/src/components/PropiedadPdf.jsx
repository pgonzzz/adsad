/**
 * Genera un "PDF" de una propiedad abriendo una ventana nueva con
 * HTML optimizado para impresión. El usuario puede guardar como PDF
 * desde el diálogo de impresión del navegador (⌘P / Ctrl+P).
 *
 * No requiere librerías externas — usa la API nativa window.print().
 */

function fmtEUR(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function generatePropiedadPdf(propiedad) {
  const p = propiedad;
  const ubicacion = [p.direccion, p.poblacion, p.provincia].filter(Boolean).join(', ');
  const precioM2 =
    p.precio && p.m2 ? Math.round(p.precio / p.m2).toLocaleString('es-ES') + ' €/m²' : '';

  const specs = [
    p.m2 && `${p.m2} m²`,
    p.habitaciones && `${p.habitaciones} habitaciones`,
    p.banos && `${p.banos} baños`,
    p.planta && `Planta ${p.planta}`,
    p.anio_construccion && `Año ${p.anio_construccion}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const fotos = (p.fotos || []).slice(0, 6);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${p.tipo ? p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1) : 'Propiedad'} — ${ubicacion || 'Pisalia CRM'}</title>
  <style>
    @page { margin: 20mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.6; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
    .header h1 { font-size: 22px; font-weight: 700; text-transform: capitalize; color: #1e40af; }
    .header .logo { font-size: 12px; color: #6b7280; text-align: right; }
    .header .logo strong { font-size: 14px; color: #1e40af; display: block; }
    .ubicacion { color: #4b5563; font-size: 14px; margin-top: 4px; }
    .stats { display: flex; gap: 32px; margin: 20px 0; }
    .stat { }
    .stat .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; }
    .stat .value { font-size: 20px; font-weight: 700; color: #111827; }
    .stat .sub { font-size: 11px; color: #9ca3af; }
    .stat.blue .value { color: #2563eb; }
    .stat.indigo .value { color: #4f46e5; }
    .specs { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #374151; }
    .section { margin-top: 20px; }
    .section h2 { font-size: 14px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 10px; }
    .description { color: #4b5563; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 500; }
    .badge.green { background: #dcfce7; color: #166534; }
    .badge.estado { background: #dbeafe; color: #1e40af; }
    .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
    .photos img { width: 100%; height: 140px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; }
    .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
    .ref { font-family: monospace; font-size: 11px; color: #6b7280; margin-top: 6px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${p.tipo || 'Propiedad'}</h1>
      ${ubicacion ? `<div class="ubicacion">${ubicacion}</div>` : ''}
      <div class="badges">
        <span class="badge estado">${(p.estado || 'disponible').replace('_', ' ')}</span>
        ${p.acepta_financiacion ? '<span class="badge green">Acepta financiación</span>' : ''}
      </div>
    </div>
    <div class="logo">
      <strong>Pisalia CRM</strong>
      ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
    </div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="label">Precio</div>
      <div class="value">${fmtEUR(p.precio)}</div>
      ${precioM2 ? `<div class="sub">${precioM2}</div>` : ''}
    </div>
    ${p.rentabilidad_bruta ? `<div class="stat blue"><div class="label">Rent. bruta</div><div class="value">${p.rentabilidad_bruta}%</div></div>` : ''}
    ${p.rentabilidad_neta ? `<div class="stat indigo"><div class="label">Rent. neta</div><div class="value">${p.rentabilidad_neta}%</div></div>` : ''}
  </div>

  ${specs ? `<div class="specs">${specs}</div>` : ''}

  ${p.descripcion ? `<div class="section"><h2>Descripción</h2><p class="description">${p.descripcion}</p></div>` : ''}

  ${p.ref_catastral ? `<div class="ref">Ref. catastral: ${p.ref_catastral}</div>` : ''}

  ${
    fotos.length > 0
      ? `<div class="section"><h2>Fotos</h2><div class="photos">${fotos.map((url) => `<img src="${url}" />`).join('')}</div></div>`
      : ''
  }

  ${p.notas ? `<div class="section"><h2>Notas</h2><p class="description">${p.notas}</p></div>` : ''}

  <div class="footer">
    <span>Generado desde Pisalia CRM</span>
    <span>ID: ${p.id || '—'}</span>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador ha bloqueado la ventana emergente. Permite pop-ups para esta página.');
    return;
  }
  win.document.write(html);
  win.document.close();
  // Esperar a que las imágenes carguen antes de imprimir
  win.onload = () => {
    setTimeout(() => win.print(), 300);
  };
}
