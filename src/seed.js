// Catálogo y datos sintéticos del briefing. Las fechas se calculan desde el día en que se
// abre la app (hora de Montevideo), así caen en el mes actual y los dos siguientes.
import {
  addDaysKey, calcularPrecio, dayKey, extrasDe, nowWall, TARIFAS_DEFECTO, verificarDisponibilidad, weekdayOfKey,
} from './domain.js';

export const VERSION_DATOS = 2;

export const RECURSOS_SEED = [
  { id: 'r-maquilladora', nombre: 'Maquilladora titular', tipo: 'Persona', principal: true, diasBloqueados: [] },
  { id: 'r-asistente', nombre: 'Asistente de ejemplo', tipo: 'Persona', principal: false, diasBloqueados: [] },
  { id: 'r-estudio', nombre: 'Estudio (un sillón)', tipo: 'Espacio', principal: false, diasBloqueados: [] },
];

// tramos: cada recurso con su propio intervalo dentro del servicio (minutos desde el inicio).
const t = (recursoId, offsetMin, duracionMin) => ({ recursoId, offsetMin, duracionMin });
export const SERVICIOS_SEED = [
  { id: 's-prueba', nombre: 'Prueba de maquillaje de novia', duracionMin: 90, precioUYU: 3500, admiteEstudio: true, admiteDomicilio: false, esPrueba: true,
    tramos: [t('r-maquilladora', 0, 90), t('r-estudio', 0, 90)] },
  { id: 's-novia-estudio', nombre: 'Maquillaje de novia en estudio', duracionMin: 90, precioUYU: 9000, admiteEstudio: true, admiteDomicilio: false, esNovia: true,
    tramos: [t('r-maquilladora', 0, 90), t('r-estudio', 0, 90)] },
  { id: 's-novia-domicilio', nombre: 'Maquillaje de novia a domicilio', duracionMin: 90, precioUYU: 9000, admiteEstudio: false, admiteDomicilio: true, esNovia: true, trasladoMin: 60,
    tramos: [t('r-maquilladora', 0, 90)] },
  { id: 's-acompanante', nombre: 'Acompañante (madre, madrina o amiga)', duracionMin: 45, precioUYU: 2800, extra: 'acompanante', admiteEstudio: true, admiteDomicilio: true, tramos: [] },
  { id: 's-pestanas', nombre: 'Pestañas postizas', duracionMin: 15, precioUYU: 900, extra: 'pestanas', admiteEstudio: true, admiteDomicilio: true, tramos: [] },
  { id: 's-retoque', nombre: 'Retoque antes de salir a la ceremonia', duracionMin: 30, precioUYU: 1500, admiteEstudio: true, admiteDomicilio: true,
    tramos: [t('r-maquilladora', 0, 30)] },
].map((s) => ({ ...s, recursosIds: [...new Set(s.tramos.map((x) => x.recursoId))] }));

export function crearSeed(instant = new Date()) {
  const ahora = nowWall(instant);
  const hoy = dayKey(ahora);
  const ms = instant.getTime();
  const haceHoras = (h) => new Date(ms - h * 3600000).toISOString();
  const recursos = structuredClone(RECURSOS_SEED);
  const servicios = structuredClone(SERVICIOS_SEED);
  const tarifas = { ...TARIFAS_DEFECTO };
  const ex = extrasDe(servicios, tarifas);

  // Sábado Completo: el primer sábado con al menos 4 días de margen.
  let sab = addDaysKey(hoy, 4);
  while (weekdayOfKey(sab) !== 6) sab = addDaysKey(sab, 1);
  const usados = new Set([sab]);
  const dia = (offset) => {
    let k = addDaysKey(hoy, offset);
    while (usados.has(k) || weekdayOfKey(k) === 1) k = addDaysKey(k, 1);
    usados.add(k);
    return k;
  };
  const pasado = (offset) => {
    let k = addDaysKey(hoy, -offset);
    while (usados.has(k) || weekdayOfKey(k) === 1) k = addDaysKey(k, -1);
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
    ['Romina Suárez', 'romina.suarez@example.com'], ['Natalia Benítez', 'nati.benitez@example.com'],
  ];
  const reservas = [];
  const ctx = { reservas, servicios, recursos };
  const mk = (servicioId, inicio, estado, extra = {}) => {
    const [nombre, email] = novias[reservas.length % novias.length];
    const s = servicios.find((x) => x.id === servicioId);
    const { fechaRetencion: fr, senaRetenida: sr, ...resto } = extra;
    const base = { lugar: s.admiteEstudio === false ? 'Domicilio' : 'Estudio', direccion: '', km: 0, acompanantes: 0, postizas: false, ...resto };
    const p = calcularPrecio({ servicio: s, ...base }, ex.tarifas);
    const numero = reservas.length + 1;
    const r = {
      id: `res-${String(numero).padStart(2, '0')}`, numero, servicioId, inicio, ...base, novia: { nombre, email },
      total: p.total, sena: p.sena, saldo: p.saldo, estado, pagoFueraPlazo: false,
      fechaRetencion: estado === 'Consulta' ? null : (fr || haceHoras(24 * 6)),
      acompanantesCon: null, historial: [],
    };
    // Asignación de acompañantes como lo hace la app al retener la fecha.
    if (inicio && estado !== 'Consulta' && estado !== 'Cancelada') {
      r.acompanantesCon = verificarDisponibilidad({ ...r }, ctx).acompanantesCon || null;
    }
    const h = (horas, de, a, motivo) => r.historial.push({ en: haceHoras(horas), de, a, motivo });
    h(24 * 7, null, 'Consulta', 'Consulta recibida por WhatsApp (datos de prueba)');
    if (estado !== 'Consulta') h(fr ? (ms - Date.parse(fr)) / 3600000 : 24 * 6, 'Consulta', 'Fecha retenida', 'Fecha retenida');
    if (['Señada', 'Saldo pagado', 'Realizada'].includes(estado) || sr) h(24 * 5, 'Fecha retenida', 'Señada', 'Seña registrada');
    if (['Saldo pagado', 'Realizada'].includes(estado)) h(24 * 3, 'Señada', 'Saldo pagado', 'Saldo registrado');
    if (estado === 'Realizada') h(12, 'Saldo pagado', 'Realizada', 'Marcar como realizada');
    if (estado === 'Cancelada') { r.senaRetenida = p.sena; h(24 * 2, 'Señada', 'Cancelada', 'Cancelar · seña no devuelta'); }
    reservas.push(r);
    return r;
  };

  // Sábado Completo: a la maquilladora no le queda ningún hueco de 90 min (y ya tiene 2 novias, el máximo).
  mk('s-novia-domicilio', `${sab}T08:15`, 'Señada', { direccion: 'Av. Brasil 2850, Pocitos', km: 4, acompanantes: 2, postizas: true });
  mk('s-novia-estudio', `${sab}T11:15`, 'Saldo pagado', { acompanantes: 1 });
  mk('s-prueba', `${sab}T14:00`, 'Señada');
  mk('s-prueba', `${sab}T16:45`, 'Señada');
  mk('s-retoque', `${sab}T19:00`, 'Señada', { lugar: 'Domicilio', direccion: 'Hotel Carrasco, Rambla República de México 6451', km: 14 });

  // Fechas retenidas: una a punto de vencer (~2 h) y la del caso de aceptación (30 km, 9:00, 2 acompañantes, pestañas).
  mk('s-novia-estudio', `${dia(9)}T10:00`, 'Fecha retenida', { fechaRetencion: haceHoras(46) });
  mk('s-novia-domicilio', `${dia(36)}T09:00`, 'Fecha retenida', { fechaRetencion: haceHoras(3), direccion: 'Camino Carrasco 7120, Carrasco', km: 30, acompanantes: 2, postizas: true });

  mk('s-novia-domicilio', `${dia(44)}T16:00`, 'Saldo pagado', { direccion: 'Bodega Bouza, Camino de la Redención 7658', km: 25 });
  mk('s-novia-estudio', `${dia(5)}T15:00`, 'Cancelada', { senaRetenida: true });

  // Consultas: anotadas sin fecha firme (no ocupan recursos).
  mk('s-novia-estudio', `${dia(58)}T10:00`, 'Consulta');
  mk('s-novia-domicilio', null, 'Consulta', { direccion: 'Ciudad de la Costa', km: 22, acompanantes: 1 });
  mk('s-prueba', `${dia(20)}T17:00`, 'Consulta');

  // Realizadas (ya pasaron).
  mk('s-novia-estudio', `${pasado(2)}T11:00`, 'Realizada', { acompanantes: 1 });
  mk('s-retoque', `${pasado(3)}T17:30`, 'Realizada');

  return { version: VERSION_DATOS, recursos, servicios, reservas, tarifas, contador: reservas.length, creado: instant.toISOString() };
}
