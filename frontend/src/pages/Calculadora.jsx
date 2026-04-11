import { useState, useEffect, useMemo } from 'react';
import {
  Calculator, Home, TrendingUp, Percent, Building2, Wrench,
  Banknote, Receipt, Info, RefreshCw,
} from 'lucide-react';
import { propiedadesApi } from '../api';

// ─── Helpers de formato ──────────────────────────────────────────────────────
const fmtEUR = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n);
};
const fmtEUR2 = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
  }).format(n);
};
const fmtPct = (n) => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
};
const num = (v) => {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

// ─── Valores por defecto ─────────────────────────────────────────────────────
// Defaults orientados al mercado español: ITP 10% (segunda mano Comunidad
// Valenciana / media), 2% de escrituras/notaría/registro/gestoría/tasación.
const emptyForm = {
  modo: 'alquiler',         // 'alquiler' | 'venta' (flip)
  fuente: 'manual',         // 'manual' | 'cartera'
  propiedadId: '',
  titulo: '',

  // ── Compra ──
  precioCompra: '',
  m2: '',
  itpPct: 10,
  gastosEscrituraPct: 2,
  agenciaCompraPct: 0,

  // ── Reforma ──
  reforma: '',
  mobiliario: '',

  // ── Financiación ──
  conHipoteca: false,
  ltvPct: 80,
  interesPct: 3.5,
  plazoAnios: 30,

  // ── Alquiler ──
  alquilerMensual: '',
  mesesVacio: 1,
  ibiAnual: '',
  comunidadMensual: '',
  seguroHogarAnual: 300,
  seguroImpagoAnual: '',
  mantenimientoPct: 5,      // % del ingreso bruto
  gestionPct: 0,            // % del ingreso bruto

  // ── Venta (flip) ──
  precioVenta: '',
  agenciaVentaPct: 3,
  gastosVentaFijos: '',
  mesesTenencia: 6,
  irpfPlusvaliaPct: 0,
};

// ─── Cálculo de cuota hipotecaria (francés) ──────────────────────────────────
function calcCuotaMensual(capital, tasaAnual, años) {
  if (!capital || !años) return 0;
  const i = tasaAnual / 100 / 12;
  const n = años * 12;
  if (i === 0) return capital / n;
  return (capital * i) / (1 - Math.pow(1 + i, -n));
}

// ─── Componentes auxiliares ──────────────────────────────────────────────────
function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
        <Icon size={16} className="text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'number', suffix, placeholder, step, colSpan }) {
  return (
    <div className={colSpan === 2 ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          step={step}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-9"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function KPI({ label, value, tone = 'neutral', sub, big }) {
  const tones = {
    positive: 'text-green-700 bg-green-50 border-green-200',
    negative: 'text-red-700 bg-red-50 border-red-200',
    neutral: 'text-gray-900 bg-gray-50 border-gray-200',
    primary: 'text-blue-700 bg-blue-50 border-blue-200',
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className={`font-bold ${big ? 'text-2xl' : 'text-lg'} mt-0.5`}>{value}</p>
      {sub && <p className="text-[11px] opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function Calculadora() {
  const [form, setForm] = useState(emptyForm);
  const [propiedades, setPropiedades] = useState([]);

  // Cargar propiedades de la cartera (para el selector "Desde cartera")
  useEffect(() => {
    propiedadesApi.getAll()
      .then(setPropiedades)
      .catch(() => setPropiedades([]));
  }, []);

  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));
  const reset = () => setForm(emptyForm);

  // Al cambiar a fuente="cartera" + propiedad elegida, precargar datos
  const pickPropiedad = (id) => {
    const p = propiedades.find((x) => String(x.id) === String(id));
    if (!p) {
      setForm((f) => ({ ...f, propiedadId: '', titulo: '' }));
      return;
    }
    setForm((f) => ({
      ...f,
      propiedadId: id,
      titulo: `${p.tipo || ''} · ${p.poblacion || p.provincia || p.zona || ''}`.trim(),
      precioCompra: p.precio ?? '',
    }));
  };

  // ─── Cálculos (memo) ───────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const precioCompra = num(form.precioCompra);
    const m2 = num(form.m2);

    // Gastos de compra
    const itp = precioCompra * num(form.itpPct) / 100;
    const escritura = precioCompra * num(form.gastosEscrituraPct) / 100;
    const agenciaCompra = precioCompra * num(form.agenciaCompraPct) / 100;
    const gastosCompra = itp + escritura + agenciaCompra;

    // Reforma y mobiliario
    const reforma = num(form.reforma);
    const mobiliario = num(form.mobiliario);

    // Inversión total (coste de adquirir y poner a punto el inmueble)
    const inversionTotal = precioCompra + gastosCompra + reforma + mobiliario;

    // ── Financiación ──
    const prestamo = form.conHipoteca
      ? Math.min(precioCompra * num(form.ltvPct) / 100, precioCompra)
      : 0;
    const cuotaMensual = form.conHipoteca
      ? calcCuotaMensual(prestamo, num(form.interesPct), num(form.plazoAnios))
      : 0;
    const cuotaAnual = cuotaMensual * 12;

    // Capital propio aportado: lo que NO cubre el banco + todos los gastos
    // y la reforma (el banco rara vez financia nada de esto)
    const capitalPropio = inversionTotal - prestamo;

    // ── Modo ALQUILER ──
    const alquilerMensual = num(form.alquilerMensual);
    const mesesVacio = Math.max(0, Math.min(12, num(form.mesesVacio)));
    const ingresoAnualBruto = alquilerMensual * 12;
    const ingresoAnualEfectivo = alquilerMensual * (12 - mesesVacio);

    const ibi = num(form.ibiAnual);
    const comunidadAnual = num(form.comunidadMensual) * 12;
    const seguroHogar = num(form.seguroHogarAnual);
    const seguroImpago = num(form.seguroImpagoAnual);
    const mantenimientoAnual = ingresoAnualBruto * num(form.mantenimientoPct) / 100;
    const gestionAnual = ingresoAnualBruto * num(form.gestionPct) / 100;
    const gastosAnuales = ibi + comunidadAnual + seguroHogar + seguroImpago
                        + mantenimientoAnual + gestionAnual;

    // Rentabilidades alquiler
    const rentBruta = inversionTotal > 0
      ? (ingresoAnualBruto / inversionTotal) * 100
      : 0;
    const rentNeta = inversionTotal > 0
      ? ((ingresoAnualEfectivo - gastosAnuales) / inversionTotal) * 100
      : 0;

    // Flujo de caja (si hay hipoteca descuenta la cuota)
    const flujoAnual = ingresoAnualEfectivo - gastosAnuales - cuotaAnual;
    const flujoMensual = flujoAnual / 12;

    // Cash-on-cash: lo que ganas cada año sobre lo que REALMENTE pusiste
    const cashOnCash = capitalPropio > 0
      ? (flujoAnual / capitalPropio) * 100
      : 0;

    // Años de recuperación del capital propio
    const paybackAnios = flujoAnual > 0
      ? capitalPropio / flujoAnual
      : null;

    // €/m² compra
    const precioM2Compra = m2 > 0 ? precioCompra / m2 : 0;

    // ── Modo VENTA (flip) ──
    const precioVenta = num(form.precioVenta);
    const agenciaVenta = precioVenta * num(form.agenciaVentaPct) / 100;
    const gastosVentaFijos = num(form.gastosVentaFijos);
    const costesVenta = agenciaVenta + gastosVentaFijos;

    // Costes de mantenimiento durante la tenencia del flip: si tiene
    // hipoteca se incluyen las cuotas pagadas durante los meses de
    // tenencia, más una pequeña reserva para suministros/comunidad.
    const mesesTenencia = Math.max(0, num(form.mesesTenencia));
    const cuotasDuranteTenencia = cuotaMensual * mesesTenencia;
    const gastosTenencia = (num(form.comunidadMensual) * mesesTenencia)
                         + (num(form.ibiAnual) * mesesTenencia / 12)
                         + cuotasDuranteTenencia;

    const beneficioBruto = precioVenta - inversionTotal - costesVenta - gastosTenencia;
    const irpf = beneficioBruto > 0
      ? beneficioBruto * num(form.irpfPlusvaliaPct) / 100
      : 0;
    const beneficioNeto = beneficioBruto - irpf;

    const roi = inversionTotal > 0
      ? (beneficioBruto / inversionTotal) * 100
      : 0;
    const roiAnualizado = mesesTenencia > 0 && roi
      ? roi * (12 / mesesTenencia)
      : roi;

    // ROI sobre capital propio (apalancado)
    const roiCapitalPropio = capitalPropio > 0
      ? (beneficioNeto / capitalPropio) * 100
      : 0;

    const precioM2Venta = m2 > 0 ? precioVenta / m2 : 0;

    return {
      precioCompra, m2, precioM2Compra, precioM2Venta,
      itp, escritura, agenciaCompra, gastosCompra,
      reforma, mobiliario, inversionTotal,
      prestamo, cuotaMensual, cuotaAnual, capitalPropio,
      // Alquiler
      ingresoAnualBruto, ingresoAnualEfectivo,
      gastosAnuales, ibi, comunidadAnual, seguroHogar, seguroImpago,
      mantenimientoAnual, gestionAnual,
      rentBruta, rentNeta, flujoAnual, flujoMensual,
      cashOnCash, paybackAnios,
      // Venta
      precioVenta, costesVenta, gastosTenencia,
      beneficioBruto, irpf, beneficioNeto,
      roi, roiAnualizado, roiCapitalPropio,
    };
  }, [form]);

  const isAlquiler = form.modo === 'alquiler';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator className="text-blue-600" />
            Calculadora de rentabilidad
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Analiza si una operación merece la pena antes de lanzarte.
          </p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Limpiar
        </button>
      </div>

      {/* Selector de modo y fuente */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => set('modo')('alquiler')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              isAlquiler
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Home size={16} /> Buy-to-let (alquiler)
          </button>
          <button
            onClick={() => set('modo')('venta')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              !isAlquiler
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <TrendingUp size={16} /> Flip (compra-venta)
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Origen de los datos</label>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => set('fuente')('manual')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                  form.fuente === 'manual' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                Manual
              </button>
              <button
                onClick={() => set('fuente')('cartera')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                  form.fuente === 'cartera' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                Desde cartera
              </button>
            </div>
          </div>

          {form.fuente === 'cartera' && (
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Propiedad {propiedades.length === 0 && <span className="text-gray-400">(cargando…)</span>}
              </label>
              <select
                value={form.propiedadId}
                onChange={(e) => pickPropiedad(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Elige una propiedad de tu cartera…</option>
                {propiedades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.tipo} · {p.poblacion || p.provincia || p.zona || 's/ubicación'} · {fmtEUR(p.precio)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {form.titulo && (
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            <Info size={12} /> Analizando: <span className="font-medium text-gray-700">{form.titulo}</span>
          </div>
        )}
      </div>

      {/* Grid principal: formulario (2/3) + resultados (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* ── Columna formulario ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <Section title="Compra" icon={Building2}>
            <Field
              label="Precio de compra (€)"
              value={form.precioCompra}
              onChange={set('precioCompra')}
              placeholder="150000"
              colSpan={2}
            />
            <Field
              label="m² (opcional, para precio/m²)"
              value={form.m2}
              onChange={set('m2')}
              placeholder="80"
              suffix="m²"
            />
            <Field
              label="ITP / IVA"
              value={form.itpPct}
              onChange={set('itpPct')}
              suffix="%"
              step="0.1"
            />
            <Field
              label="Notaría + registro + gestoría + tasación"
              value={form.gastosEscrituraPct}
              onChange={set('gastosEscrituraPct')}
              suffix="%"
              step="0.1"
            />
            <Field
              label="Comisión agencia compra"
              value={form.agenciaCompraPct}
              onChange={set('agenciaCompraPct')}
              suffix="%"
              step="0.1"
            />
          </Section>

          <Section title="Reforma y mobiliario" icon={Wrench}>
            <Field
              label="Coste de reforma (€)"
              value={form.reforma}
              onChange={set('reforma')}
              placeholder="15000"
            />
            <Field
              label="Mobiliario / electrodomésticos (€)"
              value={form.mobiliario}
              onChange={set('mobiliario')}
              placeholder="5000"
            />
          </Section>

          <Section title="Financiación" icon={Banknote}>
            <label className="sm:col-span-2 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.conHipoteca}
                onChange={(e) => set('conHipoteca')(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Financiar con hipoteca</span>
            </label>
            {form.conHipoteca && (
              <>
                <Field
                  label="LTV (% financiado sobre precio)"
                  value={form.ltvPct}
                  onChange={set('ltvPct')}
                  suffix="%"
                  step="1"
                />
                <Field
                  label="Tipo de interés (TIN)"
                  value={form.interesPct}
                  onChange={set('interesPct')}
                  suffix="%"
                  step="0.05"
                />
                <Field
                  label="Plazo"
                  value={form.plazoAnios}
                  onChange={set('plazoAnios')}
                  suffix="años"
                  step="1"
                />
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                  <p className="text-[11px] font-medium text-blue-700 uppercase">Cuota mensual</p>
                  <p className="text-lg font-bold text-blue-900">{fmtEUR2(calc.cuotaMensual)}</p>
                  <p className="text-[11px] text-blue-700 mt-0.5">
                    Préstamo: {fmtEUR(calc.prestamo)}
                  </p>
                </div>
              </>
            )}
          </Section>

          {isAlquiler ? (
            <>
              <Section title="Ingresos por alquiler" icon={Home}>
                <Field
                  label="Alquiler mensual (€)"
                  value={form.alquilerMensual}
                  onChange={set('alquilerMensual')}
                  placeholder="750"
                />
                <Field
                  label="Meses vacíos al año"
                  value={form.mesesVacio}
                  onChange={set('mesesVacio')}
                  suffix="meses"
                  step="0.5"
                />
              </Section>

              <Section title="Gastos recurrentes" icon={Receipt}>
                <Field
                  label="IBI anual (€)"
                  value={form.ibiAnual}
                  onChange={set('ibiAnual')}
                  placeholder="250"
                />
                <Field
                  label="Comunidad (€/mes)"
                  value={form.comunidadMensual}
                  onChange={set('comunidadMensual')}
                  placeholder="40"
                />
                <Field
                  label="Seguro hogar anual (€)"
                  value={form.seguroHogarAnual}
                  onChange={set('seguroHogarAnual')}
                  placeholder="300"
                />
                <Field
                  label="Seguro de impago anual (€)"
                  value={form.seguroImpagoAnual}
                  onChange={set('seguroImpagoAnual')}
                  placeholder="250"
                />
                <Field
                  label="Reserva mantenimiento"
                  value={form.mantenimientoPct}
                  onChange={set('mantenimientoPct')}
                  suffix="% alq."
                  step="0.5"
                />
                <Field
                  label="Gestión / administración"
                  value={form.gestionPct}
                  onChange={set('gestionPct')}
                  suffix="% alq."
                  step="0.5"
                />
              </Section>
            </>
          ) : (
            <Section title="Venta (flip)" icon={TrendingUp}>
              <Field
                label="Precio de venta objetivo (€)"
                value={form.precioVenta}
                onChange={set('precioVenta')}
                placeholder="220000"
                colSpan={2}
              />
              <Field
                label="Comisión agencia venta"
                value={form.agenciaVentaPct}
                onChange={set('agenciaVentaPct')}
                suffix="%"
                step="0.1"
              />
              <Field
                label="Gastos fijos de venta (€)"
                value={form.gastosVentaFijos}
                onChange={set('gastosVentaFijos')}
                placeholder="1500"
              />
              <Field
                label="Meses de tenencia"
                value={form.mesesTenencia}
                onChange={set('mesesTenencia')}
                suffix="meses"
                step="1"
              />
              <Field
                label="IRPF plusvalía (opcional)"
                value={form.irpfPlusvaliaPct}
                onChange={set('irpfPlusvaliaPct')}
                suffix="%"
                step="0.5"
              />
            </Section>
          )}
        </div>

        {/* ── Columna resultados (sticky en desktop) ─────────────────── */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-4 space-y-4">
            {/* KPIs principales */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                <Percent size={16} className="text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-800">Resultados</h3>
              </div>

              {isAlquiler ? (
                <div className="space-y-2">
                  <KPI
                    label="Rentabilidad neta"
                    value={fmtPct(calc.rentNeta)}
                    sub="Sobre inversión total"
                    tone={calc.rentNeta >= 5 ? 'positive' : calc.rentNeta >= 3 ? 'primary' : 'negative'}
                    big
                  />
                  <KPI
                    label="Rentabilidad bruta"
                    value={fmtPct(calc.rentBruta)}
                    sub={`${fmtEUR(calc.ingresoAnualBruto)} / año`}
                  />
                  {form.conHipoteca && (
                    <>
                      <KPI
                        label="Cash-on-cash"
                        value={fmtPct(calc.cashOnCash)}
                        sub={`Sobre ${fmtEUR(calc.capitalPropio)} propios`}
                        tone={calc.cashOnCash >= 8 ? 'positive' : calc.cashOnCash >= 0 ? 'primary' : 'negative'}
                      />
                      <KPI
                        label="Flujo de caja mensual"
                        value={fmtEUR2(calc.flujoMensual)}
                        sub={`${fmtEUR(calc.flujoAnual)} / año`}
                        tone={calc.flujoMensual >= 0 ? 'positive' : 'negative'}
                      />
                    </>
                  )}
                  {!form.conHipoteca && (
                    <KPI
                      label="Flujo de caja anual"
                      value={fmtEUR(calc.flujoAnual)}
                      sub={`${fmtEUR2(calc.flujoMensual)} / mes`}
                      tone={calc.flujoAnual >= 0 ? 'positive' : 'negative'}
                    />
                  )}
                  {calc.paybackAnios && calc.paybackAnios > 0 && (
                    <KPI
                      label="Payback capital"
                      value={`${calc.paybackAnios.toFixed(1)} años`}
                      sub="Años para recuperar lo invertido"
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <KPI
                    label="Beneficio neto"
                    value={fmtEUR(calc.beneficioNeto)}
                    sub={`Bruto: ${fmtEUR(calc.beneficioBruto)}`}
                    tone={calc.beneficioNeto > 0 ? 'positive' : 'negative'}
                    big
                  />
                  <KPI
                    label="ROI sobre inversión"
                    value={fmtPct(calc.roi)}
                    sub={`Anualizado: ${fmtPct(calc.roiAnualizado)}`}
                    tone={calc.roi >= 15 ? 'positive' : calc.roi >= 0 ? 'primary' : 'negative'}
                  />
                  {form.conHipoteca && (
                    <KPI
                      label="ROI capital propio"
                      value={fmtPct(calc.roiCapitalPropio)}
                      sub={`Sobre ${fmtEUR(calc.capitalPropio)}`}
                      tone={calc.roiCapitalPropio > 0 ? 'positive' : 'negative'}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Desglose de inversión */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-100">
                Desglose de inversión
              </h3>
              <dl className="text-sm space-y-1.5">
                <Row label="Precio de compra" value={fmtEUR(calc.precioCompra)} />
                <Row label={`ITP (${form.itpPct || 0}%)`} value={fmtEUR(calc.itp)} sub />
                <Row label={`Escritura (${form.gastosEscrituraPct || 0}%)`} value={fmtEUR(calc.escritura)} sub />
                {num(form.agenciaCompraPct) > 0 && (
                  <Row label={`Agencia compra (${form.agenciaCompraPct}%)`} value={fmtEUR(calc.agenciaCompra)} sub />
                )}
                {num(form.reforma) > 0 && <Row label="Reforma" value={fmtEUR(calc.reforma)} />}
                {num(form.mobiliario) > 0 && <Row label="Mobiliario" value={fmtEUR(calc.mobiliario)} />}
                <div className="border-t border-gray-100 my-2" />
                <Row label="Inversión total" value={fmtEUR(calc.inversionTotal)} bold />
                {form.conHipoteca && (
                  <>
                    <Row label="Préstamo" value={`- ${fmtEUR(calc.prestamo)}`} muted />
                    <Row label="Capital propio" value={fmtEUR(calc.capitalPropio)} bold />
                  </>
                )}
                {calc.m2 > 0 && (
                  <>
                    <div className="border-t border-gray-100 my-2" />
                    <Row label="Precio / m² compra" value={fmtEUR(calc.precioM2Compra)} muted />
                    {!isAlquiler && calc.precioVenta > 0 && (
                      <Row label="Precio / m² venta" value={fmtEUR(calc.precioM2Venta)} muted />
                    )}
                  </>
                )}
              </dl>
            </div>

            {isAlquiler && calc.gastosAnuales > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-100">
                  Gastos anuales
                </h3>
                <dl className="text-sm space-y-1.5">
                  {num(form.ibiAnual) > 0 && <Row label="IBI" value={fmtEUR(calc.ibi)} sub />}
                  {num(form.comunidadMensual) > 0 && <Row label="Comunidad" value={fmtEUR(calc.comunidadAnual)} sub />}
                  {num(form.seguroHogarAnual) > 0 && <Row label="Seguro hogar" value={fmtEUR(calc.seguroHogar)} sub />}
                  {num(form.seguroImpagoAnual) > 0 && <Row label="Seguro impago" value={fmtEUR(calc.seguroImpago)} sub />}
                  {calc.mantenimientoAnual > 0 && <Row label="Mantenimiento" value={fmtEUR(calc.mantenimientoAnual)} sub />}
                  {calc.gestionAnual > 0 && <Row label="Gestión" value={fmtEUR(calc.gestionAnual)} sub />}
                  <div className="border-t border-gray-100 my-2" />
                  <Row label="Total gastos" value={fmtEUR(calc.gastosAnuales)} bold />
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, muted, sub }) {
  return (
    <div className={`flex items-center justify-between ${sub ? 'pl-3 text-xs' : ''}`}>
      <dt className={`${bold ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-600'}`}>{label}</dt>
      <dd className={`tabular-nums ${bold ? 'font-bold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'}`}>{value}</dd>
    </div>
  );
}
