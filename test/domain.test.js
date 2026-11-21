import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accionesPermitidas, aplicarTransicion, calcularPrecio, estadoDia, generarICS, horariosDisponibles,
  ocupacionDeReserva, oneMonthBefore, proponerPrueba, validarReserva, vencerRetenidas, verificarDisponibilidad,
  nowWall, dayKey, reservasFuturasDeRecurso, TARIFAS_DEFECTO,
} from '../src/domain.js';
import { RECURSOS_SEED, SERVICIOS_SEED, crearSeed } from '../src/seed.js';

const recursos = structuredClone(RECURSOS_SEED);
const servicios = structuredClone(SERVICIOS_SEED);
const D = '2027-03-06'; // sábado
const hm = (ms) => new Date(ms).toISOString().slice(11, 16);
const res = (id, servicioId, hora, extra = {}) => ({
  id, servicioId, inicio: `${D}T${hora}`, lugar: 'Estudio', km: 0, acompanantes: 0, postizas: false,
  estado: 'Confirmada', novia: { nombre: id, email: `${id}@x.com` }, ...extra,
});

test('Recursos con intervalos propios: caso guiado del briefing', () => {
  const boda = res('boda', 's-boda', '08:00');
  const occ = Object.fromEntries(ocupacionDeReserva(boda, servicios, recursos).map((o) => [o.recursoId, `${hm(o.inicio)}–${hm(o.fin)}`]));
  assert.equal(occ['r-maquilladora'], '08:00–10:45');
  assert.equal(occ['r-asistente'], '10:45–12:15');
  assert.equal(occ['r-estudio'], '08:00–12:15');

  const ctx = { reservas: [boda], servicios, recursos };
  // Tarea a las 11:00 que solo usa a la maquilladora: NO se bloquea por la asistente.
  const soloMaq = verificarDisponibilidad(res('t11', 's-retoque', '11:00', { lugar: 'Domicilio', km: 5, direccion: 'x' }), ctx);
  assert.equal(soloMaq.ok, true, soloMaq.motivos.join(' | '));
  // Una que necesita a la asistente a las 11:00 sí se rechaza, con motivo.
  const peinado = verificarDisponibilidad(res('p11', 's-peinado', '11:00', { lugar: 'Domicilio', km: 5, direccion: 'x' }), ctx);
  assert.equal(peinado.ok, false);
  assert.match(peinado.motivos[0], /Lucía · Asistente no está libre de 10:45 a 12:15/);
  // La maquilladora a las 10:00 está ocupada.
  const maq10 = verificarDisponibilidad(res('m10', 's-retoque', '10:00'), ctx);
  assert.equal(maq10.ok, false);
  assert.match(maq10.motivos[0], /Valentina · Maquilladora no está libre de 08:00 a 10:45/);
});

test('Canceladas no ocupan; días bloqueados y horario se respetan', () => {
  const boda = res('boda', 's-boda', '08:00', { estado: 'Cancelada' });
  assert.equal(verificarDisponibilidad(res('x', 's-social', '09:00'), { reservas: [boda], servicios, recursos }).ok, true);
  const rb = structuredClone(recursos); rb[0].diasBloqueados = [D];
  const v = verificarDisponibilidad(res('x', 's-social', '09:00'), { reservas: [], servicios, recursos: rb });
  assert.equal(v.ok, false); assert.match(v.motivos[0], /bloqueado/);
  const tarde = verificarDisponibilidad(res('x', 's-boda', '17:00'), { reservas: [], servicios, recursos });
  assert.equal(tarde.ok, false); assert.match(tarde.motivos[0], /Fuera del horario/);
  assert.equal(horariosDisponibles({ servicioId: 's-social', inicio: `${D}T08:00`, lugar: 'Estudio', acompanantes: 0 }, { reservas: [], servicios, recursos: rb }).length, 0);
});

test('Equipos: ocupación propia, viajan a domicilio y solo bloquean a quien los usa', () => {
  const prueba = res('pr', 's-prueba', '10:00');
  const by = Object.fromEntries(ocupacionDeReserva(prueba, servicios, recursos).map((o) => [o.recursoId, `${hm(o.inicio)}–${hm(o.fin)}`]));
  assert.equal(by['r-aerografo'], '10:00–11:30');
  // A domicilio el estudio no se ocupa, pero el aerógrafo sí viaja.
  const dom = ocupacionDeReserva(res('c', 's-civil', '09:00', { lugar: 'Domicilio', km: 5 }), servicios, recursos).map((o) => o.recursoId);
  assert.deepEqual(dom.sort(), ['r-aerografo', 'r-maquilladora']);
  // Servicio de la asistente con aerógrafo: el equipo ocupado lo bloquea; sin solapar, entra.
  const sv = [...servicios, { id: 's-aero', nombre: 'Aerógrafo asistente', duracionMin: 60, precioUYU: 1, admiteDomicilio: true, tramos: [{ recursoId: 'r-asistente', offsetMin: 0, duracionMin: 60 }, { recursoId: 'r-aerografo', offsetMin: 0, duracionMin: 60 }] }];
  const ctx = { reservas: [prueba], servicios: sv, recursos };
  const choca = verificarDisponibilidad(res('a', 's-aero', '10:30', { lugar: 'Domicilio', km: 3 }), ctx);
  assert.equal(choca.ok, false);
  assert.match(choca.motivos.join(' '), /Kit de aerógrafo no está libre de 10:00 a 11:30/);
  assert.ok(!choca.motivos.join(' ').includes('Asistente'));
  assert.equal(verificarDisponibilidad(res('a', 's-aero', '11:30', { lugar: 'Domicilio', km: 3 }), ctx).ok, true);
  // Un retoque (solo maquilladora) a las 12:00 no se ve afectado por el equipo.
  assert.equal(verificarDisponibilidad(res('r', 's-retoque', '12:00', { lugar: 'Domicilio', km: 3 }), ctx).ok, true);
});

test('Acompañantes extienden a la asistente, no a la maquilladora', () => {
  const occ = ocupacionDeReserva(res('b', 's-boda', '08:00', { acompanantes: 2 }), servicios, recursos);
  const by = Object.fromEntries(occ.map((o) => [o.recursoId, `${hm(o.inicio)}–${hm(o.fin)}`]));
  assert.equal(by['r-maquilladora'], '08:00–10:45');
  assert.equal(by['r-asistente'], '10:45–13:35');
  assert.equal(by['r-estudio'], '08:00–13:35');
});

test('Día Completo cuando la maquilladora no tiene hueco del servicio más corto (60 min)', () => {
  const base = [res('a', 's-boda', '08:00'), res('b', 's-retoque', '11:00', { lugar: 'Domicilio', km: 3 }),
    res('c', 's-civil', '13:30', { lugar: 'Domicilio', km: 3 }), res('d', 's-civil', '15:45')];
  const ctx = (rs) => ({ reservas: rs, servicios, recursos });
  assert.equal(estadoDia(D, ctx([])), 'Libre');
  assert.equal(estadoDia(D, ctx(base)), 'Parcial'); // 17:45–20:00 libre
  const lleno = [...base, res('e', 's-civil', '18:00')];
  assert.equal(estadoDia(D, ctx(lleno)), 'Completo');
  // Filtrando por asistente, el mismo día no está completo.
  assert.equal(estadoDia(D, ctx(lleno), 'r-asistente'), 'Parcial');
  // Un hueco de 59 min no alcanza; uno de 60 sí.
  assert.equal(estadoDia(D, ctx([res('a', 's-civil', '08:00'), res('b', 's-civil', '10:59'), res('c', 's-boda', '12:59')])), 'Parcial');
});

test('Total = servicio + acompañantes + postizas + km; seña exactamente 50 %', () => {
  const s = servicios.find((x) => x.id === 's-boda');
  const p = calcularPrecio({ servicio: s, lugar: 'Domicilio', km: 15, acompanantes: 2, postizas: true }, TARIFAS_DEFECTO);
  assert.equal(p.total, 18000 + 2 * 2500 + 900 + 15 * 60);
  assert.equal(p.sena, p.total / 2);
  assert.equal(p.sena + p.saldo, p.total);
  const impar = calcularPrecio({ servicio: { precioUYU: 3501 }, lugar: 'Estudio', km: 30, acompanantes: 0, postizas: false });
  assert.equal(impar.total, 3501); assert.equal(impar.sena, 1750.5);
});

test('Retenida sin seña se cancela a las 48 h y libera recursos', () => {
  const t0 = Date.parse('2027-03-01T12:00:00Z');
  const r = res('r', 's-social', '09:00', { estado: 'Retenida', fechaRetencion: new Date(t0).toISOString() });
  assert.equal(vencerRetenidas([r], t0 + 47.9 * 3600000).cambios, 0);
  const { reservas, cambios } = vencerRetenidas([r], t0 + 48 * 3600000);
  assert.equal(cambios, 1); assert.equal(reservas[0].estado, 'Cancelada');
  assert.equal(verificarDisponibilidad(res('n', 's-social', '09:00'), { reservas, servicios, recursos }).ok, true);
});

test('Saldo pagado: no después del día anterior sin «Pago fuera de plazo»', () => {
  const r = res('r', 's-social', '09:00');
  assert.ok(aplicarTransicion(r, 'saldo', '2027-03-05T23:59', 'x').estado === 'Saldo pagado');
  assert.throws(() => aplicarTransicion(r, 'saldo', '2027-03-06T00:00', 'x'), /Pago fuera de plazo/);
  const ok = aplicarTransicion(r, 'saldo', '2027-03-07T10:00', 'x', { pagoFueraPlazo: true });
  assert.equal(ok.estado, 'Saldo pagado'); assert.equal(ok.pagoFueraPlazo, true);
  assert.throws(() => aplicarTransicion({ ...r, estado: 'Retenida' }, 'saldo', '2027-03-01T00:00', 'x'));
  assert.deepEqual(accionesPermitidas({ ...r, estado: 'Cancelada' }, 'x'), []);
});

test('Agendar prueba: misma hora un mes antes; si está ocupado, siguiente día libre', () => {
  const boda = res('boda', 's-boda', '08:30');
  assert.equal(oneMonthBefore('2027-03-31T10:00'), '2027-02-28T10:00');
  const libre = proponerPrueba(boda, 's-prueba', { reservas: [boda], servicios, recursos }, '2027-01-01T00:00');
  assert.equal(libre.inicio, '2027-02-06T08:30'); assert.equal(libre.movida, false);
  const ocupa = { ...res('o', 's-social', '09:00'), inicio: '2027-02-06T09:00' };
  const movida = proponerPrueba(boda, 's-prueba', { reservas: [boda, ocupa], servicios, recursos }, '2027-01-01T00:00');
  assert.equal(movida.inicio, '2027-02-07T08:30'); assert.equal(movida.movida, true);
  assert.ok(movida.motivoOriginal);
});

test('.ics con fecha, hora, lugar y servicio', () => {
  const r = { ...res('r1', 's-boda', '08:00', { lugar: 'Domicilio', direccion: 'Av. Brasil 2850, Pocitos', km: 4 }), total: 100, sena: 50, saldo: 50 };
  const ics = generarICS(r, servicios[0], recursos, '2027-01-01T10:00:00.000Z');
  assert.match(ics, /DTSTART;TZID=America\/Montevideo:20270306T080000/);
  assert.match(ics, /DTEND;TZID=America\/Montevideo:20270306T121500/);
  assert.match(ics, /SUMMARY:Novia · Día de boda · r1/);
  assert.match(ics, /LOCATION:Domicilio: Av. Brasil 2850\\, Pocitos \(4 km\)/);
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
});

test('Validación del formulario', () => {
  const ctx = { reservas: [], servicios, recursos };
  const ok = { nombre: 'Ana', email: 'ana@x.com', servicioId: 's-boda', fecha: D, hora: '08:00', lugar: 'Domicilio', direccion: 'Calle 1', km: 10, acompanantes: 0 };
  assert.deepEqual(validarReserva(ok, ctx, '2027-01-01T00:00'), {});
  const e = validarReserva({ ...ok, email: 'ana@', km: 61, acompanantes: 5, hora: '20:00' }, ctx, '2027-01-01T00:00');
  assert.ok(e.email && e.km && e.acompanantes && e.hora);
  assert.ok(validarReserva(ok, ctx, '2027-04-01T00:00').hora);
  assert.ok(validarReserva({ ...ok, servicioId: 's-social' }, ctx, '2027-01-01T00:00').lugar);
});

test('Datos sintéticos: 14 reservas sin choques, sábado Completo, estados pedidos', () => {
  const now = new Date();
  const seed = crearSeed(now);
  assert.equal(seed.recursos.length, 4); assert.equal(seed.servicios.length, 6); assert.equal(seed.reservas.length, 14);
  const c = (e) => seed.reservas.filter((r) => r.estado === e).length;
  assert.equal(c('Retenida'), 2); assert.equal(c('Cancelada'), 1); assert.equal(c('Saldo pagado'), 2);
  assert.ok(c('Confirmada') >= 4);
  for (const r of seed.reservas.filter((x) => x.estado !== 'Cancelada')) {
    const v = verificarDisponibilidad(r, seed, { ignorarId: r.id });
    assert.ok(v.ok, `${r.id} ${r.inicio}: ${v.motivos.join(' | ')}`);
  }
  const sabados = [...new Set(seed.reservas.map((r) => dayKey(r.inicio)))].filter((k) => estadoDia(k, seed) === 'Completo');
  assert.equal(sabados.length, 1);
  assert.equal(new Date(sabados[0] + 'T00:00Z').getUTCDay(), 6);
  const venc = vencerRetenidas(seed.reservas, now.getTime());
  assert.equal(venc.cambios, 0, 'ninguna retenida debería vencer al abrir');
  assert.equal(vencerRetenidas(seed.reservas, now.getTime() + 2.1 * 3600000).cambios, 1, 'una vence en ~2 h');
  assert.ok(reservasFuturasDeRecurso('r-maquilladora', seed, nowWall(now)).length > 0);
});
