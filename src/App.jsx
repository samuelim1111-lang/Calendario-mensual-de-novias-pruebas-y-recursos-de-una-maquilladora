import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as D from './domain.js';
import { cargar, guardar, setSimularFallo, getSimularFallo, STORAGE_KEY } from './storage.js';
import { crearSeed, RECURSOS_SEED, SERVICIOS_SEED } from './seed.js';
import { TARIFAS_DEFECTO } from './domain.js';

// ---------------- utilidades de UI ----------------
const cx = (...a) => a.filter(Boolean).join(' ');
const ESTADO_CHIP = {
  Consulta: 'border border-dashed border-tinta/30 text-tinta-soft bg-white',
  'Fecha retenida': 'border border-dashed border-oro text-oro-700 bg-oro-100/60',
  Señada: 'border border-rosa-300 text-rosa-700 bg-rosa-100',
  Realizada: 'border border-tinta/20 text-tinta bg-crema-2',
  'Saldo pagado': 'border border-salvia/40 text-salvia-700 bg-salvia-100',
  Cancelada: 'border border-tinta/15 text-tinta-soft bg-white/60 line-through',
};
const DIA_BADGE = {
  Libre: 'text-salvia-700 bg-salvia-100',
  Parcial: 'text-oro-700 bg-oro-100',
  Completo: 'text-rojo bg-rojo-100 border border-rojo/30',
  Cerrado: 'text-tinta-soft bg-tinta/5',
};
const DIA_PUNTO = { Libre: 'bg-salvia', Parcial: 'bg-oro', Completo: 'bg-rojo', Cerrado: 'bg-tinta/20' };

function useHash() {
  const get = () => (window.location.hash || '#calendario').slice(1);
  const [h, setH] = useState(get);
  useEffect(() => {
    const on = () => { setH(get()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((name) => { if (('#' + name) === window.location.hash) setH(name); else window.location.hash = name; }, []);
  return [h, go];
}

function Btn({ variant = 'primary', className, ...p }) {
  const v = {
    primary: 'bg-tinta text-crema hover:bg-tinta/90 disabled:bg-tinta/30',
    gold: 'bg-oro-100 text-oro-700 border border-oro/60 hover:bg-oro/20 disabled:opacity-40',
    soft: 'bg-white border border-tinta/15 text-tinta hover:border-oro disabled:opacity-40',
    ghost: 'text-tinta-soft hover:text-tinta hover:bg-tinta/5',
    danger: 'bg-white border border-rojo/50 text-rojo hover:bg-rojo-100 disabled:opacity-40',
  }[variant];
  return <button type="button" className={cx('inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm tracking-wide transition disabled:cursor-not-allowed', v, className)} {...p} />;
}

function Field({ label, error, hint, children, htmlFor, className }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs uppercase tracking-[0.14em] text-tinta-soft">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-tinta-soft">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rojo" role="alert">{error}</p>}
    </div>
  );
}
const inputCls = (err) => cx('w-full rounded-xl border bg-white px-3 py-2.5 text-[15px] text-tinta outline-none transition focus:border-oro focus:ring-2 focus:ring-oro/20', err ? 'border-rojo' : 'border-tinta/15');

function Card({ className, children }) {
  return <section className={cx('compartimento rounded-2xl border border-tinta/10 bg-white/80 p-4 sm:p-6', className)}>{children}</section>;
}
function AvisoDemo({ children, className }) {
  return (
    <p className={cx('rounded-xl border border-oro/40 bg-oro-100 px-3 py-2 text-sm text-oro-700', className)}>
      <span className="mr-1.5 rounded-full bg-oro-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">Demo</span>{children}
    </p>
  );
}
function H1({ children, sub }) {
  return (
    <div className="mb-5">
      <h1 className="font-serif text-3xl font-light tracking-wide text-tinta sm:text-4xl">{children}</h1>
      <div className="mt-2 h-px w-16 bg-oro/60" aria-hidden="true" />
      {sub && <p className="mt-2 text-sm text-tinta-soft">{sub}</p>}
    </div>
  );
}
function EstadoChip({ estado, className }) {
  return <span className={cx('inline-block rounded-full px-2 py-0.5 text-[11px] leading-4', ESTADO_CHIP[estado], className)}>{estado}</span>;
}

function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-crema p-5 shadow-xl outline-none sm:rounded-3xl sm:p-7', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-serif text-2xl font-light text-tinta">{title}</h2>
          <button type="button" onClick={onClose} className="-mr-2 -mt-1 rounded-full px-3 py-1 text-xl text-tinta-soft hover:bg-tinta/5" aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const servicioDe = (data, id) => data.servicios.find((s) => s.id === id);
const recursoDe = (data, id) => data.recursos.find((r) => r.id === id);
const minDia = (ms) => Math.round((((ms % 86400000) + 86400000) % 86400000) / 60000);

// ---------------- App ----------------
export default function App() {
  const inicial = useMemo(() => cargar(), []);
  const [data, setData] = useState(inicial.data);
  const [saveError, setSaveError] = useState(inicial.aviso || null);
  const [toast, setToast] = useState(null);
  const [route, go] = useHash();
  const [tick, setTick] = useState(Date.now());
  const ahoraWall = useMemo(() => D.nowWall(new Date(tick)), [tick]);

  const [recienCreada, setRecienCreada] = useState(null);
  const [borrador, setBorrador] = useState(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const persistir = useCallback((next) => {
    const err = guardar(next);
    setSaveError(err);
    return err;
  }, []);

  // Cada acción guarda el conjunto completo de datos de la demo. Si el guardado
  // falla, no se aplica nada: ni la reserva, ni recursos, ni el correlativo.
  const commit = useCallback((updater, msg) => {
    const prev = dataRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    const err = guardar(next);
    if (err) { setSaveError(err); return { ok: false, error: err }; }
    dataRef.current = next;
    setData(next);
    setSaveError(null);
    if (msg) setToast(msg);
    return { ok: true, data: next };
  }, []);

  useEffect(() => { if (inicial.info) setToast(inicial.info); }, []);
  // Primer guardado de los datos sintéticos.
  useEffect(() => { if (inicial.nuevo) persistir(inicial.data); }, []);

  // Vencimiento automático de retenidas (al abrir y cada 30 s).
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const { reservas, cambios } = D.vencerRetenidas(data.reservas, tick);
    if (cambios) commit((d) => ({ ...d, reservas: D.vencerRetenidas(d.reservas, tick).reservas }), `${cambios === 1 ? 'Una fecha retenida venció' : `${cambios} fechas retenidas vencieron`} (48 h sin seña) y se liberaron sus recursos.`);
  }, [tick, data.reservas, commit]);

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 4200); return () => clearTimeout(id); }, [toast]);

  const ctx = { data, commit, go, ahoraWall, ahoraMs: tick, setToast, recienCreada, setRecienCreada, borrador, setBorrador };

  let view;
  if (route.startsWith('nueva')) view = <NuevaReserva {...ctx} fechaInicial={route.slice(6)} key={route} />;
  else if (route.startsWith('reserva-')) view = <DetalleReserva {...ctx} id={route.slice(8)} key={route} />;
  else if (route === 'recursos') view = <Recursos {...ctx} />;
  else if (route === 'servicios') view = <Servicios {...ctx} />;
  else if (route === 'ajustes') view = <Ajustes {...ctx} />;
  else view = <Calendario {...ctx} />;

  const tabs = [['calendario', 'Calendario'], ['nueva', 'Nueva reserva'], ['recursos', 'Recursos'], ['servicios', 'Servicios y tarifas'], ['ajustes', 'Ajustes']];
  const activo = route.startsWith('reserva-') ? 'calendario' : route.startsWith('nueva') ? 'nueva' : (tabs.find((t) => t[0] === route)?.[0] || 'calendario');

  return (
    <div className="min-h-screen bg-crema font-sans font-light text-tinta">
      <header className="tela sticky top-0 z-30 border-b border-oro/30 bg-crema-2/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:py-3">
          <a href="#calendario" className="flex items-baseline gap-2">
            <span className="font-serif text-2xl font-light italic text-tinta">Agenda de novias</span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-oro-700">maquillaje · Montevideo</span>
          </a>
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 sm:pb-0" aria-label="Secciones">
            {tabs.map(([id, label]) => (
              <a key={id} href={'#' + id} aria-current={activo === id ? 'page' : undefined}
                className={cx('whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] tracking-wide transition', activo === id ? 'bg-tinta text-crema' : 'text-tinta-soft hover:bg-tinta/5 hover:text-tinta')}>
                {label}
              </a>
            ))}
          </nav>
        </div>
        {saveError && (
          <div role="alert" className="border-t border-rojo/30 bg-rojo-100 px-4 py-2 text-sm text-rojo">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
              <span><strong className="font-semibold">No se pudo guardar.</strong> {saveError} El cambio no se aplicó: lo que estabas cargando sigue en pantalla para que lo reintentes.</span>
              <Btn variant="danger" className="py-1" onClick={() => setSaveError(null)}>Cerrar aviso</Btn>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{view}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center text-[11px] uppercase tracking-[0.25em] text-tinta-soft/70">Montevideo · martes a domingo de 07:00 a 20:00 · lunes sin reservas</footer>
      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl bg-tinta px-4 py-3 text-sm text-crema shadow-lg">{toast}</div>
      )}
    </div>
  );
}

// ---------------- Calendario ----------------
function Calendario({ data, go, ahoraWall, ahoraMs }) {
  const hoy = D.dayKey(ahoraWall);
  const [ym, setYm] = useState(() => ({ y: +hoy.slice(0, 4), m: +hoy.slice(5, 7) - 1 }));
  const [fRecurso, setFRecurso] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [diaAbierto, setDiaAbierto] = useState(null);

  const nDias = D.daysInMonth(ym.y, ym.m);
  const keys = Array.from({ length: nDias }, (_, i) => `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  const prefijo = keys[0].slice(0, 7);

  const delMes = data.reservas.filter((r) => r.inicio && r.inicio.startsWith(prefijo));
  const sinFecha = data.reservas.filter((r) => !r.inicio && r.estado === 'Consulta');
  const pasa = (r) => (!fEstado || r.estado === fEstado) &&
    (!fRecurso || D.ocupacionDeReserva(r, data.servicios, data.recursos).some((o) => o.recursoId === fRecurso));
  const filtradas = delMes.filter(pasa).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const porDia = {};
  for (const r of filtradas) (porDia[D.dayKey(r.inicio)] ||= []).push(r);
  const estados = Object.fromEntries(keys.map((k) => [k, D.estadoDia(k, data, fRecurso || null)]));

  const mover = (d) => setYm(({ y, m }) => { const n = m + d; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });
  const offset = (D.weekdayOfKey(keys[0]) + 6) % 7; // lunes primero
  const vacioMes = delMes.length === 0;
  // Frases cortas, como en una agenda: días completos, fechas por vencer y saldos próximos.
  const limiteSaldos = D.addDaysKey(hoy, 14);
  const atender = [
    ...keys.filter((k) => k >= hoy && estados[k] === 'Completo').map((k) => ({ key: 'c' + k, texto: D.fraseDia(k, 'Completo'), tono: 'rojo', abrir: () => setDiaAbierto(k) })),
    ...data.reservas.filter((r) => r.estado === 'Fecha retenida').sort((a, b) => D.venceEn(a, ahoraMs) - D.venceEn(b, ahoraMs))
      .map((r) => ({ key: r.id, texto: `Fecha retenida, ${D.fraseVence(D.venceEn(r, ahoraMs))}`, quien: r.novia.nombre, tono: 'oro', href: '#reserva-' + r.id })),
    ...data.reservas.filter((r) => r.estado === 'Señada' && r.inicio && D.addDaysKey(D.dayKey(r.inicio), -1) <= limiteSaldos && r.inicio >= hoy)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map((r) => ({ key: 's' + r.id, texto: D.fraseSaldo(r, ahoraWall), quien: r.novia.nombre, tono: 'rosa', href: '#reserva-' + r.id })),
  ].slice(0, 6);
  const TONO = { rojo: 'border-rojo/30 bg-rojo-100 text-rojo', oro: 'border-oro/50 bg-oro-100 text-oro-700', rosa: 'border-rosa-300 bg-rosa-100 text-rosa-700' };
  const recursoNombre = fRecurso ? recursoDe(data, fRecurso)?.nombre : 'la maquilladora';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-oro-700">Calendario</p>
          <h1 className="font-serif text-4xl font-light capitalize text-tinta sm:text-5xl">{D.nombreMes(ym.m)} <span className="text-tinta-soft">{ym.y}</span></h1>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Btn variant="soft" className="flex-1 whitespace-nowrap px-3 sm:flex-none sm:px-4" onClick={() => mover(-1)}>‹ Mes anterior</Btn>
          <Btn variant="ghost" className="px-2 sm:px-4" onClick={() => setYm({ y: +hoy.slice(0, 4), m: +hoy.slice(5, 7) - 1 })}>Hoy</Btn>
          <Btn variant="soft" className="flex-1 whitespace-nowrap px-3 sm:flex-none sm:px-4" onClick={() => mover(1)}>Mes siguiente ›</Btn>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Recurso" htmlFor="f-rec" className="min-w-[10rem] flex-1 sm:flex-none">
          <select id="f-rec" className={inputCls()} value={fRecurso} onChange={(e) => setFRecurso(e.target.value)}>
            <option value="">Todos</option>
            {data.recursos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </Field>
        <Field label="Estado" htmlFor="f-est" className="min-w-[10rem] flex-1 sm:flex-none">
          <select id="f-est" className={inputCls()} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="">Todos</option>
            {D.ESTADOS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <div className="flex flex-wrap gap-3 pb-2 text-xs text-tinta-soft sm:ml-auto">
          {['Libre', 'Parcial', 'Completo', 'Cerrado'].map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className={cx('gode', DIA_PUNTO[s])} aria-hidden="true" />{s}</span>)}
          <span className="hidden md:inline">· según {recursoNombre}</span>
        </div>
      </div>

      {atender.length > 0 && (
        <section className="mb-4" aria-label="Para atender">
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-tinta-soft">Para atender</p>
          <ul className="flex flex-wrap gap-2">
            {atender.map((a) => {
              const cuerpo = <><span className="font-semibold">{a.texto}</span>{a.quien && <span className="opacity-80"> · {a.quien}</span>}</>;
              const cls = cx('inline-block rounded-full border px-3 py-1 text-xs transition hover:brightness-95', TONO[a.tono]);
              return <li key={a.key}>{a.href ? <a href={a.href} className={cls}>{cuerpo}</a> : <button type="button" onClick={a.abrir} className={cls}>{cuerpo}</button>}</li>;
            })}
          </ul>
        </section>
      )}
      {vacioMes && (
        <div className="mb-4 rounded-2xl border border-dashed border-oro/40 bg-white/60 px-4 py-6 text-center">
          <p className="font-serif text-2xl font-light text-tinta">Sin reservas este mes</p>
          <p className="mt-1 text-sm text-tinta-soft">Tocá un día para ver su jornada o creá una reserva nueva.</p>
          <Btn variant="gold" className="mt-3" onClick={() => go('nueva')}>Nueva reserva</Btn>
        </div>
      )}
      {sinFecha.length > 0 && (
        <details className="mb-4 rounded-2xl border border-tinta/10 bg-white/80 px-4 py-3">
          <summary className="cursor-pointer text-sm text-tinta">Consultas sin fecha firme ({sinFecha.length}) <span className="text-tinta-soft">· no ocupan recursos</span></summary>
          <ul className="mt-2 divide-y divide-tinta/10 text-sm">
            {sinFecha.map((r) => <li key={r.id}><a href={'#reserva-' + r.id} className="flex flex-wrap justify-between gap-2 py-2 hover:text-rosa-700"><span>N.º {D.numeroReserva(r)} · {r.novia.nombre} · {servicioDe(data, r.servicioId)?.nombre}</span><EstadoChip estado={r.estado} /></a></li>)}
          </ul>
        </details>
      )}
      {!vacioMes && filtradas.length === 0 && (
        <p className="mb-4 rounded-xl bg-white/70 px-4 py-3 text-sm text-tinta-soft">Ninguna reserva de este mes coincide con los filtros.</p>
      )}

      {/* Grilla (≥ 640 px) */}
      <div className="hidden overflow-hidden rounded-2xl border border-tinta/10 bg-white/70 sm:block">
        <div className="grid grid-cols-7 border-b border-tinta/10 bg-crema-2/60">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <div key={d} className="px-2 py-2 text-center text-[11px] uppercase tracking-[0.2em] text-tinta-soft">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: offset }, (_, i) => <div key={'e' + i} className="min-h-[8.5rem] border-b border-r border-tinta/5 bg-crema/40" />)}
          {keys.map((k, i) => {
            const rs = porDia[k] || [];
            const est = estados[k];
            const esHoy = k === hoy;
            const pasado = k < hoy;
            return (
              <button type="button" key={k} onClick={() => setDiaAbierto(k)}
                className={cx('group relative flex min-h-[8.5rem] flex-col gap-1 border-b border-r border-tinta/5 p-1.5 text-left transition hover:bg-rosa-100/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oro lg:p-2', pasado && 'bg-crema/50', (offset + i) % 7 === 6 && 'border-r-0')}
                aria-label={`${D.fechaLarga(k)}: ${est}, ${rs.length} reservas`}>
                <div className="flex items-center justify-between gap-1">
                  <span className={cx('flex h-7 w-7 items-center justify-center rounded-full font-serif text-lg', esHoy ? 'bg-oro-100 text-oro-700 ring-1 ring-oro' : pasado ? 'text-tinta-soft/60' : 'text-tinta')}>{i + 1}</span>
                  <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] tracking-wide', DIA_BADGE[est])}>{est}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {rs.slice(0, 3).map((r) => (
                    <span key={r.id} className={cx('block truncate rounded-md px-1.5 py-0.5 text-[11px] leading-4', ESTADO_CHIP[r.estado])} title={`${D.timeOf(r.inicio)} ${servicioDe(data, r.servicioId)?.nombre} · ${r.estado}`}>
                      <span className="font-normal">{D.timeOf(r.inicio)}</span> {servicioDe(data, r.servicioId)?.nombre}<span className="block truncate text-[10px] opacity-80 no-underline">{r.estado}</span>
                    </span>
                  ))}
                  {rs.length > 3 && <span className="px-1 text-[11px] text-oro-700">+{rs.length - 3} más</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista del mes (móvil) */}
      <ol className="space-y-2 sm:hidden" aria-label="Lista del mes">
        {keys.filter((k) => porDia[k] || k === hoy || (estados[k] !== 'Libre' && estados[k] !== 'Cerrado')).map((k) => {
          const rs = porDia[k] || [];
          return (
            <li key={k}>
              <button type="button" onClick={() => setDiaAbierto(k)} className={cx('w-full rounded-2xl border bg-white/80 p-3 text-left', k === hoy ? 'border-oro' : 'border-tinta/10', k < hoy && 'opacity-70')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-serif text-xl text-tinta">{cap(D.fechaLarga(k))}</span>
                  <span className={cx('rounded-full px-2 py-0.5 text-[11px]', DIA_BADGE[estados[k]])}>{estados[k]}</span>
                </div>
                {rs.length === 0 && <p className="mt-1 text-xs text-tinta-soft">{k === hoy ? 'Hoy · sin reservas' : 'Sin reservas visibles'}</p>}
                <ul className="mt-2 space-y-1.5">
                  {rs.map((r) => (
                    <li key={r.id} className="flex items-start gap-2 text-sm">
                      <span className="w-11 shrink-0 pt-0.5 font-normal text-tinta">{D.timeOf(r.inicio)}</span>
                      <span className="min-w-0 flex-1 leading-snug" data-testid="fila-lista">
                        <span className="block">{servicioDe(data, r.servicioId)?.nombre}</span>
                        <span className="block text-xs text-tinta-soft">{r.novia.nombre}</span>
                      </span>
                      <span className="shrink-0"><EstadoChip estado={r.estado} /></span>
                    </li>
                  ))}
                </ul>
              </button>
            </li>
          );
        })}
      </ol>
      {!vacioMes && <p className="mt-3 text-xs text-tinta-soft sm:hidden">Se listan los días con reservas o con ocupación. Los lunes no se toman reservas. Usá «Nueva reserva» para un día libre.</p>}

      <DiaDetalle k={diaAbierto} onClose={() => setDiaAbierto(null)} data={data} go={go} ahoraWall={ahoraWall} fRecurso={fRecurso} />
    </div>
  );
}

function Timeline({ k, data, destacar }) {
  const d0 = D.parseWall(k);
  const ini = D.HORA_APERTURA; const fin = D.HORA_CIERRE; const span = fin - ini;
  const horas = Array.from({ length: (fin - ini) / 60 + 1 }, (_, i) => ini / 60 + i);
  const pct = (m) => `${((m - ini) / span) * 100}%`;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] pr-4">
        <div className="relative ml-26 h-5 text-[10px] text-tinta-soft">
          {horas.map((h) => <span key={h} className="absolute -translate-x-1/2" style={{ left: pct(h * 60) }}>{String(h).padStart(2, '0')}</span>)}
        </div>
        {data.recursos.map((rec) => {
          const occ = D.ocupacionRecursoDia(rec.id, k, data.reservas, data.servicios, data.recursos);
          const bloqueado = (rec.diasBloqueados || []).includes(k);
          return (
            <div key={rec.id} className="flex items-center gap-2 py-1">
              <div className="w-24 shrink-0 truncate text-xs text-tinta" title={rec.nombre}>{rec.nombre}</div>
              <div className={cx('relative h-9 flex-1 rounded-lg', bloqueado ? 'bg-[repeating-linear-gradient(45deg,#efe6dc,#efe6dc_6px,#f8f3ed_6px,#f8f3ed_12px)]' : 'bg-crema-2/70')}>
                {horas.map((h) => <span key={h} className="absolute top-0 h-full w-px bg-tinta/5" style={{ left: pct(h * 60) }} />)}
                {bloqueado && <span className="absolute inset-0 flex items-center justify-center text-[11px] text-tinta-soft">Día bloqueado</span>}
                {occ.map((o) => {
                  const b = Math.min(fin, (o.fin - d0) / 60000);
                  const r = data.reservas.find((x) => x.id === o.reservaId);
                  const am = (o.inicio - d0) / 60000;
                  return (
                    <a key={o.reservaId + rec.id} href={'#reserva-' + o.reservaId}
                      className={cx('absolute top-1 bottom-1 overflow-hidden rounded-md px-1.5 text-[10px] leading-[1.15] shadow-sm hover:brightness-105', r?.estado === 'Fecha retenida' ? 'border border-dashed border-oro bg-oro-100 text-oro-700' : r?.estado === 'Saldo pagado' ? 'border border-salvia/50 bg-salvia-100 text-salvia-700' : r?.estado === 'Realizada' ? 'border border-tinta/20 bg-crema-2 text-tinta' : 'bg-rosa text-tinta', destacar === o.reservaId && 'ring-2 ring-tinta')}
                      style={{ left: pct(Math.max(ini, am)), width: `${((b - Math.max(ini, am)) / span) * 100}%` }}
                      title={`${D.hhmm(am)}–${D.hhmm(b)} · ${r?.estado} · ${servicioDe(data, r?.servicioId)?.nombre} · ${r?.novia.nombre}`}>
                      <span className="block truncate pt-0.5 font-semibold">{D.hhmm(am)}–{D.hhmm(b)} · {r?.estado}</span>
                      <span className="block truncate opacity-90">{r?.novia.nombre}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiaDetalle({ k, onClose, data, go, ahoraWall, fRecurso }) {
  if (!k) return null;
  const rs = data.reservas.filter((r) => r.inicio && D.dayKey(r.inicio) === k).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const novias = D.noviasDelDia(k, data).length;
  const est = D.estadoDia(k, data, fRecurso || null);
  const pasado = k < D.dayKey(ahoraWall);
  const principal = data.recursos.find((r) => r.principal);
  const hs = principal ? D.huecos(principal.id, k, data) : [];
  return (
    <Modal open title={cap(D.fechaLarga(k))} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className={cx('rounded-full px-2.5 py-0.5 text-xs', DIA_BADGE[est])}>{D.fraseDia(k, est)}</span>
        {est !== 'Cerrado' && <span className="text-tinta-soft">Novias: {novias}/{D.MAX_NOVIAS_POR_DIA}</span>}
        {est === 'Cerrado' && <span className="text-tinta-soft">Los lunes no se toman reservas.</span>}
        {principal && est !== 'Cerrado' && <span className="text-tinta-soft">Huecos de {principal.nombre.split(' ·')[0]}: {hs.length ? hs.map(([a, b]) => `${D.hhmm(a)}–${D.hhmm(b)}`).join(', ') : 'ninguno'}</span>}
      </div>
      <Timeline k={k} data={data} />
      <h3 className="mt-6 mb-2 text-xs uppercase tracking-[0.2em] text-tinta-soft">Reservas del día</h3>
      {rs.length === 0 ? <p className="text-sm text-tinta-soft">Sin reservas este día.</p> : (
        <ul className="divide-y divide-tinta/10 rounded-xl border border-tinta/10 bg-white">
          {rs.map((r) => (
            <li key={r.id}>
              <a href={'#reserva-' + r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-rosa-100/40">
                <span className="w-12 font-normal">{D.timeOf(r.inicio)}</span>
                <span className="min-w-0 flex-1">{servicioDe(data, r.servicioId)?.nombre} <span className="text-tinta-soft">· {r.novia.nombre} · {r.lugar}</span></span>
                <EstadoChip estado={r.estado} />
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
        {!pasado && est !== 'Cerrado' && <Btn variant="gold" onClick={() => { onClose(); go('nueva-' + k); }}>Nueva reserva este día</Btn>}
      </div>
    </Modal>
  );
}

// ---------------- Nueva reserva ----------------
const VACIO = { tipo: 'retener', nombre: '', email: '', servicioId: '', fecha: '', hora: '', lugar: 'Estudio', direccion: '', km: '', acompanantes: 0, postizas: false };
const tieneDatos = (f) => !!(f.nombre || f.email || f.servicioId || f.hora || f.direccion || f.km);

function NuevaReserva({ data, commit, go, ahoraWall, fechaInicial, setRecienCreada, borrador, setBorrador }) {
  const hoy = D.dayKey(ahoraWall);
  const fechaUrl = /^\d{4}-\d{2}-\d{2}$/.test(fechaInicial) ? fechaInicial : '';
  const [recuperado] = useState(() => !!borrador);
  const [f, setF] = useState(() => (borrador ? { ...VACIO, ...borrador, fecha: fechaUrl || borrador.fecha } : { ...VACIO, fecha: fechaUrl }));
  // El borrador vive en la app: sobrevive a un guardado fallido y a ir y volver de otra pantalla.
  useEffect(() => { setBorrador(tieneDatos(f) ? f : null); }, [f]);
  const [errores, setErrores] = useState({});
  const [rechazo, setRechazo] = useState(null);
  const [intentado, setIntentado] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setRechazo(null); setErrorGuardado(null); };

  const ex = D.extrasDe(data.servicios, data.tarifas);
  const elegibles = data.servicios.filter((s) => !s.extra);
  const servicio = servicioDe(data, f.servicioId);
  const esNovia = !!servicio?.esNovia;
  const consulta = f.tipo === 'consulta';
  const elegirServicio = (id) => {
    const s = servicioDe(data, id);
    setF((p) => {
      let lugar = p.lugar;
      if (s && !D.admiteLugar(s, lugar)) lugar = lugar === 'Estudio' ? 'Domicilio' : 'Estudio';
      return { ...p, servicioId: id, lugar, acompanantes: s?.esNovia ? p.acompanantes : 0, postizas: s?.esNovia ? p.postizas : false };
    });
    setRechazo(null); setErrorGuardado(null);
  };
  const nAcomp = Number(f.acompanantes) || 0;
  const precio = D.calcularPrecio({ servicio, lugar: f.lugar, km: Number(f.km) || 0, acompanantes: nAcomp, postizas: f.postizas }, ex.tarifas);
  const base = { servicioId: f.servicioId, lugar: f.lugar, acompanantes: nAcomp, postizas: f.postizas, km: Number(f.km) || 0, minAcompanante: ex.minAcompanante, minPostizas: ex.minPostizas };
  const inicio = f.fecha && f.hora ? `${f.fecha}T${f.hora}` : null;
  const lunes = !!f.fecha && D.esLunes(f.fecha);
  const horarios = !consulta && servicio && f.fecha && !lunes ? D.horariosDisponibles({ ...base, inicio: `${f.fecha}T07:00` }, data).filter((h) => `${f.fecha}T${h}` >= ahoraWall) : null;
  const verif = !consulta && servicio && inicio ? D.verificarDisponibilidad({ ...base, inicio }, data) : null;
  const tramos = servicio && inicio ? D.tramosEfectivos(servicio, data.recursos, { ...base, acompanantesCon: verif?.acompanantesCon }) : [];
  const dur = servicio ? D.duracionTotal(servicio, data.recursos, base) : 0;
  const noviasDia = f.fecha ? D.noviasDelDia(f.fecha, data).length : 0;

  useEffect(() => { if (intentado) setErrores(D.validarReserva(f, data, ahoraWall)); }, [f, intentado]);

  const submit = (e) => {
    e.preventDefault();
    setIntentado(true);
    const errs = D.validarReserva(f, data, ahoraWall);
    setErrores(errs);
    if (Object.keys(errs).length) { setRechazo(null); return; }
    const ahoraISO = new Date().toISOString();
    const reserva = {
      id: D.uid('res'), novia: { nombre: f.nombre.trim(), email: f.email.trim() }, servicioId: f.servicioId,
      inicio, lugar: f.lugar, direccion: f.lugar === 'Domicilio' ? f.direccion.trim() : '',
      km: f.lugar === 'Domicilio' ? Number(f.km) : 0, acompanantes: esNovia ? nAcomp : 0, postizas: esNovia && !!f.postizas,
      total: precio.total, sena: precio.sena, saldo: precio.saldo, estado: consulta ? 'Consulta' : 'Fecha retenida', pagoFueraPlazo: false,
      fechaRetencion: consulta ? null : ahoraISO, acompanantesCon: null,
      historial: [{ en: ahoraISO, de: null, a: consulta ? 'Consulta' : 'Fecha retenida', motivo: consulta ? 'Consulta anotada (sin fecha firme)' : 'Fecha retenida' }],
    };
    if (!consulta) {
      const v = D.verificarDisponibilidad(reserva, data);
      if (!v.ok) { setRechazo(v.motivos); return; }
      reserva.acompanantesCon = v.acompanantesCon;
    }
    const numero = (data.contador || 0) + 1;
    reserva.numero = numero;
    const res = commit((d) => ({ ...d, contador: numero, reservas: [...d.reservas, reserva] }));
    if (!res.ok) { setErrorGuardado(res.error); return; }
    setBorrador(null);
    setRecienCreada(reserva.id);
    go('reserva-' + reserva.id);
  };

  return (
    <form onSubmit={submit} noValidate>
      <H1 sub="Retener la fecha ocupa los recursos 48 h hasta que se registre la seña del 50 %. Una consulta no ocupa nada.">Nueva reserva</H1>
      {recuperado && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-tinta-soft">Recuperamos tu borrador sin guardar.
          <button type="button" className="underline hover:text-tinta" onClick={() => { setBorrador(null); setF({ ...VACIO, fecha: fechaUrl }); }}>Empezar de cero</button>
        </p>
      )}
      <AvisoDemo className="mb-5">Se guarda solo en este navegador. No se avisa al negocio ni a la novia.</AvisoDemo>
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Tipo de alta">
              {[['retener', 'Retener fecha', 'Ocupa recursos 48 h hasta la seña'], ['consulta', 'Solo consulta', 'Sin fecha firme; no ocupa recursos']].map(([v, l, d]) => (
                <button type="button" role="radio" aria-checked={f.tipo === v} key={v} onClick={() => set('tipo', v)}
                  className={cx('flex-1 rounded-xl border px-4 py-2.5 text-left text-sm transition', f.tipo === v ? 'border-oro bg-oro-100 text-tinta' : 'border-tinta/15 bg-white text-tinta-soft hover:border-oro')}>
                  <span className="block font-semibold">{l}</span><span className="block text-xs">{d}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="mb-4 font-serif text-xl font-light">Novia</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre *" htmlFor="n-nombre" error={errores.nombre}><input id="n-nombre" className={inputCls(errores.nombre)} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} autoComplete="name" /></Field>
              <Field label="Email *" htmlFor="n-email" error={errores.email}><input id="n-email" type="email" inputMode="email" className={inputCls(errores.email)} value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" /></Field>
            </div>
          </Card>
          <Card>
            <h2 className="mb-4 font-serif text-xl font-light">Servicio y horario</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Servicio *" htmlFor="n-serv" error={errores.servicioId} className="sm:col-span-3">
                <select id="n-serv" className={inputCls(errores.servicioId)} value={f.servicioId} onChange={(e) => elegirServicio(e.target.value)}>
                  <option value="">Elegí un servicio…</option>
                  {elegibles.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {D.formatUYU(s.precioUYU)}{s.trasladoMin ? ' + km' : ''} · {s.duracionMin} min{s.trasladoMin ? ` + ${s.trasladoMin} de traslado` : ''}</option>)}
                </select>
              </Field>
              <Field label={consulta ? 'Fecha tentativa' : 'Fecha *'} htmlFor="n-fecha" error={errores.fecha} hint="Martes a domingo">
                <input id="n-fecha" type="date" min={hoy} className={inputCls(errores.fecha)} value={f.fecha} onChange={(e) => set('fecha', e.target.value)} />
              </Field>
              <Field label={consulta ? 'Hora tentativa' : 'Hora de inicio *'} htmlFor="n-hora" error={errores.hora} hint="Entre 07:00 y 20:00">
                <input id="n-hora" type="time" step="900" min="07:00" max="19:45" className={inputCls(errores.hora)} value={f.hora} onChange={(e) => set('hora', e.target.value)} />
              </Field>
              <div className="text-sm text-tinta-soft sm:pt-6">{servicio ? <>Duración: <span className="text-tinta">{dur} min</span>{servicio.trasladoMin && f.lugar === 'Domicilio' ? <> + {servicio.trasladoMin} de traslado</> : null}</> : null}</div>
            </div>
            {consulta && <p className="mt-3 text-xs text-tinta-soft">Una consulta puede quedar sin fecha. No se controla disponibilidad ni se ocupan recursos hasta que se retenga la fecha.</p>}
            {!consulta && lunes && <p role="alert" className="mt-4 rounded-xl border border-rojo/40 bg-rojo-100 px-3 py-2.5 text-sm text-rojo">Los lunes no se toman reservas. Elegí otro día (martes a domingo).</p>}
            {horarios && (
              horarios.length === 0 ? (
                <div role="alert" className="mt-4 rounded-xl border border-rojo/40 bg-rojo-100 px-3 py-2.5 text-sm text-rojo">
                  Ningún horario del {D.fechaLarga(f.fecha)} admite «{servicio.nombre}»{nAcomp > 0 ? ` con ${nAcomp} acompañante(s)` : ''}{f.postizas ? ' y pestañas' : ''}:{' '}
                  {esNovia && noviasDia >= D.MAX_NOVIAS_POR_DIA ? `ya hay ${noviasDia} novias ese día (máximo ${D.MAX_NOVIAS_POR_DIA}).` : `los recursos que necesita no tienen ${dur}${servicio.trasladoMin && f.lugar === 'Domicilio' ? ` + ${servicio.trasladoMin}` : ''} min libres seguidos entre 07:00 y 20:00, o el día está bloqueado.`} Probá otra fecha.
                </div>
              ) : (
                <div className="mt-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-tinta-soft">Horarios que entran ese día</p>
                  <div className="flex flex-wrap gap-1.5">
                    {horarios.map((h) => (
                      <button type="button" key={h} onClick={() => set('hora', h)} className={cx('rounded-full border px-2.5 py-1 text-xs transition', f.hora === h ? 'border-tinta bg-tinta text-crema' : 'border-tinta/15 bg-white hover:border-oro')}>{h}</button>
                    ))}
                  </div>
                </div>
              )
            )}
          </Card>
          <Card>
            <h2 className="mb-4 font-serif text-xl font-light">Lugar y extras</h2>
            <Field label="Lugar *" error={errores.lugar}>
              <div className="flex gap-2" role="radiogroup">
                {['Estudio', 'Domicilio'].map((l) => {
                  const permitido = !servicio || D.admiteLugar(servicio, l);
                  return (
                    <button type="button" role="radio" aria-checked={f.lugar === l} key={l} disabled={!permitido} onClick={() => set('lugar', l)}
                      className={cx('flex-1 rounded-xl border px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40', f.lugar === l ? 'border-oro bg-oro-100 text-tinta' : 'border-tinta/15 bg-white text-tinta-soft hover:border-oro')}>
                      {l}{!permitido ? ' (no disponible)' : ''}
                    </button>
                  );
                })}
              </div>
            </Field>
            {f.lugar === 'Domicilio' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Field label="Dirección *" htmlFor="n-dir" error={errores.direccion}><input id="n-dir" className={inputCls(errores.direccion)} value={f.direccion} onChange={(e) => set('direccion', e.target.value)} autoComplete="street-address" /></Field>
                <Field label="Km (1–60) *" htmlFor="n-km" error={errores.km}><input id="n-km" type="number" inputMode="numeric" min="1" max="60" step="1" className={inputCls(errores.km)} value={f.km} onChange={(e) => set('km', e.target.value)} /></Field>
              </div>
            )}
            {servicio && !esNovia && <p className="mt-4 text-xs text-tinta-soft">Acompañantes y pestañas se agregan solo a un servicio de novia.</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Acompañantes (0–4)" htmlFor="n-acomp" error={errores.acompanantes} hint={`${D.formatUYU(ex.tarifas.acompananteUYU)} y ${ex.minAcompanante} min c/u, a continuación de la novia: con la asistente si está libre; si no, con la maquilladora`}>
                <div className="flex items-center gap-2">
                  <Btn variant="soft" className="h-10 w-10 px-0" aria-label="Menos acompañantes" disabled={!esNovia} onClick={() => set('acompanantes', Math.max(0, nAcomp - 1))}>−</Btn>
                  <input id="n-acomp" type="number" min="0" max="4" disabled={!esNovia} className={cx(inputCls(errores.acompanantes), 'w-16 text-center disabled:opacity-50')} value={f.acompanantes} onChange={(e) => set('acompanantes', e.target.value)} />
                  <Btn variant="soft" className="h-10 w-10 px-0" aria-label="Más acompañantes" disabled={!esNovia} onClick={() => set('acompanantes', Math.min(4, nAcomp + 1))}>+</Btn>
                </div>
              </Field>
              <Field label="Pestañas postizas" error={errores.postizas} hint={`${D.formatUYU(ex.tarifas.postizasUYU)} y ${ex.minPostizas} min más de la novia`}>
                <label className={cx('flex items-center gap-3 rounded-xl border border-tinta/15 bg-white px-3 py-2.5 text-sm', esNovia ? 'cursor-pointer' : 'opacity-50')}>
                  <input type="checkbox" className="h-4 w-4 accent-[#B8935A]" disabled={!esNovia} checked={f.postizas} onChange={(e) => set('postizas', e.target.checked)} />
                  {f.postizas ? 'Sí' : 'No'}
                </label>
              </Field>
            </div>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="bg-white">
            <p className="text-xs uppercase tracking-[0.2em] text-tinta-soft">Precio total</p>
            <p className="mt-1 font-serif text-4xl font-light text-tinta" aria-live="polite" data-testid="precio-total">{D.formatUYU(precio.total)}</p>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Linea k={servicio ? servicio.nombre : 'Servicio'} v={precio.base} />
              <Linea k={`Traslado ${f.lugar === 'Domicilio' ? `${Number(f.km) || 0} km × ${D.formatUYU(ex.tarifas.kmUYU)}` : '(estudio)'}`} v={precio.traslado} />
              <Linea k={`Acompañantes × ${esNovia ? nAcomp : 0}`} v={precio.acomp} />
              <Linea k="Pestañas postizas" v={precio.post} />
              <div className="my-2 border-t border-tinta/10" />
              <Linea k="Seña (50 %)" v={precio.sena} strong />
              <Linea k="Saldo (hasta el día anterior)" v={precio.saldo} />
            </dl>
            {tramos.length > 0 && (
              <div className="mt-4 rounded-xl bg-crema-2/60 p-3 text-xs" data-testid="ocupacion">
                <p className="mb-1 uppercase tracking-[0.14em] text-tinta-soft">{consulta ? 'Ocuparía (consulta: aún no ocupa)' : 'Ocupación por recurso'}</p>
                {Object.entries(tramos.reduce((acc, t) => { const a = acc[t.recursoId] || [t.desde, t.hasta]; acc[t.recursoId] = [Math.min(a[0], t.desde), Math.max(a[1], t.hasta)]; return acc; }, {})).map(([rid, [a, b]]) => (
                  <p key={rid} className="flex justify-between gap-2"><span className="truncate">{recursoDe(data, rid)?.nombre}</span><span>{D.hhmm(D.minutesOfDay(inicio) + a)}–{D.hhmm(D.minutesOfDay(inicio) + b)}</span></p>
                ))}
              </div>
            )}
            {rechazo && (
              <div role="alert" className="mt-4 rounded-xl border border-rojo/40 bg-rojo-100 p-3 text-sm text-rojo">
                <p className="font-semibold">No se puede retener ese horario:</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">{rechazo.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}
            {intentado && Object.keys(errores).length > 0 && <p className="mt-3 text-xs text-rojo" role="alert">Revisá los campos marcados.</p>}
            {errorGuardado && (
              <div role="alert" className="mt-4 rounded-xl border border-rojo/40 bg-rojo-100 p-3 text-sm text-rojo">
                <p className="font-semibold">No se guardó la reserva.</p>
                <p className="mt-1">{errorGuardado} Tu borrador sigue en el formulario; no se asignó número ni se ocuparon recursos.</p>
                <p className="mt-1 text-xs">Si activaste «Simular fallo de guardado» en Ajustes, desactivalo y volvé: el borrador te espera.</p>
              </div>
            )}
            <Btn type="submit" variant="gold" className="mt-4 w-full py-3">{consulta ? 'Guardar consulta' : 'Retener fecha'}</Btn>
            <Btn variant="ghost" className="mt-1 w-full" onClick={() => history.back()}>Volver</Btn>
          </Card>
        </aside>
      </div>
    </form>
  );
}
function Linea({ k, v, strong }) {
  return <div className={cx('flex justify-between gap-3', strong && 'font-semibold text-tinta')}><dt className="truncate text-tinta-soft">{k}</dt><dd className="whitespace-nowrap">{D.formatUYU(v)}</dd></div>;
}

// ---------------- Detalle de reserva ----------------
// En claude.ai el visor no admite la extensión .ics: se ofrece copiar el contenido o guardarlo como .txt.
// Fuera de claude.ai (local, Lovable, Vercel) se descarga el .ics directo.
async function descargarArchivo(filename, contenido) {
  let dl = null;
  try { dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null; } catch { dl = null; }
  if (dl) {
    try { await dl.save({ filename, data: contenido }); return 'ok'; } catch (e) {
      if (e?.code === 'declined') return 'cancelado';
      return 'extension';
    }
  }
  try {
    const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'ok';
  } catch { return 'error'; }
}
async function guardarComoTxt(filename, contenido) {
  try {
    const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
    if (!dl) return false;
    await dl.save({ filename: filename.replace(/\.ics$/, '.ics.txt'), data: contenido });
    return true;
  } catch { return false; }
}

const SENA_PAGADA = ['Señada', 'Saldo pagado', 'Realizada'];

function DetalleReserva({ data, commit, go, ahoraWall, ahoraMs, id, recienCreada }) {
  const r = data.reservas.find((x) => x.id === id);
  const [fueraPlazo, setFueraPlazo] = useState(false);
  const [error, setError] = useState(null);
  const [prueba, setPrueba] = useState(null);
  const [verIcs, setVerIcs] = useState(false);
  const [confCancelar, setConfCancelar] = useState(false);
  const [ret, setRet] = useState(() => ({ fecha: r?.inicio ? D.dayKey(r.inicio) : '', hora: r?.inicio ? D.timeOf(r.inicio) : '' }));
  if (!r) return <Card><p>No se encontró la reserva.</p><Btn className="mt-3" onClick={() => go('calendario')}>Ir al calendario</Btn></Card>;
  const s = servicioDe(data, r.servicioId);
  const occ = D.ocupacionDeReserva(r, data.servicios, data.recursos);
  const ocupa = D.esActiva(r);
  const acciones = D.accionesPermitidas(r, ahoraWall);
  const fueraDePlazo = !!r.inicio && ahoraWall >= D.limiteSaldo(r);
  const pruebas = data.reservas.filter((x) => x.pruebaDe === r.id);
  const original = r.pruebaDe ? data.reservas.find((x) => x.id === r.pruebaDe) : null;
  const servicioPrueba = data.servicios.find((x) => x.esPrueba);
  const restante = r.estado === 'Fecha retenida' ? D.venceEn(r, ahoraMs) : null;
  const ics = s && r.inicio ? D.generarICS(r, data.servicios, data.recursos) : '';
  const icsNombre = `${D.dayKey(r.inicio || '')}-${(s?.nombre || 'reserva').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}.ics`;
  const senaPagada = SENA_PAGADA.includes(r.estado) || !!r.senaRetenida;
  const saldoPagado = r.estado === 'Saldo pagado' || (r.estado === 'Realizada' && (r.historial || []).some((h) => h.a === 'Saldo pagado'));
  const ex = D.extrasDe(data.servicios, data.tarifas);
  const dur = s ? D.duracionTotal(s, data.recursos, { ...r, minAcompanante: ex.minAcompanante, minPostizas: ex.minPostizas }) : 0;

  const guardarCambio = (next, msg) => {
    const res = commit((d) => ({ ...d, reservas: d.reservas.map((x) => (x.id === r.id ? next : x)) }), msg);
    if (!res.ok) setError(`No se guardó: ${res.error} La reserva sigue en «${r.estado}».`);
  };
  const hacer = (accId) => {
    setError(null);
    if (accId === 'cancelar' && (r.estado === 'Señada' || r.estado === 'Saldo pagado') && !confCancelar) { setConfCancelar(true); return; }
    try {
      let base = r;
      if (accId === 'retener') {
        if (!ret.fecha || !ret.hora) throw new Error('Elegí fecha y hora para retener.');
        const ini = `${ret.fecha}T${ret.hora}`;
        if (ini < ahoraWall) throw new Error('La fecha y hora no puede estar en el pasado.');
        const m = D.minutesOfDay(ini);
        if (m < D.HORA_APERTURA || m >= D.HORA_CIERRE) throw new Error('La hora debe estar entre 07:00 y 20:00.');
        base = { ...r, inicio: ini };
      }
      const next = D.aplicarTransicion(base, accId, ahoraWall, new Date().toISOString(), { pagoFueraPlazo: fueraPlazo, ctx: data });
      setConfCancelar(false);
      guardarCambio(next, `Estado: ${next.estado}.`);
    } catch (e) { setError(e.message); }
  };
  const abrirPrueba = () => {
    setError(null);
    if (!servicioPrueba) { setError('No hay un servicio de prueba en el catálogo (marcá uno como «Es prueba»).'); return; }
    setPrueba({ ...D.proponerPrueba(r, servicioPrueba.id, data, ahoraWall), servicioId: servicioPrueba.id });
  };
  const confirmarPrueba = () => {
    const p = D.calcularPrecio({ servicio: servicioPrueba, lugar: 'Estudio', km: 0, acompanantes: 0, postizas: false }, ex.tarifas);
    const numero = (data.contador || 0) + 1;
    const ahoraISO = new Date().toISOString();
    const nueva = {
      id: D.uid('res'), numero, novia: { ...r.novia }, servicioId: servicioPrueba.id, inicio: prueba.inicio, lugar: 'Estudio', direccion: '', km: 0,
      acompanantes: 0, postizas: false, total: p.total, sena: p.sena, saldo: p.saldo, estado: 'Fecha retenida', pagoFueraPlazo: false,
      fechaRetencion: ahoraISO, acompanantesCon: null, pruebaDe: r.id,
      historial: [{ en: ahoraISO, de: null, a: 'Fecha retenida', motivo: `Prueba de ${s?.nombre}` }],
    };
    const v = D.verificarDisponibilidad(nueva, data);
    if (!v.ok) { setPrueba({ ...prueba, error: v.motivos.join(' ') }); return; }
    const res = commit((d) => ({ ...d, contador: numero, reservas: [...d.reservas, nueva] }), `Prueba N.º ${D.numeroReserva(nueva)} retenida en la demo (48 h). No se avisó a nadie.`);
    if (!res.ok) { setPrueba({ ...prueba, error: `No se guardó: ${res.error} No se agendó nada.` }); return; }
    setPrueba(null);
  };
  const descargar = async () => {
    const res = await descargarArchivo(icsNombre, ics);
    if (res === 'extension' || res === 'error') setVerIcs('limitado');
  };
  const etiquetaTramo = (o) => {
    const rec = recursoDe(data, o.recursoId);
    if (r.acompanantes > 0 && o.recursoId === r.acompanantesCon && rec && !rec.principal) return `${rec.nombre} · acompañantes`;
    return rec?.nombre || o.recursoId;
  };

  return (
    <div>
      <a href="#calendario" className="text-sm text-tinta-soft hover:text-tinta">‹ Calendario</a>
      <div className="mt-2 mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-oro-700">Reserva N.º {D.numeroReserva(r)} · {s?.nombre}</p>
          <h1 className="font-serif text-4xl font-light text-tinta">{r.novia.nombre}</h1>
          <p className="mt-1 text-sm text-tinta-soft">{r.inicio ? `${cap(D.fechaLarga(D.dayKey(r.inicio)))} · ${D.timeOf(r.inicio)} h` : 'Sin fecha firme'} · {r.lugar}</p>
        </div>
        <EstadoChip estado={r.estado} className="px-3 py-1 text-sm" />
      </div>

      {recienCreada === r.id && (
        <div role="status" className="mb-4 rounded-2xl border border-salvia/50 bg-salvia-100 px-4 py-3 text-sm text-salvia-700">
          <p><strong className="font-semibold">{r.estado === 'Consulta' ? 'Consulta' : 'Reserva'} N.º {D.numeroReserva(r)} guardada.</strong> Es una demo: no se avisó a nadie.</p>
          <p className="mt-1">Para avisarle, copiá el texto de «Compartir».</p>
        </div>
      )}
      {r.estado === 'Fecha retenida' && (
        <div className={cx('mb-4 rounded-2xl border px-4 py-3 text-sm', restante < 6 * 3600000 ? 'border-rojo/40 bg-rojo-100 text-rojo' : 'border-oro/40 bg-oro-100 text-oro-700')}>
          <strong className="font-semibold">Fecha retenida, {D.fraseVence(restante)}.</strong> Sin la seña de {D.formatUYU(r.sena)}, se libera sola.
        </div>
      )}
      {r.estado === 'Señada' && <div className={cx('mb-4 rounded-2xl border px-4 py-3 text-sm', fueraDePlazo ? 'border-rojo/30 bg-rojo-100 text-rojo' : 'border-rosa-300 bg-rosa-100 text-rosa-700')}><strong className="font-semibold">{D.fraseSaldo(r, ahoraWall)}.</strong>{fueraDePlazo ? ' Para registrarlo, marcá «Pago fuera de plazo».' : ''}</div>}
      {r.estado === 'Consulta' && <div className="mb-4 rounded-2xl border border-tinta/15 bg-white px-4 py-3 text-sm text-tinta-soft"><strong className="font-semibold text-tinta">Consulta sin fecha firme.</strong> No ocupa recursos.</div>}
      {r.canceladaPorVencimiento && <div className="mb-4 rounded-2xl border border-tinta/10 bg-white px-4 py-3 text-sm text-tinta-soft"><strong className="font-semibold text-tinta">Cancelada sola.</strong> Pasaron 48 h sin seña; recursos libres.</div>}
      {r.estado === 'Cancelada' && r.senaRetenida ? <div className="mb-4 rounded-2xl border border-oro/40 bg-oro-100 px-4 py-3 text-sm text-oro-700"><strong className="font-semibold">Seña {D.formatUYU(r.senaRetenida)} retenida.</strong> No se devuelve; recursos libres.</div> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 font-serif text-xl font-light">Datos</h2>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Dato k="Email" v={r.novia.email} />
              <Dato k="Servicio" v={`${s?.nombre} (${dur} min${s?.trasladoMin && r.lugar === 'Domicilio' ? ` + ${s.trasladoMin} de traslado` : ''})`} />
              <Dato k="Inicio" v={r.inicio ? `${D.fechaCorta(D.dayKey(r.inicio))} · ${D.timeOf(r.inicio)} h` : 'A confirmar'} />
              <Dato k="Lugar" v={r.lugar === 'Domicilio' ? `${r.direccion} · ${r.km} km` : 'Estudio'} />
              <Dato k="Acompañantes" v={r.acompanantes ? `${r.acompanantes}${r.acompanantesCon ? ` · con ${recursoDe(data, r.acompanantesCon)?.nombre}` : ''}` : 0} />
              <Dato k="Pestañas postizas" v={r.postizas ? 'Sí' : 'No'} />
              {r.pagoFueraPlazo && <Dato k="Pago" v="Saldo registrado fuera de plazo" />}
              {original && <Dato k="Prueba de" v={<a className="text-rosa-700 underline" href={'#reserva-' + original.id}>{servicioDe(data, original.servicioId)?.nombre} · {original.inicio ? D.fechaCorta(D.dayKey(original.inicio)) : 'sin fecha'}</a>} />}
              {pruebas.length > 0 && <Dato k="Pruebas" v={pruebas.map((p) => <a key={p.id} className="mr-2 text-rosa-700 underline" href={'#reserva-' + p.id}>{D.fechaCorta(D.dayKey(p.inicio))} {D.timeOf(p.inicio)} ({p.estado})</a>)} />}
            </dl>
          </Card>
          <Card>
            <h2 className="mb-3 font-serif text-xl font-light">Recursos asignados</h2>
            {occ.length === 0 ? <p className="text-sm text-tinta-soft">Sin fecha: todavía no hay recursos asignados.</p> : (
              <ul className="space-y-2 text-sm">
                {occ.map((o, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-crema-2/60 px-3 py-2">
                    <span>{etiquetaTramo(o)} <span className="text-tinta-soft">· {recursoDe(data, o.recursoId)?.tipo}</span></span>
                    <span className="whitespace-nowrap font-semibold">{D.hhmm(minDia(o.inicio))}–{D.hhmm(minDia(o.fin))}</span>
                  </li>
                ))}
              </ul>
            )}
            {s?.trasladoMin && r.lugar === 'Domicilio' && occ.length > 0 ? <p className="mt-2 text-xs text-tinta-soft">Incluye {s.trasladoMin} min de traslado bloqueados antes de la hora de inicio.</p> : null}
            {!ocupa && occ.length > 0 && <p className="mt-2 text-xs text-tinta-soft">{r.estado === 'Consulta' ? 'Es una consulta: estos horarios todavía no están ocupados.' : 'Cancelada: estos recursos ya no están bloqueados.'}</p>}
          </Card>
          <Card>
            <h2 className="mb-3 font-serif text-xl font-light">Historial</h2>
            <ol className="space-y-1.5 text-sm">
              {(r.historial || []).map((h, i) => (
                <li key={i} className="flex flex-wrap gap-x-2"><span className="text-tinta-soft">{new Date(h.en).toLocaleString('es-UY', { timeZone: D.ZONA_NEGOCIO, dateStyle: 'short', timeStyle: 'short' })}</span><span>→ {h.a}</span><span className="text-tinta-soft">· {h.motivo}</span></li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card className="bg-white">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-tinta-soft">Total</dt><dd className="font-serif text-2xl">{D.formatUYU(r.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-tinta-soft">Seña (50 %)</dt><dd>{D.formatUYU(r.sena)} <span className="text-xs text-tinta-soft">{r.senaRetenida ? '· retenida' : senaPagada ? '· pagada' : '· pendiente'}</span></dd></div>
              <div className="flex justify-between"><dt className="text-tinta-soft">Saldo</dt><dd>{D.formatUYU(r.saldo)} <span className="text-xs text-tinta-soft">{saldoPagado ? '· pagado' : '· pendiente'}</span></dd></div>
            </dl>
            <div className="mt-4 space-y-2">
              {r.estado === 'Consulta' && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Fecha" htmlFor="ret-fecha"><input id="ret-fecha" type="date" className={inputCls()} value={ret.fecha} onChange={(e) => setRet({ ...ret, fecha: e.target.value })} /></Field>
                  <Field label="Hora" htmlFor="ret-hora"><input id="ret-hora" type="time" step="900" className={inputCls()} value={ret.hora} onChange={(e) => setRet({ ...ret, hora: e.target.value })} /></Field>
                </div>
              )}
              {acciones.map((a) => (
                <div key={a.id}>
                  {a.id === 'saldo' && fueraDePlazo && (
                    <label className="mb-2 flex items-start gap-2 rounded-xl bg-oro-100 p-2.5 text-xs text-oro-700">
                      <input type="checkbox" className="mt-0.5 accent-[#B8935A]" checked={fueraPlazo} onChange={(e) => setFueraPlazo(e.target.checked)} />
                      <span>El saldo se esperaba hasta el día anterior al evento. Marcá <strong className="font-semibold">«Pago fuera de plazo»</strong> para registrarlo.</span>
                    </label>
                  )}
                  <Btn className="w-full" variant={a.id === 'cancelar' ? 'danger' : 'primary'} disabled={a.id === 'saldo' && fueraDePlazo && !fueraPlazo} onClick={() => hacer(a.id)}>{a.label}</Btn>
                </div>
              ))}
              {confCancelar && (
                <div role="alert" className="rounded-xl border border-rojo/40 bg-rojo-100 p-3 text-xs text-rojo">
                  <p>Al cancelar, la seña de <strong className="font-semibold">{D.formatUYU(r.sena)}</strong> no se devuelve y queda anotada. Los recursos se liberan.</p>
                  <div className="mt-2 flex gap-2"><Btn variant="ghost" className="flex-1 py-1" onClick={() => setConfCancelar(false)}>Volver</Btn><Btn variant="danger" className="flex-1 py-1" onClick={() => hacer('cancelar')}>Confirmar cancelación</Btn></div>
                </div>
              )}
              {acciones.length === 0 && <p className="text-xs text-tinta-soft">Esta reserva está {r.estado === 'Cancelada' ? 'cancelada' : 'cerrada'}; no tiene más cambios de estado.</p>}
              {error && <p role="alert" className="rounded-xl bg-rojo-100 p-2.5 text-xs text-rojo">{error}</p>}
            </div>
            {r.inicio && (
              <div className="mt-4 space-y-2 border-t border-tinta/10 pt-4">
                {s?.esNovia && ocupa && r.estado !== 'Realizada' && <Btn variant="gold" className="w-full" onClick={abrirPrueba}>Agendar prueba</Btn>}
                <Btn variant="soft" className="w-full" onClick={descargar}>Descargar .ics</Btn>
                <button type="button" className="w-full text-center text-xs text-tinta-soft underline" onClick={() => setVerIcs((v) => !v)}>{verIcs ? 'Ocultar' : 'Ver o copiar'} contenido del .ics</button>
                {verIcs && <IcsBox ics={ics} limitado={verIcs === 'limitado'} nombre={icsNombre} />}
              </div>
            )}
          </Card>
          <Compartir texto={D.textoCompartir(r, s, ahoraWall)} />
        </aside>
      </div>

      <Modal open={!!prueba} onClose={() => setPrueba(null)} title="Agendar prueba">
        {prueba?.error && !prueba.inicio && <p className="rounded-xl bg-rojo-100 p-3 text-sm text-rojo">{prueba.error}</p>}
        {prueba?.inicio && (
          <div className="space-y-3 text-sm">
            <p>Propuesta: <strong className="font-semibold">{D.fechaLarga(D.dayKey(prueba.inicio))}</strong> a las <strong className="font-semibold">{D.timeOf(prueba.inicio)}</strong> en el estudio ({servicioPrueba?.nombre}, {servicioPrueba?.duracionMin} min).</p>
            {prueba.movida ? (
              <p className="rounded-xl bg-oro-100 p-3 text-oro-700">Un mes antes ({D.fechaCorta(D.dayKey(prueba.propuestaOriginal))} {D.timeOf(prueba.propuestaOriginal)}) no estaba disponible: {prueba.motivoOriginal} Se movió al siguiente día libre.</p>
            ) : <p className="text-tinta-soft">Misma hora, un mes antes del evento.</p>}
            {prueba.error && <p className="rounded-xl bg-rojo-100 p-3 text-rojo">{prueba.error}</p>}
            <div className="flex justify-end gap-2 pt-2"><Btn variant="ghost" onClick={() => setPrueba(null)}>Cancelar</Btn><Btn variant="gold" onClick={confirmarPrueba}>Retener la prueba</Btn></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
function formatoRestante(ms) {
  if (ms <= 0) return 'instantes';
  const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
function Dato({ k, v }) {
  return <div><dt className="text-xs uppercase tracking-[0.14em] text-tinta-soft">{k}</dt><dd className="mt-0.5 break-words text-tinta">{v}</dd></div>;
}
function IcsBox({ ics, limitado, nombre }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      {limitado && (
        <div className="mb-2 rounded-xl bg-oro-100 p-2.5 text-xs text-oro-700">
          <p>Esta vista previa no permite guardar archivos .ics. Copiá el contenido y pegalo en un archivo «{nombre}», o guardalo como texto y renombralo. Con la app instalada por su cuenta el .ics se descarga directo.</p>
          <Btn variant="soft" className="mt-2 w-full py-1 text-xs" onClick={() => guardarComoTxt(nombre, ics)}>Guardar como .txt</Btn>
        </div>
      )}
      <textarea readOnly className="h-40 w-full rounded-xl border border-tinta/15 bg-crema p-2 font-mono text-[10px]" value={ics} onFocus={(e) => e.target.select()} />
      <Btn variant="soft" className="mt-1 w-full py-1 text-xs" onClick={async () => { try { await navigator.clipboard.writeText(ics); setOk(true); } catch { setOk(false); } }}>{ok ? 'Copiado' : 'Copiar'}</Btn>
    </div>
  );
}

// ---------------- Recursos ----------------
function Recursos({ data, commit, ahoraWall }) {
  const [edit, setEdit] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [borrar, setBorrar] = useState(null);
  const intentarBaja = (rec) => {
    const fut = D.reservasFuturasDeRecurso(rec.id, data, ahoraWall);
    const usado = data.servicios.filter((s) => s.recursosIds.includes(rec.id));
    if (fut.length) { setAviso({ id: rec.id, msg: `No se puede dar de baja: tiene ${fut.length} reserva(s) futura(s), la próxima el ${D.fechaCorta(D.dayKey(fut.sort((a, b) => a.inicio.localeCompare(b.inicio))[0].inicio))}. Cancelalas o reasignalas primero.` }); return; }
    if (usado.length) { setAviso({ id: rec.id, msg: `No se puede dar de baja: lo usan los servicios ${usado.map((s) => '«' + s.nombre + '»').join(', ')}. Quitalo de esos servicios primero.` }); return; }
    setBorrar(rec);
  };
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3"><H1 sub="Maquilladora, asistente, estudio y equipos: la ocupación de cada uno se calcula por separado.">Recursos</H1><Btn variant="gold" className="mb-5" onClick={() => setEdit({ id: null, nombre: '', tipo: 'Persona', principal: false, diasBloqueados: [] })}>Nuevo recurso</Btn></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.recursos.map((rec) => {
          const fut = D.reservasFuturasDeRecurso(rec.id, data, ahoraWall).length;
          return (
            <Card key={rec.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-serif text-2xl font-light">{rec.nombre}</h2>
                  <p className="text-xs uppercase tracking-[0.2em] text-tinta-soft">{rec.tipo}{rec.principal ? ' · principal' : ''}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-tinta-soft">{fut} reserva(s) futura(s)</p>
              <p className="mt-1 text-sm text-tinta-soft">Días bloqueados: {rec.diasBloqueados.length ? rec.diasBloqueados.slice().sort().map(D.fechaCorta).join(', ') : 'ninguno'}</p>
              {aviso?.id === rec.id && <p role="alert" className="mt-3 rounded-xl bg-rojo-100 p-2.5 text-xs text-rojo">{aviso.msg}</p>}
              <div className="mt-4 flex gap-2"><Btn variant="soft" onClick={() => { setAviso(null); setEdit(structuredClone(rec)); }}>Editar</Btn><Btn variant="danger" onClick={() => intentarBaja(rec)}>Dar de baja</Btn></div>
            </Card>
          );
        })}
      </div>
      {edit && <RecursoForm rec={edit} data={data} onClose={() => setEdit(null)} onSave={(rec) => {
        const conId = rec.id ? rec : { ...rec, id: D.uid('r') };
        const res = commit((d) => {
          let recursos = rec.id ? d.recursos.map((x) => (x.id === rec.id ? conId : x)) : [...d.recursos, conId];
          if (conId.principal) recursos = recursos.map((x) => ({ ...x, principal: x.id === conId.id }));
          return { ...d, recursos };
        }, 'Recurso guardado.');
        if (res.ok) setEdit(null);
        return res;
      }} />}
      <Modal open={!!borrar} onClose={() => setBorrar(null)} title="Dar de baja recurso">
        <p className="text-sm">¿Dar de baja «{borrar?.nombre}»? No tiene reservas futuras ni servicios que lo usen.</p>
        <div className="mt-5 flex justify-end gap-2"><Btn variant="ghost" onClick={() => setBorrar(null)}>Cancelar</Btn><Btn variant="danger" onClick={() => { const res = commit((d) => ({ ...d, recursos: d.recursos.filter((x) => x.id !== borrar.id) }), 'Recurso dado de baja.'); if (res.ok) setBorrar(null); else setBorrar({ ...borrar, error: res.error }); }}>Dar de baja</Btn></div>
        {borrar?.error && <p role="alert" className="mt-3 rounded-xl bg-rojo-100 p-2.5 text-xs text-rojo">No se guardó: {borrar.error} El recurso sigue activo.</p>}
      </Modal>
    </div>
  );
}
function RecursoForm({ rec, onClose, onSave }) {
  const [r, setR] = useState(rec);
  const [dia, setDia] = useState('');
  const [err, setErr] = useState({});
  const guardarR = () => {
    const e = {};
    if (!r.nombre.trim()) e.nombre = 'El nombre es obligatorio.';
    if (!['Persona', 'Espacio', 'Equipo'].includes(r.tipo)) e.tipo = 'Elegí Persona, Espacio o Equipo.';
    if (r.principal && r.tipo !== 'Persona') e.tipo = 'El recurso principal debe ser una persona.';
    setErr(e);
    if (!Object.keys(e).length) { const res = onSave({ ...r, nombre: r.nombre.trim() }); if (res && !res.ok) setErr({ form: `No se guardó: ${res.error} Tus cambios siguen en el formulario.` }); }
  };
  return (
    <Modal open title={rec.id ? 'Editar recurso' : 'Nuevo recurso'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nombre *" htmlFor="r-nombre" error={err.nombre}><input id="r-nombre" className={inputCls(err.nombre)} value={r.nombre} onChange={(e) => setR({ ...r, nombre: e.target.value })} /></Field>
        <Field label="Tipo *" htmlFor="r-tipo" error={err.tipo} hint="Equipo: se lleva también a domicilio. Espacio: solo se ocupa en el estudio."><select id="r-tipo" className={inputCls(err.tipo)} value={r.tipo} onChange={(e) => setR({ ...r, tipo: e.target.value })}><option>Persona</option><option>Espacio</option><option>Equipo</option></select></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-[#B8935A]" checked={!!r.principal} onChange={(e) => setR({ ...r, principal: e.target.checked })} /><span>Recurso principal (la maquilladora): define cuándo un día está Completo.</span></label>
        <Field label="Días bloqueados">
          <div className="flex gap-2"><input type="date" aria-label="Día a bloquear" className={inputCls()} value={dia} onChange={(e) => setDia(e.target.value)} /><Btn variant="soft" disabled={!dia || r.diasBloqueados.includes(dia)} onClick={() => { setR({ ...r, diasBloqueados: [...r.diasBloqueados, dia].sort() }); setDia(''); }}>Agregar</Btn></div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.diasBloqueados.map((k) => <span key={k} className="inline-flex items-center gap-1 rounded-full bg-crema-2 px-2.5 py-1 text-xs">{D.fechaCorta(k)}<button type="button" aria-label={`Quitar ${k}`} className="text-tinta-soft hover:text-rosa-700" onClick={() => setR({ ...r, diasBloqueados: r.diasBloqueados.filter((x) => x !== k) })}>×</button></span>)}
            {!r.diasBloqueados.length && <span className="text-xs text-tinta-soft">Ninguno</span>}
          </div>
        </Field>
        {err.form && <p role="alert" className="rounded-xl bg-rojo-100 p-2.5 text-xs text-rojo">{err.form}</p>}
        <div className="flex justify-end gap-2 pt-2"><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="gold" onClick={guardarR}>Guardar</Btn></div>
      </div>
    </Modal>
  );
}

// ---------------- Servicios y tarifas ----------------
function lugaresDe(s) {
  if (s.admiteEstudio !== false && s.admiteDomicilio) return 'Estudio o domicilio';
  return s.admiteDomicilio ? 'Solo a domicilio' : 'Solo en estudio';
}
function Servicios({ data, commit }) {
  const [edit, setEdit] = useState(null);
  const [km, setKm] = useState(String(data.tarifas.kmUYU));
  const [tarErr, setTarErr] = useState(null);
  const nombreRec = (id) => recursoDe(data, id)?.nombre || '—';
  const usa = (s) => {
    if (s.extra === 'acompanante') return 'A continuación de la novia: asistente si está libre; si no, maquilladora';
    if (s.extra === 'pestanas') return 'Se suma al tramo de la maquilladora en un servicio de novia';
    return s.tramos.map((t) => `${nombreRec(t.recursoId)}: min ${t.offsetMin}–${t.offsetMin + t.duracionMin}`).join(' · ');
  };
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3"><H1 sub="Cada recurso tiene su propio tramo dentro del servicio. Horario de ejemplo: martes a domingo de 07:00 a 20:00.">Servicios y tarifas</H1><Btn variant="gold" className="mb-5" onClick={() => setEdit({ id: null, nombre: '', precioUYU: '', admiteEstudio: true, admiteDomicilio: false, trasladoMin: 0, esNovia: false, esPrueba: false, tramos: [] })}>Nuevo servicio</Btn></div>
      <Card className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-crema-2/60 text-[11px] uppercase tracking-[0.16em] text-tinta-soft">
            <tr><th className="px-4 py-3 font-normal">Servicio</th><th className="px-4 py-3 font-normal">Duración</th><th className="px-4 py-3 font-normal">Precio</th><th className="px-4 py-3 font-normal">Recursos que usa</th><th className="px-4 py-3 font-normal">Lugar</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-tinta/10">
            {data.servicios.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-serif text-lg">{s.nombre}
                  {s.esPrueba && <span className="ml-2 font-sans text-[10px] uppercase tracking-widest text-oro-700">prueba</span>}
                  {s.esNovia && <span className="ml-2 font-sans text-[10px] uppercase tracking-widest text-rosa-700">novia</span>}
                  {s.extra && <span className="ml-2 font-sans text-[10px] uppercase tracking-widest text-salvia-700">extra</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{s.duracionMin} min{s.extra === 'acompanante' ? ' por persona' : ''}{s.trasladoMin ? ` + ${s.trasladoMin} de traslado` : ''}</td>
                <td className="px-4 py-3 whitespace-nowrap">{D.formatUYU(Number(s.precioUYU))}{s.trasladoMin || (s.admiteDomicilio && !s.extra) ? <span className="block text-xs text-tinta-soft">+ {D.formatUYU(Number(data.tarifas.kmUYU))}/km a domicilio</span> : null}</td>
                <td className="px-4 py-3 text-xs text-tinta-soft">{usa(s)}</td>
                <td className="px-4 py-3 text-xs">{s.extra ? 'Con la novia' : lugaresDe(s)}</td>
                <td className="px-4 py-3 text-right"><Btn variant="soft" className="py-1" onClick={() => setEdit(structuredClone(s))}>Editar</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="mt-5">
        <h2 className="mb-1 font-serif text-xl font-light">Tarifa de traslado</h2>
        <p className="mb-4 text-sm text-tinta-soft">Total = servicio + traslado (km × tarifa, solo a domicilio, 1–60 km) + acompañantes + pestañas. Seña = 50 % exacto; el saldo se espera hasta el día anterior.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Traslado por km (UYU)" htmlFor="t-km"><input id="t-km" type="number" min="0" className={cx(inputCls(), 'w-40')} value={km} onChange={(e) => setKm(e.target.value)} /></Field>
          <Btn variant="primary" onClick={() => {
            const n = Number(km);
            if (!Number.isFinite(n) || n < 0) { setTarErr('La tarifa debe ser un número mayor o igual a 0.'); return; }
            const res = commit((d) => ({ ...d, tarifas: { ...d.tarifas, kmUYU: n } }), 'Tarifa de traslado guardada. Se aplica a las reservas nuevas.');
            setTarErr(res.ok ? null : `No se guardó: ${res.error} La tarifa sigue como estaba.`);
          }}>Guardar tarifa</Btn>
        </div>
        {tarErr && <p role="alert" className="mt-2 text-xs text-rojo">{tarErr}</p>}
      </Card>
      {edit && <ServicioForm s={edit} data={data} onClose={() => setEdit(null)} onSave={(s) => {
        const res = commit((d) => ({ ...d, servicios: s.id ? d.servicios.map((x) => (x.id === s.id ? s : x)) : [...d.servicios, { ...s, id: D.uid('s') }] }), 'Servicio guardado.');
        if (res.ok) setEdit(null);
        return res;
      }} />}
    </div>
  );
}
function ServicioForm({ s, data, onClose, onSave }) {
  const [f, setF] = useState({ trasladoMin: 0, admiteEstudio: true, ...s });
  const [err, setErr] = useState({});
  const esExtra = !!f.extra;
  const tramoDe = (id) => f.tramos.find((t) => t.recursoId === id);
  const setTramo = (id, patch) => setF((p) => ({ ...p, tramos: p.tramos.map((t) => (t.recursoId === id ? { ...t, ...patch } : t)) }));
  const toggle = (id, on) => setF((p) => ({ ...p, tramos: on ? [...p.tramos, { recursoId: id, offsetMin: 0, duracionMin: Math.max(15, ...p.tramos.map((t) => +t.offsetMin + +t.duracionMin), 30) }] : p.tramos.filter((t) => t.recursoId !== id) }));
  const duracion = esExtra ? Number(f.duracionMin) || 0 : (f.tramos.length ? Math.max(...f.tramos.map((t) => (+t.offsetMin || 0) + (+t.duracionMin || 0))) : 0);
  const guardarS = () => {
    const e = {};
    if (!f.nombre.trim()) e.nombre = 'El nombre es obligatorio.';
    const precio = Number(f.precioUYU);
    if (!(precio > 0)) e.precioUYU = 'El precio debe ser mayor a 0.';
    if (esExtra) {
      if (!Number.isInteger(duracion) || duracion < 5) e.duracionMin = 'Duración: un número entero de al menos 5 minutos.';
    } else {
      if (!f.tramos.length) e.tramos = 'Elegí al menos un recurso.';
      else if (f.tramos.some((t) => !Number.isInteger(+t.offsetMin) || +t.offsetMin < 0 || !Number.isInteger(+t.duracionMin) || +t.duracionMin < 15)) e.tramos = 'Cada tramo: inicio ≥ 0 y duración de al menos 15 min (enteros).';
      else if (duracion > D.HORA_CIERRE - D.HORA_APERTURA) e.tramos = 'El servicio no puede durar más que la jornada (13 h).';
      else if (!f.tramos.some((t) => recursoDe(data, t.recursoId)?.tipo === 'Persona')) e.tramos = 'Incluí al menos una persona.';
      if (!f.admiteEstudio && !f.admiteDomicilio) e.lugar = 'Elegí al menos un lugar.';
      const tr = Number(f.trasladoMin) || 0;
      if (!Number.isInteger(tr) || tr < 0 || tr > 180) e.lugar = 'Traslado: de 0 a 180 minutos.';
    }
    setErr(e);
    if (Object.keys(e).length) return;
    const tramos = esExtra ? [] : f.tramos.map((t) => ({ recursoId: t.recursoId, offsetMin: +t.offsetMin, duracionMin: +t.duracionMin }));
    const res = onSave({ ...f, nombre: f.nombre.trim(), precioUYU: precio, tramos, duracionMin: duracion, trasladoMin: esExtra ? 0 : Number(f.trasladoMin) || 0, recursosIds: tramos.map((t) => t.recursoId) });
    if (res && !res.ok) setErr({ form: `No se guardó: ${res.error} Tus cambios siguen en el formulario.` });
  };
  return (
    <Modal open title={s.id ? 'Editar servicio' : 'Nuevo servicio'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem_10rem]">
          <Field label="Nombre *" htmlFor="s-nombre" error={err.nombre}><input id="s-nombre" className={inputCls(err.nombre)} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
          <Field label="Precio (UYU) *" htmlFor="s-precio" error={err.precioUYU}><input id="s-precio" type="number" min="1" className={inputCls(err.precioUYU)} value={f.precioUYU} onChange={(e) => setF({ ...f, precioUYU: e.target.value })} /></Field>
          {esExtra && <Field label="Duración (min) *" htmlFor="s-dur" error={err.duracionMin}><input id="s-dur" type="number" min="5" className={inputCls(err.duracionMin)} value={f.duracionMin} onChange={(e) => setF({ ...f, duracionMin: e.target.value })} /></Field>}
        </div>
        {esExtra ? (
          <p className="rounded-xl bg-crema-2/60 p-3 text-sm text-tinta-soft">{f.extra === 'acompanante' ? 'Extra por persona: se hace a continuación de la novia, con la asistente si está libre y, si no, con la maquilladora sumando tiempo.' : 'Extra: se suma al tramo de la maquilladora en un servicio de novia.'}</p>
        ) : (
          <>
            <Field label="Recursos que usa y su tramo (minutos desde el inicio)" error={err.tramos}>
              <div className="space-y-2">
                {data.recursos.map((r) => {
                  const t = tramoDe(r.id);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-tinta/10 bg-white px-3 py-2">
                      <label className="flex min-w-[11rem] flex-1 items-center gap-2 text-sm"><input type="checkbox" className="accent-[#B8935A]" checked={!!t} onChange={(e) => toggle(r.id, e.target.checked)} />{r.nombre}</label>
                      {t && <>
                        <label className="flex items-center gap-1 text-xs text-tinta-soft">desde min<input type="number" min="0" step="15" aria-label={`Inicio del tramo de ${r.nombre}`} className="w-20 rounded-lg border border-tinta/15 px-2 py-1 text-sm text-tinta" value={t.offsetMin} onChange={(e) => setTramo(r.id, { offsetMin: e.target.value })} /></label>
                        <label className="flex items-center gap-1 text-xs text-tinta-soft">durante<input type="number" min="15" step="15" aria-label={`Duración del tramo de ${r.nombre}`} className="w-20 rounded-lg border border-tinta/15 px-2 py-1 text-sm text-tinta" value={t.duracionMin} onChange={(e) => setTramo(r.id, { duracionMin: e.target.value })} />min</label>
                      </>}
                    </div>
                  );
                })}
              </div>
            </Field>
            <p className="text-sm text-tinta-soft">Duración: <span className="text-tinta">{duracion} min</span> (la marca el tramo que termina más tarde).</p>
            <Field label="Lugar" error={err.lugar}>
              <div className="flex flex-wrap items-center gap-5 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#B8935A]" checked={f.admiteEstudio !== false} onChange={(e) => setF({ ...f, admiteEstudio: e.target.checked })} />En estudio</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#B8935A]" checked={!!f.admiteDomicilio} onChange={(e) => setF({ ...f, admiteDomicilio: e.target.checked })} />A domicilio</label>
                {f.admiteDomicilio && <label className="flex items-center gap-2 text-xs text-tinta-soft">Traslado bloqueado antes<input type="number" min="0" step="15" aria-label="Minutos de traslado" className="w-20 rounded-lg border border-tinta/15 px-2 py-1 text-sm text-tinta" value={f.trasladoMin} onChange={(e) => setF({ ...f, trasladoMin: e.target.value })} />min</label>}
              </div>
            </Field>
            <div className="flex flex-wrap gap-5 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#B8935A]" checked={!!f.esNovia} onChange={(e) => setF({ ...f, esNovia: e.target.checked })} />Servicio de novia (admite acompañantes y pestañas; cuenta para el máximo de 2 por día)</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#B8935A]" checked={!!f.esPrueba} onChange={(e) => setF({ ...f, esPrueba: e.target.checked })} />Es prueba (lo usa «Agendar prueba»)</label>
            </div>
          </>
        )}
        {err.form && <p role="alert" className="rounded-xl bg-rojo-100 p-2.5 text-xs text-rojo">{err.form}</p>}
        <div className="flex justify-end gap-2 pt-2"><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="gold" onClick={guardarS}>Guardar</Btn></div>
      </div>
    </Modal>
  );
}

function proximoSabado(ahoraWall, semanas) {
  let k = D.addDaysKey(D.dayKey(ahoraWall), semanas * 7);
  while (D.weekdayOfKey(k) !== 6) k = D.addDaysKey(k, 1);
  return k;
}

function Ajustes({ data, commit, ahoraWall }) {
  const [confirmar, setConfirmar] = useState(false);
  const [restErr, setRestErr] = useState(null);
  const [fallo, setFallo] = useState(getSimularFallo());
  const [guiada, setGuiada] = useState(null);
  const correrGuiada = () => {
    let antes = null;
    try { antes = window.localStorage.getItem(STORAGE_KEY); } catch { antes = null; }
    const fecha = proximoSabado(ahoraWall, 10);
    const resultado = D.ejecutarPruebaGuiada(RECURSOS_SEED, SERVICIOS_SEED, TARIFAS_DEFECTO, fecha);
    let despues = null;
    try { despues = window.localStorage.getItem(STORAGE_KEY); } catch { despues = null; }
    setGuiada({ ...resultado, datosIntactos: antes === despues });
  };
  return (
    <div className="max-w-3xl">
      <H1 sub={`Los datos se guardan en este navegador con la clave «${STORAGE_KEY}». No se tocan otras claves.`}>Ajustes</H1>
      <AvisoDemo className="mb-5">Esta agenda es una demo con datos ficticios. Vive solo en este navegador: sin cuentas, sin sincronizar con otros dispositivos y sin contacto con el negocio. Dudas de alcance: partners@kodarvia.com.</AvisoDemo>
      <Card>
        <h2 className="font-serif text-xl font-light">Prueba guiada del briefing</h2>
        <p className="mt-1 text-sm text-tinta-soft">Caso de aceptación: novia a domicilio a 30 km a las 9:00 con 2 acompañantes y pestañas. Se ejecuta sobre una copia aislada del catálogo inicial, en un sábado sin reservas: no guarda nada ni cambia tus reservas, el catálogo o los totales.</p>
        <Btn variant="gold" className="mt-4" onClick={correrGuiada}>Ejecutar prueba guiada</Btn>
        {guiada && (
          <div className="mt-4" data-testid="prueba-guiada">
            <p className={cx('mb-3 rounded-xl px-3 py-2 text-sm', guiada.ok ? 'bg-salvia-100 text-salvia-700' : 'bg-rojo-100 text-rojo')}>
              <strong className="font-semibold">{guiada.ok ? 'Resultado: correcto.' : 'Resultado: no coincide.'}</strong> Copia aislada del {D.fechaLarga(guiada.fecha)}. {guiada.datosIntactos ? 'Tus datos guardados no cambiaron.' : 'Atención: los datos guardados cambiaron.'}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.14em] text-tinta-soft"><tr><th className="py-2 pr-3 font-normal">Paso</th><th className="py-2 pr-3 font-normal">Esperado</th><th className="py-2 pr-3 font-normal">Observado</th><th className="py-2 font-normal" /></tr></thead>
                <tbody className="divide-y divide-tinta/10">
                  {guiada.pasos.map((p, i) => (
                    <tr key={i}><td className="py-2 pr-3">{p.paso}</td><td className="py-2 pr-3 text-tinta-soft">{p.esperado}</td><td className="py-2 pr-3">{p.observado}</td><td className={cx('py-2 font-semibold', p.ok ? 'text-salvia-700' : 'text-rojo')}>{p.ok ? '✓' : '✗'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
      <Card className="mt-5">
        <h2 className="font-serif text-xl font-light">Datos de prueba</h2>
        <p className="mt-1 text-sm text-tinta-soft">Vuelve a cargar el catálogo inicial (3 recursos y 6 servicios) y las 14 reservas de ejemplo, con fechas calculadas desde hoy. Reemplaza solo los datos de esta agenda.</p>
        <Btn variant="danger" className="mt-4" onClick={() => { setRestErr(null); setConfirmar(true); }}>Restaurar datos de prueba</Btn>
      </Card>
      <Card className="mt-5">
        <h2 className="font-serif text-xl font-light">Probar un guardado fallido</h2>
        <p className="mt-1 text-sm text-tinta-soft">Mientras esté activo, cada guardado falla como si el navegador no tuviera espacio. Probá crear una reserva: vas a ver el aviso, el borrador queda en el formulario y no se asigna número ni se ocupan recursos. No se recuerda al recargar.</p>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#B8935A]" checked={fallo} onChange={(e) => { setSimularFallo(e.target.checked); setFallo(e.target.checked); }} />
          Simular fallo de guardado
        </label>
      </Card>
      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Restaurar datos de prueba">
        <p className="text-sm">Se reemplazan todas las reservas, recursos, servicios y tarifas de esta agenda por los datos de ejemplo. No se puede deshacer.</p>
        {restErr && <p role="alert" className="mt-3 rounded-xl bg-rojo-100 p-2.5 text-xs text-rojo">No se guardó: {restErr} Tus datos siguen como estaban.</p>}
        <div className="mt-5 flex justify-end gap-2"><Btn variant="ghost" onClick={() => setConfirmar(false)}>Cancelar</Btn><Btn variant="danger" onClick={() => {
          const res = commit(crearSeed(), 'Datos de prueba restaurados.');
          if (res.ok) setConfirmar(false); else setRestErr(res.error);
        }}>Restaurar</Btn></div>
      </Modal>
    </div>
  );
}

function Compartir({ texto }) {
  const [estado, setEstado] = useState(null);
  const ref = useRef(null);
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setEstado('Texto copiado. Pegalo donde quieras y envialo vos.'); }
    catch { ref.current?.focus(); ref.current?.select(); setEstado('No se pudo copiar solo: el texto quedó seleccionado, copialo con Ctrl/Cmd + C.'); }
  };
  const compartir = async () => {
    try { await navigator.share({ text: texto }); setEstado('Se abrió el menú de tu dispositivo. El envío lo hacés vos.'); }
    catch (e) { if (e?.name !== 'AbortError') setEstado('No se pudo abrir el menú de compartir. Usá «Copiar texto».'); }
  };
  return (
    <Card className="bg-white">
      <h2 className="font-serif text-xl font-light">Compartir</h2>
      <p className="mt-1 text-xs text-tinta-soft">Prepara el texto para que lo envíes vos, por WhatsApp o donde quieras. La app no envía mensajes ni se conecta con ningún servicio.</p>
      <textarea ref={ref} readOnly aria-label="Texto para compartir" className="mt-3 h-44 w-full rounded-xl border border-tinta/15 bg-crema p-2 text-xs leading-relaxed text-tinta" value={texto} onFocus={(e) => e.target.select()} />
      <div className="mt-2 flex flex-wrap gap-2">
        <Btn variant="primary" className="flex-1" onClick={copiar}>Copiar texto</Btn>
        {puedeCompartir && <Btn variant="soft" className="flex-1" onClick={compartir}>Compartir…</Btn>}
      </div>
      {estado && <p role="status" className="mt-2 text-xs text-tinta-soft">{estado}</p>}
    </Card>
  );
}
