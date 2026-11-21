// Datos sintéticos. Las fechas se calculan desde el día en que se abre la app
// (hora de Montevideo), así siempre caen en el mes actual y los dos siguientes.
import {
  addDaysKey, calcularPrecio, dayKey, nowWall, proponerPrueba, TARIFAS_DEFECTO, weekdayOfKey,
} from './domain.js';

export const RECURSOS_SEED = [
  { id: 'r-maquilladora', nombre: 'Valentina · Maquilladora', tipo: 'Persona', principal: true, diasBloqueados: [] },
  { id: 'r-asistente', nombre: 'Lucía · Asistente', tipo: 'Persona', principal: false, diasBloqueados: [] },
  { id: 'r-estudio', nombre: 'Estudio Pocitos', tipo: 'Espacio', principal: false, diasBloqueados: [] },
  { id: 'r-aerografo', nombre: 'Kit de aerógrafo', tipo: 'Equipo', principal: false, diasBloqueados: [] },
];

// tramos: cada recurso con su propio intervalo dentro del servicio (minutos desde el inicio).
const t = (recursoId, offsetMin, duracionMin) => ({ recursoId, offsetMin, duracionMin });
export const SERVICIOS_SEED = [
  { id: 's-boda', nombre: 'Novia · Día de boda', duracionMin: 255, precioUYU: 18000, admiteDomicilio: true,
    tramos: [t('r-maquilladora', 0, 165), t('r-asistente', 165, 90), t('r-estudio', 0, 255)] },
  { id: 's-civil', nombre: 'Novia · Civil', duracionMin: 120, precioUYU: 11000, admiteDomicilio: true,
    tramos: [t('r-maquilladora', 0, 120), t('r-estudio', 0, 120), t('r-aerografo', 0, 60)] },
  { id: 's-prueba', nombre: 'Prueba de maquillaje', duracionMin: 90, precioUYU: 4500, admiteDomicilio: false, esPrueba: true,
    tramos: [t('r-maquilladora', 0, 90), t('r-estudio', 0, 90), t('r-aerografo', 0, 90)] },
  { id: 's-peinado', nombre: 'Peinado de novia', duracionMin: 90, precioUYU: 7000, admiteDomicilio: true,
    tramos: [t('r-asistente', 0, 90), t('r-estudio', 0, 90)] },
  { id: 's-social', nombre: 'Maquillaje social', duracionMin: 60, precioUYU: 3500, admiteDomicilio: false,
    tramos: [t('r-maquilladora', 0, 60), t('r-estudio', 0, 60)] },
  { id: 's-retoque', nombre: 'Retoque y fotos', duracionMin: 120, precioUYU: 6500, admiteDomicilio: true,
    tramos: [t('r-maquilladora', 0, 120)] },
].map((s) => ({ ...s, recursosIds: [...new Set(s.tramos.map((x) => x.recursoId))] }));

export function crearSeed(instant = new Date()) {
  const ahora = nowWall(instant);
  const hoy = dayKey(ahora);
  const ms = instant.getTime();
  const haceHoras = (h) => new Date(ms - h * 3600000).toISOString();
  const recursos = structuredClone(RECURSOS_SEED);
  const servicios = structuredClone(SERVICIOS_SEED);
  const tarifas = { ...TARIFAS_DEFECTO };

  // Sábado Completo: el primer sábado con al menos 4 días de margen.
  let sab = addDaysKey(hoy, 4);
  while (weekdayOfKey(sab) !== 6) sab = addDaysKey(sab, 1);
  const bloqueado = addDaysKey(hoy, 12);
  recursos[0].diasBloqueados = [bloqueado];

  const usados = new Set([sab, bloqueado]);
  const dia = (offset) => {
    let k = addDaysKey(hoy, offset);
    while (usados.has(k) || weekdayOfKey(k) === 0) k = addDaysKey(k, 1);
    usados.add(k);
    return k;
  };

  const novias = [
    ['Camila Rodríguez', 'camila.rodriguez@example.com'], ['Sofía Martínez', 'sofia.martinez@example.com'],
    ['Agustina Pereira', 'agustina.pereira@example.com'], ['Martina Fernández', 'martina.f@example.com'],
    ['Lucía Silva', 'lucia.silva@example.com'], ['Florencia Núñez', 'flor.nunez@example.com'],
    ['Valeria Sosa', 'valeria.sosa@example.com'], ['Micaela Gómez', 'mica.gomez@example.com'],
    ['Julieta Castro', 'juli.castro@example.com'], ['Paula Acosta', 'paula.acosta@example.com'],
    ['Carolina Díaz', 'caro.diaz@example.com'], ['Antonella Ruiz', 'anto.ruiz@example.com'],
    ['Romina Suárez', 'romina.suarez@example.com'],
  ];
  let n = 0;
  const reservas = [];
  const mk = (servicioId, inicio, estado, extra = {}) => {
    const [nombre, email] = extra.novia ? [extra.novia.nombre, extra.novia.email] : novias[n++ % novias.length];
    const s = servicios.find((x) => x.id === servicioId);
    const base = { lugar: 'Estudio', direccion: '', km: 0, acompanantes: 0, postizas: false, ...extra };
    const p = calcularPrecio({ servicio: s, ...base }, tarifas);
    const r = {
      id: `res-${String(reservas.length + 1).padStart(2, '0')}`,
      servicioId, inicio, ...base, novia: { nombre, email },
      total: p.total, sena: p.sena, saldo: p.saldo, estado,
      pagoFueraPlazo: false, fechaRetencion: extra.fechaRetencion || haceHoras(24 * 6),
      historial: [{ en: extra.fechaRetencion || haceHoras(24 * 6), de: null, a: 'Retenida', motivo: 'Fecha retenida (datos de prueba)' }],
    };
    if (estado !== 'Retenida') r.historial.push({ en: haceHoras(24 * 5), de: 'Retenida', a: estado === 'Cancelada' ? 'Cancelada' : 'Confirmada', motivo: estado === 'Cancelada' ? 'Vencida: 48 h sin seña. Recursos liberados.' : 'Seña registrada' });
    if (estado === 'Saldo pagado') r.historial.push({ en: haceHoras(24 * 2), de: 'Confirmada', a: 'Saldo pagado', motivo: 'Saldo registrado' });
    reservas.push(r);
    return r;
  };

  // Sábado Completo. Caso guiado: boda a las 8:00 en estudio -> maquilladora 8:00–10:45,
  // asistente 10:45–12:15. El retoque de las 11:00 solo usa a la maquilladora y entra.
  mk('s-boda', `${sab}T08:00`, 'Confirmada');
  mk('s-retoque', `${sab}T11:00`, 'Confirmada', { lugar: 'Domicilio', direccion: 'Hotel Carrasco, Rambla República de México 6451', km: 14 });
  mk('s-civil', `${sab}T13:30`, 'Saldo pagado', { lugar: 'Domicilio', direccion: 'Av. Brasil 2850, Pocitos', km: 4, postizas: true });
  mk('s-civil', `${sab}T15:45`, 'Confirmada', { acompanantes: 0 });
  mk('s-civil', `${sab}T18:00`, 'Confirmada', { postizas: true });

  // Retenidas: una a punto de vencer (quedan ~2 h) y una recién retenida.
  mk('s-civil', `${dia(9)}T10:00`, 'Retenida', { fechaRetencion: haceHoras(46) });
  mk('s-boda', `${dia(36)}T09:00`, 'Retenida', { fechaRetencion: haceHoras(3), lugar: 'Domicilio', direccion: 'Camino Carrasco 7120, Carrasco', km: 18, acompanantes: 2, postizas: true });

  // Cancelada por vencimiento (retenida hace 60 h, nunca señó).
  mk('s-prueba', `${dia(5)}T15:00`, 'Cancelada', { fechaRetencion: haceHoras(60), canceladaPorVencimiento: true });

  // Ya realizada y cobrada (día anterior a hoy).
  mk('s-civil', `${addDaysKey(hoy, -2)}T11:00`, 'Saldo pagado');

  mk('s-social', `${dia(3)}T17:00`, 'Confirmada');
  mk('s-peinado', `${dia(21)}T10:30`, 'Confirmada', { acompanantes: 1 });
  const boda = mk('s-boda', `${dia(52)}T08:30`, 'Confirmada', { acompanantes: 1, postizas: true });
  mk('s-retoque', `${dia(44)}T16:00`, 'Confirmada', { lugar: 'Domicilio', direccion: 'Bodega Bouza, Camino de la Redención 7658', km: 25 });

  // Prueba de la boda de dentro de ~2 meses, propuesta con la regla «un mes antes».
  const ctx = { reservas, servicios, recursos };
  const prop = proponerPrueba(boda, 's-prueba', ctx, ahora);
  if (prop.inicio) {
    usados.add(dayKey(prop.inicio));
    mk('s-prueba', prop.inicio, 'Confirmada', { novia: boda.novia, pruebaDe: boda.id });
  }

  return { version: 1, recursos, servicios, reservas, tarifas, creado: instant.toISOString() };
}
