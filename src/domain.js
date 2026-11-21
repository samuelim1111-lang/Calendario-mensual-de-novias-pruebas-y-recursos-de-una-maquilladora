// Lógica de dominio pura: sin React, sin localStorage. Todo lo testeable vive acá.
//
// Convención de tiempo: las fechas de evento ("inicio") son hora de pared del
// negocio (Montevideo) en formato "YYYY-MM-DDTHH:mm", sin zona. Se operan como
// minutos sobre un UTC ficticio, así la aritmética no depende de la zona del
// navegador. Los instantes reales (fechaRetencion, historial) son ISO UTC.

export const ZONA_NEGOCIO = 'America/Montevideo';
// ---------- Fechas de pared ----------
const pad = (n) => String(n).padStart(2, '0');

export function parseWall(s) {
  // "YYYY-MM-DDTHH:mm" o "YYYY-MM-DD" -> ms en UTC ficticio
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || '');
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
}
export function formatWall(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export const dayKey = (wall) => (wall || '').slice(0, 10);
export const timeOf = (wall) => (wall || '').slice(11, 16);
export function minutesOfDay(wall) {
  const t = timeOf(wall);
  return +t.slice(0, 2) * 60 + +t.slice(3, 5);
}
export function hhmm(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
export function addMinutesWall(wall, min) {
  return formatWall(parseWall(wall) + min * 60000);
}
export function addDaysKey(key, n) {
  return formatWall(parseWall(key) + n * 86400000).slice(0, 10);
}
export function daysInMonth(y, m0) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}
/** Mismo día y hora un mes antes; si el día no existe (31 -> 30 de nov), el último del mes. */
export function oneMonthBefore(wall) {
  const ms = parseWall(wall);
  const d = new Date(ms);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() - 1;
  if (m < 0) { m = 11; y -= 1; }
  const day = Math.min(d.getUTCDate(), daysInMonth(y, m));
  return formatWall(Date.UTC(y, m, day, d.getUTCHours(), d.getUTCMinutes()));
}
export function weekdayOfKey(key) {
  return new Date(parseWall(key)).getUTCDay(); // 0 domingo
}

/** "Ahora" como hora de pared de Montevideo, sea cual sea la zona del navegador. */
export function nowWall(instant = new Date(), timeZone = ZONA_NEGOCIO) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

// ---------- Ocupación: cada recurso con su propio intervalo ----------

// ---------- Configuración de ejemplo ----------
export const HORA_APERTURA = 7 * 60; // 07:00
export const HORA_CIERRE = 20 * 60; // 20:00
export const DIA_SIN_RESERVAS = 1; // lunes
export const PASO_MIN = 15;
export const MIN_POR_ACOMPANANTE = 45;
export const MIN_POSTIZAS = 15;
export const MAX_NOVIAS_POR_DIA = 2;
export const HORAS_RETENCION = 48;
export const ESTADOS = ['Consulta', 'Fecha retenida', 'Señada', 'Saldo pagado', 'Realizada', 'Cancelada'];
/** Estados que ocupan recursos. Consulta y Cancelada no ocupan. */
export const ESTADOS_QUE_OCUPAN = ['Fecha retenida', 'Señada', 'Saldo pagado', 'Realizada'];
export const TARIFAS_DEFECTO = { acompananteUYU: 2800, postizasUYU: 900, kmUYU: 60 };

export const esActiva = (r) => ESTADOS_QUE_OCUPAN.includes(r.estado) && !!r.inicio;
export const esLunes = (key) => weekdayOfKey(key) === DIA_SIN_RESERVAS;
const principalDe = (recursos) => recursos.find((r) => r.principal && r.tipo === 'Persona') || recursos.find((r) => r.tipo === 'Persona');
/** La asistente: primera persona que no es la principal. */
export const asistenteDe = (recursos) => recursos.find((r) => r.tipo === 'Persona' && !r.principal);
/** Duración y precio de los extras (acompañante y pestañas), tomados del catálogo. */
export function extrasDe(servicios, tarifas = TARIFAS_DEFECTO) {
  const ac = servicios.find((s) => s.extra === 'acompanante');
  const pe = servicios.find((s) => s.extra === 'pestanas');
  return {
    minAcompanante: ac ? ac.duracionMin : MIN_POR_ACOMPANANTE,
    minPostizas: pe ? pe.duracionMin : MIN_POSTIZAS,
    tarifas: { ...tarifas, acompananteUYU: ac ? Number(ac.precioUYU) : tarifas.acompananteUYU, postizasUYU: pe ? Number(pe.precioUYU) : tarifas.postizasUYU },
  };
}
export const admiteLugar = (s, lugar) => (lugar === 'Domicilio' ? !!s?.admiteDomicilio : s?.admiteEstudio !== false);

// ---------- Ocupación: cada recurso con su propio intervalo ----------

/**
 * Tramos efectivos de una reserva (minutos desde la hora de inicio; pueden ser negativos por el traslado).
 * - A domicilio no se ocupa ningún espacio (estudio).
 * - Pestañas: +15 min al tramo de la maquilladora en servicios de novia.
 * - Acompañantes: 45 min c/u a continuación de la novia, con `acompanantesCon` (asistente o maquilladora).
 *   Si las hace la maquilladora, se suma a su tramo; en el estudio, ocupan también el sillón.
 * - Traslado: a domicilio, la maquilladora queda bloqueada `trasladoMin` antes de la hora de inicio.
 */
export function tramosEfectivos(servicio, recursos, { lugar = 'Estudio', acompanantes = 0, postizas = false, acompanantesCon = null, minAcompanante = MIN_POR_ACOMPANANTE, minPostizas = MIN_POSTIZAS } = {}) {
  const byId = Object.fromEntries(recursos.map((r) => [r.id, r]));
  let tr = (servicio.tramos || []).map((t) => ({ recursoId: t.recursoId, desde: t.offsetMin, hasta: t.offsetMin + t.duracionMin }));
  if (lugar === 'Domicilio') tr = tr.filter((t) => byId[t.recursoId]?.tipo !== 'Espacio');
  const principal = principalDe(recursos)?.id;
  const extender = (recursoId, extra) => {
    const t = tr.find((x) => x.recursoId === recursoId);
    if (!t) return;
    const fin = t.hasta;
    tr = tr.map((x) => {
      if (x === t) return { ...x, hasta: x.hasta + extra };
      if (x.desde >= fin) return { ...x, desde: x.desde + extra, hasta: x.hasta + extra };
      if (x.hasta >= fin) return { ...x, hasta: x.hasta + extra };
      return x;
    });
  };
  const nov = tr.find((t) => t.recursoId === principal) || tr.find((t) => byId[t.recursoId]?.tipo === 'Persona');
  if (servicio.esNovia && nov) {
    if (postizas) extender(nov.recursoId, minPostizas);
    const n = Math.max(0, Math.min(4, acompanantes | 0));
    if (n > 0) {
      const extra = n * minAcompanante;
      const finNovia = tr.find((t) => t.recursoId === nov.recursoId).hasta;
      const con = acompanantesCon && byId[acompanantesCon] ? acompanantesCon : (asistenteDe(recursos)?.id || nov.recursoId);
      if (con === nov.recursoId) extender(nov.recursoId, extra);
      else {
        tr.push({ recursoId: con, desde: finNovia, hasta: finNovia + extra });
        tr = tr.map((x) => (byId[x.recursoId]?.tipo === 'Espacio' && x.hasta >= finNovia ? { ...x, hasta: Math.max(x.hasta, finNovia + extra) } : x));
      }
    }
  }
  const traslado = servicio.trasladoMin | 0;
  if (lugar === 'Domicilio' && traslado > 0 && principal) {
    tr = tr.map((x) => (x.recursoId === principal && x.desde === Math.min(...tr.filter((y) => y.recursoId === principal).map((y) => y.desde)) ? { ...x, desde: x.desde - traslado } : x));
  }
  return tr;
}

/** Minutos desde la hora de inicio hasta que termina todo (sin contar el traslado previo). */
export function duracionTotal(servicio, recursos, opts) {
  const tr = tramosEfectivos(servicio, recursos, opts);
  return tr.length ? Math.max(...tr.map((t) => t.hasta)) : servicio.duracionMin;
}

export function ocupacionDeReserva(reserva, servicios, recursos) {
  const s = servicios.find((x) => x.id === reserva.servicioId);
  if (!s || !reserva.inicio) return [];
  const base = parseWall(reserva.inicio);
  const ex = extrasDe(servicios);
  return tramosEfectivos(s, recursos, { ...reserva, minAcompanante: ex.minAcompanante, minPostizas: ex.minPostizas }).map((t) => ({
    recursoId: t.recursoId, reservaId: reserva.id, inicio: base + t.desde * 60000, fin: base + t.hasta * 60000,
  }));
}

export function ocupacionRecursoDia(recursoId, key, reservas, servicios, recursos) {
  const d0 = parseWall(key);
  const d1 = d0 + 86400000;
  const out = [];
  for (const r of reservas) {
    if (!esActiva(r)) continue;
    for (const o of ocupacionDeReserva(r, servicios, recursos)) if (o.recursoId === recursoId && o.inicio < d1 && o.fin > d0) out.push(o);
  }
  return out.sort((a, b) => a.inicio - b.inicio);
}

const solapa = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
const minDia = (ms) => Math.round((((ms % 86400000) + 86400000) % 86400000) / 60000);

export function noviasDelDia(key, ctx, ignorarId) {
  return ctx.reservas.filter((r) => esActiva(r) && r.id !== ignorarId && dayKey(r.inicio) === key && ctx.servicios.find((s) => s.id === r.servicioId)?.esNovia);
}

/** Chequeo de recursos con la asignación de acompañantes ya decidida. */
function chequearRecursos(cand, { reservas, servicios, recursos }, ignorarId) {
  const motivos = [];
  const ocup = ocupacionDeReserva({ ...cand, id: cand.id || '_cand' }, servicios, recursos);
  if (!ocup.length) return { ok: false, motivos: ['El servicio no tiene recursos asignados.'] };
  const key = dayKey(cand.inicio);
  const dia0 = parseWall(key);
  const ini = Math.min(...ocup.map((o) => o.inicio));
  const fin = Math.max(...ocup.map((o) => o.fin));
  if (ini < dia0 + HORA_APERTURA * 60000 || fin > dia0 + HORA_CIERRE * 60000) {
    motivos.push(`Fuera del horario (${hhmm(HORA_APERTURA)}–${hhmm(HORA_CIERRE)}): con traslado y extras iría de ${hhmm(minDia(ini))} a ${hhmm(minDia(fin))}.`);
  }
  const byId = Object.fromEntries(recursos.map((r) => [r.id, r]));
  const vistos = new Set();
  for (const o of ocup) {
    const rec = byId[o.recursoId];
    if (!rec) { motivos.push('Un recurso del servicio ya no existe.'); continue; }
    if ((rec.diasBloqueados || []).includes(key)) {
      if (!vistos.has(rec.id)) motivos.push(`${rec.nombre} tiene el día ${fechaLarga(key)} bloqueado.`);
      vistos.add(rec.id);
      continue;
    }
    for (const r of reservas) {
      if (!esActiva(r) || r.id === ignorarId || r.id === cand.id) continue;
      for (const x of ocupacionDeReserva(r, servicios, recursos)) {
        if (x.recursoId === o.recursoId && solapa(o.inicio, o.fin, x.inicio, x.fin)) {
          const sx = servicios.find((q) => q.id === r.servicioId);
          motivos.push(`${rec.nombre} no está libre de ${hhmm(minDia(x.inicio))} a ${hhmm(minDia(x.fin))} (${r.novia?.nombre || 'otra reserva'} · ${sx?.nombre || 'servicio'}); esta reserva la necesita de ${hhmm(minDia(o.inicio))} a ${hhmm(minDia(o.fin))}.`);
        }
      }
    }
  }
  return { ok: motivos.length === 0, motivos };
}

/**
 * ¿Entra la reserva? Devuelve { ok, motivos[], acompanantesCon }.
 * Cada recurso se compara solo contra su propio intervalo. Las acompañantes van con la
 * asistente si está libre; si no, con la maquilladora sumando tiempo.
 */
export function verificarDisponibilidad(cand, ctx, { ignorarId } = {}) {
  const { servicios, recursos } = ctx;
  const s = servicios.find((x) => x.id === cand.servicioId);
  if (!s) return { ok: false, motivos: ['Elegí un servicio del catálogo.'] };
  if (!cand.inicio) return { ok: false, motivos: ['Elegí fecha y hora para retener la fecha.'] };
  const key = dayKey(cand.inicio);
  const base = [];
  if (esLunes(key)) base.push('Los lunes no se toman reservas.');
  if (!admiteLugar(s, cand.lugar)) base.push(`«${s.nombre}» no se hace ${cand.lugar === 'Domicilio' ? 'a domicilio' : 'en el estudio'}.`);
  if (s.esNovia) {
    const n = noviasDelDia(key, ctx, ignorarId ?? cand.id).length;
    if (n >= MAX_NOVIAS_POR_DIA) base.push(`Ya hay ${n} novias el ${fechaLarga(key)}: no se toman más de ${MAX_NOVIAS_POR_DIA} por día.`);
  }
  if (base.length) return { ok: false, motivos: base };
  const ign = ignorarId ?? null;
  const conAcomp = s.esNovia && (cand.acompanantes | 0) > 0;
  if (conAcomp && !cand.acompanantesCon) {
    const asis = asistenteDe(recursos);
    const prin = principalDe(recursos);
    let r1 = null;
    if (asis) {
      r1 = chequearRecursos({ ...cand, acompanantesCon: asis.id }, ctx, ign);
      if (r1.ok) return { ...r1, acompanantesCon: asis.id };
    }
    const r2 = chequearRecursos({ ...cand, acompanantesCon: prin?.id }, ctx, ign);
    if (r2.ok) return { ...r2, acompanantesCon: prin?.id };
    const motivos = [...new Set([...(r1 ? r1.motivos : []), ...r2.motivos])];
    return { ok: false, motivos: r1 ? ['Las acompañantes no entran ni con la asistente ni con la maquilladora:', ...motivos] : motivos };
  }
  const r = chequearRecursos(cand, ctx, ign);
  return { ...r, acompanantesCon: conAcomp ? cand.acompanantesCon : null };
}

export function horariosDisponibles(cand, ctx, opts) {
  const key = dayKey(cand.inicio) || cand.fecha;
  const out = [];
  for (let m = HORA_APERTURA; m < HORA_CIERRE; m += PASO_MIN) {
    if (verificarDisponibilidad({ ...cand, acompanantesCon: null, inicio: `${key}T${hhmm(m)}` }, ctx, opts).ok) out.push(hhmm(m));
  }
  return out;
}

// ---------- Cupo diario y estado del día ----------

export function huecos(recursoId, key, ctx) {
  const rec = ctx.recursos.find((r) => r.id === recursoId);
  if (!rec || esLunes(key) || (rec.diasBloqueados || []).includes(key)) return [];
  const d0 = parseWall(key);
  const occ = ocupacionRecursoDia(recursoId, key, ctx.reservas, ctx.servicios, ctx.recursos)
    .map((o) => [Math.max(HORA_APERTURA, (o.inicio - d0) / 60000), Math.min(HORA_CIERRE, (o.fin - d0) / 60000)]);
  const out = [];
  let cur = HORA_APERTURA;
  for (const [a, b] of occ) { if (a > cur) out.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < HORA_CIERRE) out.push([cur, HORA_CIERRE]);
  return out;
}

/** Largo de hueco que mantiene un día abierto: para la maquilladora, el servicio de novia más corto (90 min). */
export function huecoMinimo(recursoId, ctx) {
  const rec = ctx.recursos.find((r) => r.id === recursoId);
  const durs = [];
  for (const s of ctx.servicios) {
    if (s.extra || (rec?.principal && !s.esNovia)) continue;
    for (const t of s.tramos || []) if (t.recursoId === recursoId) durs.push(t.duracionMin);
  }
  return durs.length ? Math.min(...durs) : MIN_POR_ACOMPANANTE;
}

/**
 * Cerrado (lunes) / Libre (la maquilladora no tiene nada) / Parcial (le queda algún hueco de 90 min) / Completo.
 * Con filtro de recurso se aplica la misma regla a ese recurso.
 */
export function estadoDia(key, ctx, recursoFiltroId = null) {
  if (esLunes(key)) return 'Cerrado';
  const objetivo = recursoFiltroId || principalDe(ctx.recursos)?.id;
  if (!objetivo) return 'Libre';
  const rec = ctx.recursos.find((r) => r.id === objetivo);
  if ((rec?.diasBloqueados || []).includes(key)) return 'Completo';
  if (!ocupacionRecursoDia(objetivo, key, ctx.reservas, ctx.servicios, ctx.recursos).length) return 'Libre';
  const minimo = huecoMinimo(objetivo, ctx);
  return huecos(objetivo, key, ctx).some(([a, b]) => b - a >= minimo) ? 'Parcial' : 'Completo';
}

// ---------- Precios ----------
export function calcularPrecio({ servicio, lugar, km, acompanantes, postizas }, tarifas = TARIFAS_DEFECTO) {
  const base = servicio ? Number(servicio.precioUYU) || 0 : 0;
  const extras = !!servicio?.esNovia;
  const nAcomp = extras ? Math.max(0, Math.min(4, acompanantes | 0)) : 0;
  const acomp = nAcomp * tarifas.acompananteUYU;
  const post = extras && postizas ? tarifas.postizasUYU : 0;
  const traslado = lugar === 'Domicilio' ? Math.max(0, km | 0) * tarifas.kmUYU : 0;
  const total = base + traslado + acomp + post;
  const sena = total / 2;
  return { base, acomp, post, traslado, total, sena, saldo: total - sena };
}

export function formatUYU(n) {
  const entero = Number.isInteger(n);
  return '$ ' + n.toLocaleString('es-UY', { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 }) + ' UYU';
}

// ---------- Validación ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** f.tipo: 'retener' (por defecto) o 'consulta' (fecha opcional, no ocupa recursos). */
export function validarReserva(f, ctx, ahoraWall) {
  const e = {};
  const consulta = f.tipo === 'consulta';
  if (!f.nombre?.trim()) e.nombre = 'Ingresá el nombre de la novia.';
  if (!f.email?.trim()) e.email = 'Ingresá un email.';
  else if (!EMAIL_RE.test(f.email.trim())) e.email = 'El email no tiene un formato válido (ej.: nombre@correo.com).';
  const s = ctx.servicios.find((x) => x.id === f.servicioId);
  if (!f.servicioId || !s) e.servicioId = 'Elegí un servicio del catálogo.';
  if (!consulta || f.fecha || f.hora) {
    if (!f.fecha) e.fecha = consulta ? 'Completá la fecha o dejá fecha y hora vacías.' : 'Elegí una fecha.';
    if (!f.hora) e.hora = consulta ? 'Completá la hora o dejá fecha y hora vacías.' : 'Elegí una hora de inicio.';
  }
  if (f.fecha && f.hora) {
    const ini = `${f.fecha}T${f.hora}`;
    const m = minutesOfDay(ini);
    if (ini < ahoraWall) e.hora = 'La fecha y hora de inicio no puede estar en el pasado.';
    else if (m < HORA_APERTURA || m >= HORA_CIERRE) e.hora = `La hora de inicio debe estar entre ${hhmm(HORA_APERTURA)} y ${hhmm(HORA_CIERRE)}.`;
    else if (esLunes(f.fecha)) e.fecha = 'Los lunes no se toman reservas (horario de martes a domingo).';
  }
  if (f.lugar !== 'Estudio' && f.lugar !== 'Domicilio') e.lugar = 'Elegí Estudio o Domicilio.';
  else if (s && !admiteLugar(s, f.lugar)) e.lugar = `«${s.nombre}» no se hace ${f.lugar === 'Domicilio' ? 'a domicilio' : 'en el estudio'}.`;
  if (f.lugar === 'Domicilio') {
    if (!f.direccion?.trim()) e.direccion = 'La dirección es obligatoria a domicilio.';
    const km = Number(f.km);
    if (f.km === '' || f.km == null || !Number.isInteger(km) || km < 1 || km > 60) e.km = 'Indicá los kilómetros: un número entero de 1 a 60.';
  }
  const a = Number(f.acompanantes);
  if (!Number.isInteger(a) || a < 0 || a > 4) e.acompanantes = 'Acompañantes: de 0 a 4.';
  else if (a > 0 && s && !s.esNovia) e.acompanantes = 'Las acompañantes se agregan solo a un servicio de novia.';
  if (f.postizas && s && !s.esNovia) e.postizas = 'Las pestañas se agregan solo a un servicio de novia.';
  return e;
}

// ---------- Estados y transiciones ----------
export function limiteSaldo(reserva) {
  return `${dayKey(reserva.inicio)}T00:00`;
}

export function accionesPermitidas(reserva, ahoraWall) {
  const yaPaso = !!reserva.inicio && ahoraWall >= reserva.inicio;
  const fueraDePlazo = !!reserva.inicio && ahoraWall >= limiteSaldo(reserva);
  const cancelar = { id: 'cancelar', label: 'Cancelar', a: 'Cancelada' };
  const realizada = { id: 'realizada', label: 'Marcar como realizada', a: 'Realizada' };
  switch (reserva.estado) {
    case 'Consulta': return [{ id: 'retener', label: 'Retener fecha (48 h)', a: 'Fecha retenida' }, cancelar];
    case 'Fecha retenida': return [{ id: 'sena', label: 'Registrar seña (50 %)', a: 'Señada' }, cancelar];
    case 'Señada': return [{ id: 'saldo', label: 'Registrar saldo pagado', a: 'Saldo pagado', requiereFueraDePlazo: fueraDePlazo }, ...(yaPaso ? [realizada] : []), cancelar];
    case 'Saldo pagado': return [...(yaPaso ? [realizada] : []), cancelar];
    default: return [];
  }
}

/**
 * Aplica una transición o lanza Error con el motivo. `retener` necesita ctx para verificar recursos.
 * Cancelar una reserva señada deja anotada la seña retenida (no se devuelve).
 */
export function aplicarTransicion(reserva, accionId, ahoraWall, ahoraISO, { pagoFueraPlazo = false, ctx = null } = {}) {
  const acc = accionesPermitidas(reserva, ahoraWall).find((x) => x.id === accionId);
  if (!acc) throw new Error(`No se puede hacer eso con una reserva en «${reserva.estado}».`);
  if (acc.requiereFueraDePlazo && !pagoFueraPlazo) {
    throw new Error('El saldo se espera hasta el día anterior al evento. Para registrarlo ahora, marcá «Pago fuera de plazo».');
  }
  const extra = {};
  let motivo = acc.label;
  if (acc.id === 'saldo') { extra.pagoFueraPlazo = !!acc.requiereFueraDePlazo; if (extra.pagoFueraPlazo) motivo += ' · fuera de plazo'; }
  if (acc.id === 'retener') {
    if (!ctx) throw new Error('Falta el contexto para verificar recursos.');
    const v = verificarDisponibilidad({ ...reserva, acompanantesCon: null }, ctx, { ignorarId: reserva.id });
    if (!v.ok) throw new Error(v.motivos.join(' '));
    extra.fechaRetencion = ahoraISO;
    extra.acompanantesCon = v.acompanantesCon;
  }
  if (acc.id === 'cancelar' && (reserva.estado === 'Señada' || reserva.estado === 'Saldo pagado')) {
    extra.senaRetenida = reserva.sena;
    motivo += ` · seña de ${formatUYU(reserva.sena)} no devuelta`;
  }
  return {
    ...reserva, ...extra, estado: acc.a,
    historial: [...(reserva.historial || []), { en: ahoraISO, de: reserva.estado, a: acc.a, motivo }],
  };
}

export function venceEn(reserva, ahoraMs) {
  return Date.parse(reserva.fechaRetencion) + HORAS_RETENCION * 3600000 - ahoraMs;
}

/** Fecha retenida sin seña con 48 h cumplidas → Cancelada (se ejecuta al abrir la app y cada 30 s). */
export function vencerRetenidas(reservas, ahoraMs) {
  let cambios = 0;
  const next = reservas.map((r) => {
    if (r.estado === 'Fecha retenida' && r.fechaRetencion && venceEn(r, ahoraMs) <= 0) {
      cambios++;
      return {
        ...r, estado: 'Cancelada', canceladaPorVencimiento: true,
        historial: [...(r.historial || []), { en: new Date(Date.parse(r.fechaRetencion) + HORAS_RETENCION * 3600000).toISOString(), de: 'Fecha retenida', a: 'Cancelada', motivo: 'Vencida: 48 h sin seña. Recursos liberados.' }],
      };
    }
    return r;
  });
  return { reservas: next, cambios };
}

// ---------- Prueba ----------
export function proponerPrueba(reserva, servicioPruebaId, ctx, ahoraWall) {
  if (!reserva.inicio) return { error: 'La reserva no tiene fecha.' };
  const hora = timeOf(reserva.inicio);
  const propuesta = oneMonthBefore(reserva.inicio);
  const eventoKey = dayKey(reserva.inicio);
  let key = dayKey(propuesta);
  let motivoOriginal = null;
  for (let i = 0; i < 62 && key < eventoKey; i++, key = addDaysKey(key, 1)) {
    const inicio = `${key}T${hora}`;
    if (inicio < ahoraWall) { if (i === 0) motivoOriginal = 'La fecha de un mes antes ya pasó.'; continue; }
    const v = verificarDisponibilidad({ servicioId: servicioPruebaId, inicio, lugar: 'Estudio', acompanantes: 0, novia: reserva.novia }, ctx);
    if (v.ok) return { inicio, propuestaOriginal: `${dayKey(propuesta)}T${hora}`, movida: i > 0, motivoOriginal };
    if (i === 0) motivoOriginal = v.motivos[0];
  }
  return { error: 'No hay ningún día libre a esa hora entre un mes antes y el evento.' };
}

export function reservasFuturasDeRecurso(recursoId, ctx, ahoraWall) {
  return ctx.reservas.filter((r) => esActiva(r) && r.inicio >= ahoraWall.slice(0, 10)
    && ocupacionDeReserva(r, ctx.servicios, ctx.recursos).some((o) => o.recursoId === recursoId));
}

// ---------- .ics ----------
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDate = (wall) => wall.replace(/[-:]/g, '') + '00';
function fold(line) {
  // RFC 5545: líneas de hasta 75 octetos; continuación con un espacio.
  if (new TextEncoder().encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function generarICS(reserva, servicios, recursos, ahoraISO = new Date().toISOString()) {
  if (!reserva.inicio) throw new Error('La consulta no tiene fecha.');
  const servicio = servicios.find((x) => x.id === reserva.servicioId);
  const ex = extrasDe(servicios);
  const fin = addMinutesWall(reserva.inicio, duracionTotal(servicio, recursos, { ...reserva, minAcompanante: ex.minAcompanante, minPostizas: ex.minPostizas }));
  const lugar = reserva.lugar === 'Domicilio' ? `Domicilio: ${reserva.direccion} (${reserva.km} km)` : 'Estudio';
  const stamp = ahoraISO.replace(/[-:]/g, '').replace(/\.\d+/, '');
  const desc = [
    `Servicio: ${servicio.nombre}`,
    `Novia: ${reserva.novia.nombre} <${reserva.novia.email}>`,
    `Acompañantes: ${reserva.acompanantes}`,
    `Pestañas postizas: ${reserva.postizas ? 'sí' : 'no'}`,
    ...(reserva.lugar === 'Domicilio' && servicio.trasladoMin ? [`Traslado bloqueado: ${servicio.trasladoMin} min antes`] : []),
    `Estado: ${reserva.estado}`,
    `Total: ${formatUYU(reserva.total)} · Seña: ${formatUYU(reserva.sena)} · Saldo: ${formatUYU(reserva.saldo)}`,
  ].join('\n');
  const status = reserva.estado === 'Cancelada' ? 'CANCELLED' : ['Consulta', 'Fecha retenida'].includes(reserva.estado) ? 'TENTATIVE' : 'CONFIRMED';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agenda Maquilladora//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', `TZID:${ZONA_NEGOCIO}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'TZNAME:-03', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${reserva.id}@agenda-maquilladora`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${ZONA_NEGOCIO}:${icsDate(reserva.inicio)}`,
    `DTEND;TZID=${ZONA_NEGOCIO}:${icsDate(fin)}`,
    `SUMMARY:${icsEsc(`${servicio.nombre} · ${reserva.novia.nombre}`)}`,
    `LOCATION:${icsEsc(lugar)}`,
    `DESCRIPTION:${icsEsc(desc)}`,
    `STATUS:${status}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ---------- Formato ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const nombreMes = (m0) => MESES[m0];
export function fechaLarga(key) {
  const d = new Date(parseWall(key));
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}
export function fechaCorta(key) {
  const d = new Date(parseWall(key));
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}
export const uid = (p = 'id') => `${p}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

// ---------- Prueba guiada (copia aislada) ----------

/**
 * Caso de aceptación del briefing sobre una copia aislada del catálogo (no lee ni escribe reservas guardadas):
 * novia a domicilio a 30 km a las 9:00 con 2 acompañantes y pestañas.
 */
export function ejecutarPruebaGuiada(recursosBase, serviciosBase, tarifasBase, fecha) {
  const recursos = structuredClone(recursosBase);
  const servicios = structuredClone(serviciosBase);
  const tarifas = { ...tarifasBase };
  const reservas = [];
  const ctx = { reservas, servicios, recursos };
  const prin = recursos.find((r) => r.principal) || recursos[0];
  const asis = asistenteDe(recursos);
  const sDom = servicios.find((s) => s.esNovia && s.admiteDomicilio && s.admiteEstudio === false) || servicios.find((s) => s.esNovia);
  const sSolo = servicios.find((s) => !s.extra && !s.esNovia && !s.esPrueba && (s.tramos || []).length === 1 && s.tramos[0].recursoId === prin.id);
  const franja = (reserva, recursoId) => {
    const o = ocupacionDeReserva(reserva, servicios, recursos).filter((x) => x.recursoId === recursoId);
    if (!o.length) return '—';
    return `${hhmm(minDia(Math.min(...o.map((x) => x.inicio))))}–${hhmm(minDia(Math.max(...o.map((x) => x.fin))))}`;
  };
  const novia = { id: 'guiada-novia', servicioId: sDom.id, inicio: `${fecha}T09:00`, lugar: 'Domicilio', direccion: 'Demo', km: 30, acompanantes: 2, postizas: true, estado: 'Señada', novia: { nombre: 'Novia de la prueba', email: 'demo@demo.test' } };
  const pasos = [];
  const v0 = verificarDisponibilidad(novia, ctx);
  if (v0.ok) { novia.acompanantesCon = v0.acompanantesCon; reservas.push(novia); }
  pasos.push({ paso: `${sDom.nombre}: 30 km, 9:00, 2 acompañantes y pestañas`, esperado: 'Se acepta', observado: v0.ok ? 'Se acepta' : 'Se rechaza: ' + v0.motivos[0] });
  const p = calcularPrecio({ servicio: sDom, lugar: 'Domicilio', km: 30, acompanantes: 2, postizas: true }, extrasDe(servicios, tarifas).tarifas);
  pasos.push({ paso: 'Total (servicio + traslado + acompañantes + pestañas)', esperado: formatUYU(17300), observado: `${formatUYU(p.base)} + ${formatUYU(p.traslado)} + ${formatUYU(p.acomp)} + ${formatUYU(p.post)} = ${formatUYU(p.total)}`, ok: p.total === 17300 });
  pasos.push({ paso: 'Seña (50 %)', esperado: formatUYU(8650), observado: formatUYU(p.sena) });
  pasos.push({ paso: `Ocupación de ${prin.nombre} (traslado + novia + pestañas)`, esperado: '08:00–10:45', observado: franja(novia, prin.id) });
  pasos.push({ paso: `Ocupación de ${asis?.nombre || 'la asistente'} (2 acompañantes)`, esperado: '10:45–12:15', observado: asis ? franja(novia, asis.id) : '—' });
  if (sSolo) {
    const t11 = { id: 'guiada-t11', servicioId: sSolo.id, inicio: `${fecha}T11:00`, lugar: 'Estudio', km: 0, acompanantes: 0, postizas: false, estado: 'Señada', novia: { nombre: 'Tarea 11:00', email: 'demo@demo.test' } };
    const v1 = verificarDisponibilidad(t11, ctx);
    pasos.push({ paso: `Tarea a las 11:00 que solo necesita a la maquilladora (${sSolo.nombre})`, esperado: 'Se acepta (la asistente ocupada no la bloquea)', observado: v1.ok ? 'Se acepta (la asistente ocupada no la bloquea)' : 'Se rechaza: ' + v1.motivos.join(' ') });
    const t1030 = { ...t11, id: 'guiada-t1030', inicio: `${fecha}T10:30` };
    const v2 = verificarDisponibilidad(t1030, ctx);
    pasos.push({ paso: `Contraste: ${sSolo.nombre} a las 10:30`, esperado: 'Se rechaza por la maquilladora', observado: v2.ok ? 'Se acepta' : 'Se rechaza: ' + v2.motivos[0] });
  }
  for (const x of pasos) if (x.ok === undefined) x.ok = x.observado === x.esperado || (x.esperado.startsWith('Se rechaza') && x.observado.startsWith('Se rechaza'));
  return { fecha, pasos, ok: pasos.every((x) => x.ok) };
}

// ---------- Compartir (solo texto; lo envía la persona a mano) ----------
export function textoCompartir(reserva, servicio) {
  const lugar = reserva.lugar === 'Domicilio' ? `${reserva.direccion} (${reserva.km} km)` : 'Estudio';
  const lineas = [
    `Reserva N.º ${numeroReserva(reserva)} · ${servicio?.nombre || 'Servicio'}`,
    `Novia: ${reserva.novia.nombre}`,
    reserva.inicio ? `Fecha: ${fechaLarga(dayKey(reserva.inicio))}, ${timeOf(reserva.inicio)} h (hora de Montevideo)` : 'Fecha: a confirmar (consulta)',
    `Lugar: ${lugar}`,
    `Acompañantes: ${reserva.acompanantes} · Pestañas postizas: ${reserva.postizas ? 'sí' : 'no'}`,
    `Total: ${formatUYU(reserva.total)} · Seña (50 %): ${formatUYU(reserva.sena)} · Saldo: ${formatUYU(reserva.saldo)}`,
    `Estado: ${reserva.estado}`,
  ];
  if (reserva.estado === 'Fecha retenida' && reserva.fechaRetencion) {
    const vence = new Date(Date.parse(reserva.fechaRetencion) + HORAS_RETENCION * 3600000);
    lineas.push(`La fecha queda retenida hasta el ${vence.toLocaleString('es-UY', { timeZone: ZONA_NEGOCIO, dateStyle: 'short', timeStyle: 'short' })} (hora de Montevideo) si no se registra la seña.`);
  }
  if (reserva.estado === 'Cancelada' && reserva.senaRetenida) lineas.push(`Seña de ${formatUYU(reserva.senaRetenida)} no devuelta.`);
  return lineas.join('\n');
}

export const numeroReserva = (r) => (r.numero ? String(r.numero).padStart(4, '0') : '—');
