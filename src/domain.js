// Lógica de dominio pura: sin React, sin localStorage. Todo lo testeable vive acá.
//
// Convención de tiempo: las fechas de evento ("inicio") son hora de pared del
// negocio (Montevideo) en formato "YYYY-MM-DDTHH:mm", sin zona. Se operan como
// minutos sobre un UTC ficticio, así la aritmética no depende de la zona del
// navegador. Los instantes reales (fechaRetencion, historial) son ISO UTC.

export const ZONA_NEGOCIO = 'America/Montevideo';
export const HORA_APERTURA = 8 * 60; // 08:00
export const HORA_CIERRE = 20 * 60; // 20:00
export const PASO_MIN = 15;
export const MIN_POR_ACOMPANANTE = 40;
export const HORAS_RETENCION = 48;
export const ESTADOS = ['Retenida', 'Confirmada', 'Saldo pagado', 'Cancelada'];
export const ESTADOS_ACTIVOS = ['Retenida', 'Confirmada', 'Saldo pagado'];

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

/** Tramos efectivos de un servicio para una reserva concreta (minutos desde el inicio). */
export function tramosEfectivos(servicio, recursos, { lugar = 'Estudio', acompanantes = 0 } = {}) {
  const byId = Object.fromEntries(recursos.map((r) => [r.id, r]));
  let tramos = (servicio.tramos || []).map((t) => ({ ...t, fin: t.offsetMin + t.duracionMin }));
  // A domicilio no se ocupa ningún espacio (estudio); personas y equipos viajan.
  if (lugar === 'Domicilio') tramos = tramos.filter((t) => byId[t.recursoId]?.tipo !== 'Espacio');
  const extra = Math.max(0, acompanantes | 0) * MIN_POR_ACOMPANANTE;
  if (extra > 0) {
    const personas = tramos.filter((t) => byId[t.recursoId]?.tipo === 'Persona');
    const apoyo = personas.filter((t) => !byId[t.recursoId]?.principal);
    const pool = apoyo.length ? apoyo : personas;
    if (pool.length) {
      const elegido = pool.reduce((a, b) => (b.fin > a.fin ? b : a));
      const finOriginal = elegido.fin;
      tramos = tramos.map((t) => {
        if (t === elegido) return { ...t, fin: t.fin + extra };
        if (t.offsetMin >= finOriginal) return { ...t, offsetMin: t.offsetMin + extra, fin: t.fin + extra };
        if (t.fin >= finOriginal) return { ...t, fin: t.fin + extra };
        return t;
      });
    }
  }
  return tramos.map((t) => ({ recursoId: t.recursoId, desde: t.offsetMin, hasta: t.fin }));
}

export function duracionTotal(servicio, recursos, opts) {
  const tr = tramosEfectivos(servicio, recursos, opts);
  return tr.length ? Math.max(...tr.map((t) => t.hasta)) : servicio.duracionMin;
}

/** Intervalos absolutos (hora de pared) que ocupa una reserva, uno por recurso. */
export function ocupacionDeReserva(reserva, servicios, recursos) {
  const s = servicios.find((x) => x.id === reserva.servicioId);
  if (!s) return [];
  const base = parseWall(reserva.inicio);
  return tramosEfectivos(s, recursos, reserva).map((t) => ({
    recursoId: t.recursoId,
    reservaId: reserva.id,
    inicio: base + t.desde * 60000,
    fin: base + t.hasta * 60000,
  }));
}

export const esActiva = (r) => ESTADOS_ACTIVOS.includes(r.estado);

/** Intervalos ocupados de un recurso en un día (ms de pared), ordenados. */
export function ocupacionRecursoDia(recursoId, key, reservas, servicios, recursos) {
  const d0 = parseWall(key);
  const d1 = d0 + 86400000;
  const out = [];
  for (const r of reservas) {
    if (!esActiva(r)) continue;
    for (const o of ocupacionDeReserva(r, servicios, recursos)) {
      if (o.recursoId === recursoId && o.inicio < d1 && o.fin > d0) out.push(o);
    }
  }
  return out.sort((a, b) => a.inicio - b.inicio);
}

const solapa = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/**
 * Verifica si una reserva candidata entra. Devuelve { ok, motivos[] }.
 * Cada recurso se mira solo contra su propio intervalo: una tarea que usa solo
 * a la maquilladora no se bloquea porque la asistente esté ocupada.
 */
export function verificarDisponibilidad(cand, { reservas, servicios, recursos }, { ignorarId } = {}) {
  const motivos = [];
  const s = servicios.find((x) => x.id === cand.servicioId);
  if (!s) return { ok: false, motivos: ['Elegí un servicio del catálogo.'] };
  const ocup = ocupacionDeReserva({ ...cand, id: cand.id || '_cand' }, servicios, recursos);
  if (!ocup.length) return { ok: false, motivos: ['El servicio no tiene recursos asignados.'] };
  const key = dayKey(cand.inicio);
  const dia0 = parseWall(key);
  const ini = Math.min(...ocup.map((o) => o.inicio));
  const fin = Math.max(...ocup.map((o) => o.fin));
  if (ini < dia0 + HORA_APERTURA * 60000 || fin > dia0 + HORA_CIERRE * 60000) {
    motivos.push(`Fuera del horario de atención (${hhmm(HORA_APERTURA)}–${hhmm(HORA_CIERRE)}): el servicio iría de ${hhmm((ini - dia0) / 60000)} a ${hhmm((fin - dia0) / 60000)}.`);
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
          motivos.push(`${rec.nombre} no está libre de ${hhmm(minDia(x.inicio))} a ${hhmm(minDia(x.fin))} (${r.novia?.nombre || 'otra reserva'} · ${sx?.nombre || 'servicio'}); este servicio necesita ese recurso de ${hhmm(minDia(o.inicio))} a ${hhmm(minDia(o.fin))}.`);
        }
      }
    }
  }
  return { ok: motivos.length === 0, motivos };
}
const minDia = (ms) => Math.round((ms % 86400000) / 60000);

/** Horarios de inicio (cada 15 min) en que el servicio entra ese día. */
export function horariosDisponibles(cand, ctx, opts) {
  const key = dayKey(cand.inicio) || cand.fecha;
  const out = [];
  for (let m = HORA_APERTURA; m < HORA_CIERRE; m += PASO_MIN) {
    const inicio = `${key}T${hhmm(m)}`;
    if (verificarDisponibilidad({ ...cand, inicio }, ctx, opts).ok) out.push(hhmm(m));
  }
  return out;
}

// ---------- Estado del día ----------

/** Huecos libres de un recurso en la jornada (minutos del día). */
export function huecos(recursoId, key, ctx) {
  const rec = ctx.recursos.find((r) => r.id === recursoId);
  if (!rec || (rec.diasBloqueados || []).includes(key)) return [];
  const d0 = parseWall(key);
  const occ = ocupacionRecursoDia(recursoId, key, ctx.reservas, ctx.servicios, ctx.recursos)
    .map((o) => [Math.max(HORA_APERTURA, (o.inicio - d0) / 60000), Math.min(HORA_CIERRE, (o.fin - d0) / 60000)]);
  const out = [];
  let cur = HORA_APERTURA;
  for (const [a, b] of occ) {
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < HORA_CIERRE) out.push([cur, HORA_CIERRE]);
  return out;
}

/** Duración del servicio más corto que usa al recurso (lo que define "Completo"). */
export function servicioMasCorto(recursoId, servicios) {
  let min = Infinity;
  for (const s of servicios) {
    for (const t of s.tramos || []) if (t.recursoId === recursoId) min = Math.min(min, t.duracionMin);
  }
  return Number.isFinite(min) ? min : PASO_MIN;
}

/**
 * Libre / Parcial / Completo.
 * - Sin filtro: lo decide la maquilladora (recurso principal). Completo cuando no le
 *   queda ningún hueco del largo del servicio más corto. Libre cuando ningún recurso
 *   tiene nada ese día.
 * - Con filtro de recurso: la misma regla aplicada a ese recurso.
 */
export function estadoDia(key, ctx, recursoFiltroId = null) {
  const objetivo = recursoFiltroId || ctx.recursos.find((r) => r.principal)?.id || ctx.recursos[0]?.id;
  if (!objetivo) return 'Libre';
  const minimo = servicioMasCorto(objetivo, ctx.servicios);
  const hs = huecos(objetivo, key, ctx);
  if (!hs.some(([a, b]) => b - a >= minimo)) return 'Completo';
  const alcance = recursoFiltroId ? [recursoFiltroId] : ctx.recursos.map((r) => r.id);
  const algoOcupado = alcance.some((id) => {
    const r = ctx.recursos.find((x) => x.id === id);
    return (r?.diasBloqueados || []).includes(key) ||
      ocupacionRecursoDia(id, key, ctx.reservas, ctx.servicios, ctx.recursos).length > 0;
  });
  return algoOcupado ? 'Parcial' : 'Libre';
}

// ---------- Precios ----------
export const TARIFAS_DEFECTO = { acompananteUYU: 2500, postizasUYU: 900, kmUYU: 60 };

export function calcularPrecio({ servicio, lugar, km, acompanantes, postizas }, tarifas = TARIFAS_DEFECTO) {
  const base = servicio ? Number(servicio.precioUYU) || 0 : 0;
  const nAcomp = Math.max(0, Math.min(4, acompanantes | 0));
  const acomp = nAcomp * tarifas.acompananteUYU;
  const post = postizas ? tarifas.postizasUYU : 0;
  const kms = lugar === 'Domicilio' ? Math.max(0, km | 0) : 0;
  const traslado = kms * tarifas.kmUYU;
  const total = base + acomp + post + traslado;
  const sena = total / 2; // exactamente 50 %
  return { base, acomp, post, traslado, total, sena, saldo: total - sena };
}

export function formatUYU(n) {
  const entero = Number.isInteger(n);
  return '$ ' + n.toLocaleString('es-UY', { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 }) + ' UYU';
}

// ---------- Validación del formulario ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarReserva(f, ctx, ahoraWall) {
  const e = {};
  if (!f.nombre?.trim()) e.nombre = 'Ingresá el nombre de la novia.';
  if (!f.email?.trim()) e.email = 'Ingresá un email.';
  else if (!EMAIL_RE.test(f.email.trim())) e.email = 'El email no tiene un formato válido (ej.: nombre@correo.com).';
  const s = ctx.servicios.find((x) => x.id === f.servicioId);
  if (!f.servicioId || !s) e.servicioId = 'Elegí un servicio del catálogo.';
  if (!f.fecha) e.fecha = 'Elegí una fecha.';
  if (!f.hora) e.hora = 'Elegí una hora de inicio.';
  if (f.fecha && f.hora) {
    const ini = `${f.fecha}T${f.hora}`;
    const m = minutesOfDay(ini);
    if (ini < ahoraWall) e.hora = 'La fecha y hora de inicio no puede estar en el pasado.';
    else if (m < HORA_APERTURA || m >= HORA_CIERRE) e.hora = `La hora de inicio debe estar entre ${hhmm(HORA_APERTURA)} y ${hhmm(HORA_CIERRE)}.`;
  }
  if (f.lugar !== 'Estudio' && f.lugar !== 'Domicilio') e.lugar = 'Elegí Estudio o Domicilio.';
  if (f.lugar === 'Domicilio') {
    if (s && !s.admiteDomicilio) e.lugar = `«${s.nombre}» no se ofrece a domicilio.`;
    if (!f.direccion?.trim()) e.direccion = 'La dirección es obligatoria a domicilio.';
    const km = Number(f.km);
    if (f.km === '' || f.km == null || !Number.isInteger(km) || km < 1 || km > 60) e.km = 'Indicá los kilómetros: un número entero de 1 a 60.';
  }
  const a = Number(f.acompanantes);
  if (!Number.isInteger(a) || a < 0 || a > 4) e.acompanantes = 'Acompañantes: de 0 a 4.';
  return e;
}

// ---------- Estados y transiciones ----------

/** Último instante (hora de pared) para marcar Saldo pagado sin la marca: fin del día anterior al evento. */
export function limiteSaldo(reserva) {
  return `${dayKey(reserva.inicio)}T00:00`;
}

export function accionesPermitidas(reserva, ahoraWall) {
  const fueraDePlazo = ahoraWall >= limiteSaldo(reserva);
  switch (reserva.estado) {
    case 'Retenida':
      return [{ id: 'sena', label: 'Registrar seña (50 %)', a: 'Confirmada' }, { id: 'cancelar', label: 'Cancelar', a: 'Cancelada' }];
    case 'Confirmada':
      return [
        { id: 'saldo', label: 'Registrar saldo pagado', a: 'Saldo pagado', requiereFueraDePlazo: fueraDePlazo },
        { id: 'cancelar', label: 'Cancelar', a: 'Cancelada' },
      ];
    default:
      return [];
  }
}

/** Aplica una transición; lanza Error con el motivo si no corresponde. */
export function aplicarTransicion(reserva, accionId, ahoraWall, ahoraISO, { pagoFueraPlazo = false } = {}) {
  const acc = accionesPermitidas(reserva, ahoraWall).find((x) => x.id === accionId);
  if (!acc) throw new Error(`No se puede pasar de «${reserva.estado}» con esa acción.`);
  if (acc.requiereFueraDePlazo && !pagoFueraPlazo) {
    throw new Error('El plazo para el saldo venció el día anterior al evento. Para registrarlo, marcá «Pago fuera de plazo».');
  }
  const extra = acc.id === 'saldo' ? { pagoFueraPlazo: !!acc.requiereFueraDePlazo } : {};
  return {
    ...reserva,
    ...extra,
    estado: acc.a,
    historial: [...(reserva.historial || []), { en: ahoraISO, de: reserva.estado, a: acc.a, motivo: acc.label + (extra.pagoFueraPlazo ? ' · fuera de plazo' : '') }],
  };
}

export function venceEn(reserva, ahoraMs) {
  return Date.parse(reserva.fechaRetencion) + HORAS_RETENCION * 3600000 - ahoraMs;
}

/** Cancela automáticamente las retenidas sin seña con 48 h cumplidas. */
export function vencerRetenidas(reservas, ahoraMs) {
  let cambios = 0;
  const next = reservas.map((r) => {
    if (r.estado === 'Retenida' && r.fechaRetencion && venceEn(r, ahoraMs) <= 0) {
      cambios++;
      return {
        ...r,
        estado: 'Cancelada',
        canceladaPorVencimiento: true,
        historial: [...(r.historial || []), { en: new Date(Date.parse(r.fechaRetencion) + HORAS_RETENCION * 3600000).toISOString(), de: 'Retenida', a: 'Cancelada', motivo: 'Vencida: 48 h sin seña. Recursos liberados.' }],
      };
    }
    return r;
  });
  return { reservas: next, cambios };
}

// ---------- Prueba ----------

/**
 * Propone la prueba: misma hora un mes antes; si no entra, avanza día a día hasta
 * encontrar uno libre (antes del evento). Devuelve { inicio, movida, motivoOriginal } o { error }.
 */
export function proponerPrueba(reserva, servicioPruebaId, ctx, ahoraWall) {
  const hora = timeOf(reserva.inicio);
  const propuesta = oneMonthBefore(reserva.inicio);
  const eventoKey = dayKey(reserva.inicio);
  let key = dayKey(propuesta);
  let motivoOriginal = null;
  for (let i = 0; i < 62 && key < eventoKey; i++, key = addDaysKey(key, 1)) {
    const inicio = `${key}T${hora}`;
    if (inicio < ahoraWall) { if (i === 0) motivoOriginal = 'La fecha de un mes antes ya pasó.'; continue; }
    const cand = { servicioId: servicioPruebaId, inicio, lugar: 'Estudio', acompanantes: 0, novia: reserva.novia };
    const v = verificarDisponibilidad(cand, ctx);
    if (v.ok) return { inicio, propuestaOriginal: `${dayKey(propuesta)}T${hora}`, movida: i > 0, motivoOriginal };
    if (i === 0) motivoOriginal = v.motivos[0];
  }
  return { error: 'No hay ningún día libre a esa hora entre un mes antes y el evento.' };
}

// ---------- Recursos ----------
export function reservasFuturasDeRecurso(recursoId, ctx, ahoraWall) {
  return ctx.reservas.filter((r) => {
    if (!esActiva(r) || r.inicio < ahoraWall.slice(0, 10)) return false;
    return ocupacionDeReserva(r, ctx.servicios, ctx.recursos).some((o) => o.recursoId === recursoId);
  });
}

// ---------- .ics ----------
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDate = (wall) => wall.replace(/[-:]/g, '') + '00';
function fold(line) {
  // RFC 5545: líneas de hasta 75 octetos; continuación con un espacio.
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
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

export function generarICS(reserva, servicio, recursos, ahoraISO = new Date().toISOString()) {
  const dur = duracionTotal(servicio, recursos, reserva);
  const fin = addMinutesWall(reserva.inicio, dur);
  const lugar = reserva.lugar === 'Domicilio' ? `Domicilio: ${reserva.direccion} (${reserva.km} km)` : 'Estudio';
  const stamp = ahoraISO.replace(/[-:]/g, '').replace(/\.\d+/, '');
  const desc = [
    `Servicio: ${servicio.nombre}`,
    `Novia: ${reserva.novia.nombre} <${reserva.novia.email}>`,
    `Acompañantes: ${reserva.acompanantes}`,
    `Pestañas postizas: ${reserva.postizas ? 'sí' : 'no'}`,
    `Estado: ${reserva.estado}`,
    `Total: ${formatUYU(reserva.total)} · Seña: ${formatUYU(reserva.sena)} · Saldo: ${formatUYU(reserva.saldo)}`,
  ].join('\n');
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
    `STATUS:${reserva.estado === 'Cancelada' ? 'CANCELLED' : reserva.estado === 'Retenida' ? 'TENTATIVE' : 'CONFIRMED'}`,
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
 * Ejecuta el caso del briefing sobre una copia aislada del catálogo: no lee ni
 * escribe las reservas guardadas. Devuelve los pasos con lo esperado y lo observado.
 */
export function ejecutarPruebaGuiada(recursosBase, serviciosBase, fecha) {
  const recursos = structuredClone(recursosBase);
  const servicios = structuredClone(serviciosBase);
  const reservas = [];
  const ctx = { reservas, servicios, recursos };
  const nombreDe = (id) => recursos.find((r) => r.id === id)?.nombre || id;
  const franja = (reserva, recursoId) => {
    const o = ocupacionDeReserva(reserva, servicios, recursos).find((x) => x.recursoId === recursoId);
    return o ? `${hhmm(Math.round((o.inicio % 86400000) / 60000))}–${hhmm(Math.round((o.fin % 86400000) / 60000))}` : '—';
  };
  const mk = (id, servicioId, hora, extra = {}) => ({ id, servicioId, inicio: `${fecha}T${hora}`, lugar: 'Estudio', km: 0, acompanantes: 0, postizas: false, estado: 'Confirmada', novia: { nombre: id, email: `${id}@demo.test` }, ...extra });

  const boda = mk('guiada-boda', 's-boda', '08:00');
  const pasos = [];
  const v0 = verificarDisponibilidad(boda, ctx);
  if (v0.ok) reservas.push(boda);
  pasos.push({ paso: 'Novia · Día de boda a las 08:00 en el estudio', esperado: 'Se acepta', observado: v0.ok ? 'Se acepta' : 'Se rechaza: ' + v0.motivos[0], ok: v0.ok });
  pasos.push({ paso: `Ocupación de ${nombreDe('r-maquilladora')}`, esperado: '08:00–10:45', observado: franja(boda, 'r-maquilladora') });
  pasos.push({ paso: `Ocupación de ${nombreDe('r-asistente')}`, esperado: '10:45–12:15', observado: franja(boda, 'r-asistente') });
  const tarea = mk('guiada-retoque', 's-retoque', '11:00', { lugar: 'Domicilio', km: 5, direccion: 'Demo' });
  const v1 = verificarDisponibilidad(tarea, ctx);
  pasos.push({ paso: 'Tarea a las 11:00 que solo necesita a la maquilladora (Retoque y fotos)', esperado: 'Se acepta (la asistente ocupada no la bloquea)', observado: v1.ok ? 'Se acepta (la asistente ocupada no la bloquea)' : 'Se rechaza: ' + v1.motivos.join(' ') });
  const contraste = mk('guiada-peinado', 's-peinado', '11:00', { lugar: 'Domicilio', km: 5, direccion: 'Demo' });
  const v2 = verificarDisponibilidad(contraste, ctx);
  pasos.push({ paso: 'Contraste: Peinado de novia a las 11:00 (necesita a la asistente)', esperado: 'Se rechaza por la asistente', observado: v2.ok ? 'Se acepta' : 'Se rechaza: ' + v2.motivos[0] });
  for (const p of pasos) if (p.ok === undefined) p.ok = p.observado === p.esperado || (p.esperado.startsWith('Se rechaza') && p.observado.startsWith('Se rechaza'));
  return { fecha, pasos, ok: pasos.every((p) => p.ok) };
}

// ---------- Compartir (solo texto; lo envía la persona a mano) ----------
export function textoCompartir(reserva, servicio, ahoraMs) {
  const lugar = reserva.lugar === 'Domicilio' ? `${reserva.direccion} (${reserva.km} km)` : 'Estudio';
  const lineas = [
    `Reserva N.º ${numeroReserva(reserva)} · ${servicio?.nombre || 'Servicio'}`,
    `Novia: ${reserva.novia.nombre}`,
    `Fecha: ${fechaLarga(dayKey(reserva.inicio))}, ${timeOf(reserva.inicio)} h (hora de Montevideo)`,
    `Lugar: ${lugar}`,
    `Acompañantes: ${reserva.acompanantes} · Pestañas postizas: ${reserva.postizas ? 'sí' : 'no'}`,
    `Total: ${formatUYU(reserva.total)} · Seña (50 %): ${formatUYU(reserva.sena)} · Saldo: ${formatUYU(reserva.saldo)}`,
    `Estado: ${reserva.estado}`,
  ];
  if (reserva.estado === 'Retenida' && reserva.fechaRetencion) {
    const vence = new Date(Date.parse(reserva.fechaRetencion) + HORAS_RETENCION * 3600000);
    lineas.push(`La fecha queda retenida hasta el ${vence.toLocaleString('es-UY', { timeZone: ZONA_NEGOCIO, dateStyle: 'short', timeStyle: 'short' })} (hora de Montevideo) si no se registra la seña.`);
  }
  return lineas.join('\n');
}

export const numeroReserva = (r) => (r.numero ? String(r.numero).padStart(4, '0') : '—');

/** Asigna número correlativo a datos guardados antes de que existiera (sin guardar). */
export function normalizarCorrelativos(data) {
  if (Number.isInteger(data.contador)) return data;
  let n = 0;
  const reservas = data.reservas.map((r) => (r.numero ? (n = Math.max(n, r.numero), r) : { ...r, numero: ++n }));
  return { ...data, reservas, contador: Math.max(n, ...reservas.map((r) => r.numero)) };
}
