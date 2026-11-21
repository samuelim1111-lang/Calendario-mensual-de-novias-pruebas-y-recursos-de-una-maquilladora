import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accionesPermitidas, aplicarTransicion, calcularPrecio, estadoDia, generarICS, horariosDisponibles,
  ocupacionDeReserva, oneMonthBefore, proponerPrueba, validarReserva, vencerRetenidas, verificarDisponibilidad,
  nowWall, dayKey, reservasFuturasDeRecurso, extrasDe, ejecutarPruebaGuiada, textoCompartir, weekdayOfKey, TARIFAS_DEFECTO,
} from '../src/domain.js';
import { RECURSOS_SEED, SERVICIOS_SEED, crearSeed } from '../src/seed.js';

const recursos = structuredClone(RECURSOS_SEED);
const servicios = structuredClone(SERVICIOS_SEED);
const tarifas = extrasDe(servicios, TARIFAS_DEFECTO).tarifas;
const D = '2027-03-06'; // sábado
const hm = (ms) => new Date(ms).toISOString().slice(11, 16);
const res = (id, servicioId, hora, extra = {}) => {
  const s = servicios.find((x) => x.id === servicioId);
  return {
    id, servicioId, inicio: `${D}T${hora}`, lugar: s.admiteEstudio === false ? 'Domicilio' : 'Estudio', direccion: 'x', km: 5,
    acompanantes: 0, postizas: false, estado: 'Señada', novia: { nombre: id, email: `${id}@x.com` }, ...extra,
  };
};
const conAsignacion = (r, ctx) => ({ ...r, acompanantesCon: verificarDisponibilidad(r, ctx).acompanantesCon });
const franja = (r, recursoId, rs = recursos) => {
  const o = ocupacionDeReserva(r, servicios, rs).filter((x) => x.recursoId === recursoId);
  return o.length ? `${hm(Math.min(...o.map((x) => x.inicio)))}–${hm(Math.max(...o.map((x) => x.fin)))}` : '—';
};

test('Caso de aceptación: novia a domicilio 30 km, 9:00, 2 acompañantes y pestañas', () => {
  const s = servicios.find((x) => x.id === 's-novia-domicilio');
  const p = calcularPrecio({ servicio: s, lugar: 'Domicilio', km: 30, acompanantes: 2, postizas: true }, tarifas);
  assert.deepEqual([p.base, p.traslado, p.acomp, p.post, p.total, p.sena], [9000, 1800, 5600, 900, 17300, 8650]);
  const ctx = { reservas: [], servicios, recursos };
  const novia = conAsignacion(res('n', 's-novia-domicilio', '09:00', { km: 30, acompanantes: 2, postizas: true }), ctx);
  assert.equal(novia.acompanantesCon, 'r-asistente');
  assert.equal(franja(novia, 'r-maquilladora'), '08:00–10:45'); // 60 traslado + 90 novia + 15 pestañas
  assert.equal(franja(novia, 'r-asistente'), '10:45–12:15'); // 2 × 45 acompañantes
  assert.equal(franja(novia, 'r-estudio'), '—'); // a domicilio no se usa el estudio
});

test('Recursos con intervalos propios: tarea a las 11 que solo usa a la maquilladora no se bloquea por la asistente', () => {
  const ctx0 = { reservas: [], servicios, recursos };
  const novia = conAsignacion(res('n', 's-novia-domicilio', '09:00', { km: 30, acompanantes: 2, postizas: true }), ctx0);
  const ctx = { reservas: [novia], servicios, recursos };
  assert.equal(verificarDisponibilidad(res('t', 's-retoque', '11:00'), ctx).ok, true);
  const r1030 = verificarDisponibilidad(res('t', 's-retoque', '10:30'), ctx);
  assert.equal(r1030.ok, false);
  assert.match(r1030.motivos[0], /Maquilladora titular no está libre de 08:00 a 10:45/);
});

test('Límite: los intervalos que se tocan no chocan', () => {
  const ctx0 = { reservas: [], servicios, recursos };
  const novia = conAsignacion(res('n', 's-novia-domicilio', '09:00', { km: 30, acompanantes: 2, postizas: true }), ctx0);
  const ctx = { reservas: [novia], servicios, recursos };
  assert.equal(verificarDisponibilidad(res('t', 's-retoque', '10:45'), ctx).ok, true);
  assert.equal(verificarDisponibilidad(res('t', 's-retoque', '10:44'), ctx).ok, false);
  // Antes: un retoque 07:30–08:00 termina justo cuando empieza el traslado.
  assert.equal(verificarDisponibilidad(res('t', 's-retoque', '07:30'), ctx).ok, true);
  assert.equal(verificarDisponibilidad(res('t', 's-retoque', '07:31'), ctx).ok, false);
});

test('Acompañantes: con la asistente si está libre; si no, con la maquilladora sumando tiempo', () => {
  const ctx0 = { reservas: [], servicios, recursos };
  const novia1 = conAsignacion(res('n1', 's-novia-domicilio', '09:00', { km: 30, acompanantes: 2, postizas: true }), ctx0); // asistente 10:45–12:15
  const ctx = { reservas: [novia1], servicios, recursos };
  const b = verificarDisponibilidad(res('n2', 's-novia-estudio', '10:45', { acompanantes: 1 }), ctx);
  assert.equal(b.ok, true); assert.equal(b.acompanantesCon, 'r-asistente'); // su acompañante va 12:15–13:00
  const rb = structuredClone(recursos); rb[1].diasBloqueados = [D];
  const c = verificarDisponibilidad(res('n2', 's-novia-estudio', '10:45', { acompanantes: 1 }), { reservas: [novia1], servicios, recursos: rb });
  assert.equal(c.ok, true); assert.equal(c.acompanantesCon, 'r-maquilladora');
  const n2 = { ...res('n2', 's-novia-estudio', '10:45', { acompanantes: 1 }), acompanantesCon: c.acompanantesCon };
  assert.equal(franja(n2, 'r-maquilladora', rb), '10:45–13:00');
  assert.equal(franja(n2, 'r-estudio', rb), '10:45–13:00'); // en el estudio, la acompañante ocupa el sillón
});

test('Horario: martes a domingo de 7 a 20; lunes sin reservas', () => {
  const ctx = { reservas: [], servicios, recursos };
  const lunes = '2027-03-08';
  assert.equal(weekdayOfKey(lunes), 1);
  const v = verificarDisponibilidad({ ...res('x', 's-retoque', '10:00'), inicio: `${lunes}T10:00` }, ctx);
  assert.equal(v.ok, false); assert.match(v.motivos[0], /lunes/);
  assert.equal(estadoDia(lunes, ctx), 'Cerrado');
  assert.equal(horariosDisponibles({ ...res('x', 's-retoque', '10:00'), inicio: `${lunes}T10:00` }, ctx).length, 0);
  assert.equal(verificarDisponibilidad(res('x', 's-retoque', '07:00'), ctx).ok, true);
  const dom7 = verificarDisponibilidad(res('x', 's-novia-domicilio', '07:00'), ctx); // traslado desde las 6:00
  assert.equal(dom7.ok, false); assert.match(dom7.motivos[0], /Fuera del horario/);
  assert.equal(verificarDisponibilidad(res('x', 's-retoque', '19:30'), ctx).ok, true);
  assert.equal(verificarDisponibilidad(res('x', 's-retoque', '19:45'), ctx).ok, false);
});

test('Lugar: prueba solo en estudio, novia a domicilio solo a domicilio', () => {
  const ctx = { reservas: [], servicios, recursos };
  assert.match(verificarDisponibilidad(res('x', 's-prueba', '10:00', { lugar: 'Domicilio' }), ctx).motivos[0], /no se hace a domicilio/);
  assert.match(verificarDisponibilidad(res('x', 's-novia-domicilio', '10:00', { lugar: 'Estudio' }), ctx).motivos[0], /no se hace en el estudio/);
});

test('Cupo: no más de 2 novias por día', () => {
  const ctx = { reservas: [res('a', 's-novia-estudio', '08:00'), res('b', 's-novia-estudio', '12:00')], servicios, recursos };
  const v = verificarDisponibilidad(res('c', 's-novia-estudio', '16:00'), ctx);
  assert.equal(v.ok, false); assert.match(v.motivos[0], /no se toman más de 2 por día/);
  assert.equal(verificarDisponibilidad(res('p', 's-prueba', '16:00'), ctx).ok, true);
  const cancel = { reservas: [res('a', 's-novia-estudio', '08:00'), res('b', 's-novia-estudio', '12:00', { estado: 'Cancelada' })], servicios, recursos };
  assert.equal(verificarDisponibilidad(res('c', 's-novia-estudio', '16:00'), cancel).ok, true);
});

test('Cupo diario: Libre si la maquilladora no tiene nada, Parcial si le queda un hueco de 90, Completo si no', () => {
  const ctx = (rs) => ({ reservas: rs, servicios, recursos });
  assert.equal(estadoDia(D, ctx([])), 'Libre');
  const r = [res('a', 's-retoque', '07:00'), res('b', 's-prueba', '08:30'), res('c', 's-prueba', '11:00'), res('d', 's-prueba', '13:30'), res('e', 's-prueba', '16:00')];
  assert.equal(estadoDia(D, ctx(r)), 'Parcial'); // queda 17:30–20:00
  assert.equal(estadoDia(D, ctx([...r, res('f', 's-prueba', '18:15')])), 'Completo'); // 45 y 15
  assert.equal(estadoDia(D, ctx([...r, res('f', 's-retoque', '18:59')])), 'Completo'); // 89 y 31: 89 no alcanza
  assert.equal(estadoDia(D, ctx([...r, res('f', 's-retoque', '19:00')])), 'Parcial'); // 90 justo
});

test('Consulta no ocupa recursos; Fecha retenida vence a las 48 h y libera', () => {
  const t0 = Date.parse('2027-03-01T12:00:00Z');
  const consulta = res('c', 's-novia-estudio', '10:00', { estado: 'Consulta' });
  assert.equal(verificarDisponibilidad(res('n', 's-novia-estudio', '10:00'), { reservas: [consulta], servicios, recursos }).ok, true);
  const r = res('r', 's-novia-estudio', '10:00', { estado: 'Fecha retenida', fechaRetencion: new Date(t0).toISOString() });
  assert.equal(vencerRetenidas([r], t0 + 47.9 * 3600000).cambios, 0);
  const { reservas, cambios } = vencerRetenidas([r], t0 + 48 * 3600000);
  assert.equal(cambios, 1); assert.equal(reservas[0].estado, 'Cancelada');
  assert.equal(verificarDisponibilidad(res('n', 's-novia-estudio', '10:00'), { reservas, servicios, recursos }).ok, true);
});

test('Estados: retener desde consulta, seña, saldo con plazo, realizada y cancelación con seña retenida', () => {
  const ctx = { reservas: [], servicios, recursos };
  const c = res('c', 's-novia-domicilio', '09:00', { estado: 'Consulta', acompanantes: 2, km: 30, total: 16400, sena: 8200, saldo: 8200 });
  const ret = aplicarTransicion(c, 'retener', '2027-01-01T00:00', '2027-01-01T03:00:00.000Z', { ctx });
  assert.equal(ret.estado, 'Fecha retenida'); assert.equal(ret.acompanantesCon, 'r-asistente'); assert.ok(ret.fechaRetencion);
  const sen = aplicarTransicion(ret, 'sena', '2027-01-01T00:00', 'x');
  assert.equal(sen.estado, 'Señada');
  assert.equal(aplicarTransicion(sen, 'saldo', '2027-03-05T23:59', 'x').estado, 'Saldo pagado');
  assert.throws(() => aplicarTransicion(sen, 'saldo', '2027-03-06T00:00', 'x'), /Pago fuera de plazo/);
  const fp = aplicarTransicion(sen, 'saldo', '2027-03-07T10:00', 'x', { pagoFueraPlazo: true });
  assert.equal(fp.pagoFueraPlazo, true);
  assert.ok(!accionesPermitidas(fp, '2027-03-06T08:59').some((a) => a.id === 'realizada'));
  assert.equal(aplicarTransicion(fp, 'realizada', '2027-03-06T09:00', 'x').estado, 'Realizada');
  const can = aplicarTransicion(sen, 'cancelar', '2027-01-02T00:00', 'x');
  assert.equal(can.estado, 'Cancelada'); assert.equal(can.senaRetenida, sen.sena);
  assert.match(can.historial.at(-1).motivo, /no devuelta/);
  assert.deepEqual(accionesPermitidas(can, 'x'), []);
  const ocupado = { reservas: [res('o', 's-novia-estudio', '09:00')], servicios, recursos };
  assert.throws(() => aplicarTransicion(res('c2', 's-retoque', '09:30', { estado: 'Consulta' }), 'retener', '2027-01-01T00:00', 'x', { ctx: ocupado }), /no está libre/);
});

test('Agendar prueba: misma hora un mes antes; si está ocupado o es lunes, siguiente día libre', () => {
  const boda = res('boda', 's-novia-estudio', '10:00');
  assert.equal(oneMonthBefore('2027-03-31T10:00'), '2027-02-28T10:00');
  const libre = proponerPrueba(boda, 's-prueba', { reservas: [boda], servicios, recursos }, '2027-01-01T00:00');
  assert.equal(libre.inicio, '2027-02-06T10:00'); assert.equal(libre.movida, false);
  const ocupa = { ...res('o', 's-retoque', '10:00'), inicio: '2027-02-06T10:00' };
  const movida = proponerPrueba(boda, 's-prueba', { reservas: [boda, ocupa], servicios, recursos }, '2027-01-01T00:00');
  assert.equal(movida.inicio, '2027-02-07T10:00'); assert.equal(movida.movida, true);
  const ocupa2 = { ...ocupa, id: 'o2', inicio: '2027-02-07T10:00' };
  const salta = proponerPrueba(boda, 's-prueba', { reservas: [boda, ocupa, ocupa2], servicios, recursos }, '2027-01-01T00:00');
  assert.equal(salta.inicio, '2027-02-09T10:00'); // el 8 es lunes
});

test('.ics con fecha, hora, lugar y servicio', () => {
  const r = { ...res('r1', 's-novia-domicilio', '09:00', { direccion: 'Av. Brasil 2850, Pocitos', km: 30, acompanantes: 2, postizas: true, acompanantesCon: 'r-asistente' }), total: 17300, sena: 8650, saldo: 8650 };
  const ics = generarICS(r, servicios, recursos, '2027-01-01T10:00:00.000Z');
  assert.match(ics, /DTSTART;TZID=America\/Montevideo:20270306T090000/);
  assert.match(ics, /DTEND;TZID=America\/Montevideo:20270306T121500/);
  assert.match(ics, /SUMMARY:Maquillaje de novia a domicilio · r1/);
  assert.match(ics, /LOCATION:Domicilio: Av. Brasil 2850\\, Pocitos \(30 km\)/);
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
});

test('Frases cortas', async () => {
  const { fraseVence, fraseSaldo, fraseDia, fraseHasta } = await import('../src/domain.js');
  assert.equal(fraseVence(20.5 * 3600000), 'vence en 20 h');
  assert.equal(fraseVence(35 * 60000), 'vence en 35 min');
  assert.equal(fraseDia('2027-08-14', 'Completo'), 'Sábado 14 completo');
  // Evento sábado 2027-03-06 → saldo hasta el viernes 5
  assert.equal(fraseSaldo({ inicio: '2027-03-06T09:00', saldo: 8650 }, '2027-03-02T10:00'), 'Saldo $ 8.650 hasta el viernes');
  assert.equal(fraseSaldo({ inicio: '2027-03-06T09:00', saldo: 8650 }, '2027-03-05T10:00'), 'Saldo $ 8.650 hasta hoy');
  assert.equal(fraseSaldo({ inicio: '2027-03-06T09:00', saldo: 8650 }, '2027-03-06T08:00'), 'Saldo $ 8.650 fuera de plazo');
  assert.equal(fraseHasta('2027-03-26', '2027-03-02'), 'hasta el viernes 26 de marzo');
});

test('Validación del formulario', () => {
  const ctx = { reservas: [], servicios, recursos };
  const ok = { nombre: 'Ana', email: 'ana@x.com', servicioId: 's-novia-domicilio', fecha: D, hora: '09:00', lugar: 'Domicilio', direccion: 'Calle 1', km: 30, acompanantes: 2, postizas: true };
  assert.deepEqual(validarReserva(ok, ctx, '2027-01-01T00:00'), {});
  const e = validarReserva({ ...ok, email: 'ana@', km: 61, acompanantes: 5, hora: '06:45' }, ctx, '2027-01-01T00:00');
  assert.ok(e.email && e.km && e.acompanantes && e.hora);
  assert.ok(validarReserva({ ...ok, fecha: '2027-03-08' }, ctx, '2027-01-01T00:00').fecha);
  assert.ok(validarReserva({ ...ok, servicioId: 's-retoque' }, ctx, '2027-01-01T00:00').acompanantes);
  assert.deepEqual(validarReserva({ ...ok, tipo: 'consulta', fecha: '', hora: '' }, ctx, '2027-01-01T00:00'), {});
});

test('Prueba guiada en copia aislada: resultados esperados y catálogo intacto', () => {
  const antes = JSON.stringify([RECURSOS_SEED, SERVICIOS_SEED]);
  const r = ejecutarPruebaGuiada(RECURSOS_SEED, SERVICIOS_SEED, TARIFAS_DEFECTO, D);
  assert.equal(r.ok, true, JSON.stringify(r.pasos, null, 1));
  assert.equal(JSON.stringify([RECURSOS_SEED, SERVICIOS_SEED]), antes);
});

test('Datos sintéticos: 3 recursos, 6 servicios, 14 reservas sin choques y estados del briefing', () => {
  const now = new Date();
  const seed = crearSeed(now);
  assert.equal(seed.recursos.length, 3); assert.equal(seed.servicios.length, 6); assert.equal(seed.reservas.length, 14);
  const c = (e) => seed.reservas.filter((r) => r.estado === e).length;
  assert.deepEqual([c('Fecha retenida'), c('Señada'), c('Saldo pagado'), c('Cancelada'), c('Consulta'), c('Realizada')], [2, 4, 2, 1, 3, 2]);
  for (const r of seed.reservas.filter((x) => ['Fecha retenida', 'Señada', 'Saldo pagado'].includes(x.estado))) {
    const v = verificarDisponibilidad(r, seed, { ignorarId: r.id });
    assert.ok(v.ok, `${r.id} ${r.inicio}: ${v.motivos.join(' | ')}`);
  }
  const dias = [...new Set(seed.reservas.filter((r) => r.inicio).map((r) => dayKey(r.inicio)))];
  const completos = dias.filter((k) => estadoDia(k, seed) === 'Completo');
  assert.equal(completos.length, 1); assert.equal(weekdayOfKey(completos[0]), 6);
  assert.ok(seed.reservas.every((r) => !r.inicio || weekdayOfKey(dayKey(r.inicio)) !== 1), 'ninguna reserva en lunes');
  assert.equal(vencerRetenidas(seed.reservas, now.getTime()).cambios, 0);
  assert.equal(vencerRetenidas(seed.reservas, now.getTime() + 2.1 * 3600000).cambios, 1);
  assert.ok(reservasFuturasDeRecurso('r-maquilladora', seed, nowWall(now)).length > 0);
  // Coherencia de los registros no enumerados: cada prueba es de su novia y es antes de su boda;
  // cada retoque es el mismo día y de la misma novia que un servicio de novia.
  for (const p of seed.reservas.filter((r) => r.pruebaDe)) {
    const boda = seed.reservas.find((r) => r.id === p.pruebaDe);
    assert.ok(boda, `${p.id} apunta a una boda que existe`);
    assert.equal(p.novia.email, boda.novia.email);
    assert.ok(!p.inicio || !boda.inicio || p.inicio < boda.inicio, `${p.id} es antes de la boda`);
  }
  assert.equal(seed.reservas.filter((r) => r.servicioId === 's-prueba' && !r.pruebaDe).length, 0, 'toda prueba tiene su boda');
  for (const t of seed.reservas.filter((r) => r.servicioId === 's-retoque')) {
    const n = seed.reservas.find((r) => r.novia.email === t.novia.email && seed.servicios.find((s) => s.id === r.servicioId)?.esNovia);
    assert.ok(n && dayKey(n.inicio) === dayKey(t.inicio) && n.inicio < t.inicio, `${t.id}: retoque después de la novia, el mismo día`);
  }
  assert.ok(!seed.reservas.some((r) => /Valentina/.test(r.novia.nombre)));
  const aceptacion = seed.reservas.find((r) => r.km === 30);
  assert.deepEqual([aceptacion.total, aceptacion.sena], [17300, 8650]);
  assert.match(textoCompartir(aceptacion, seed.servicios.find((s) => s.id === aceptacion.servicioId)), /Total: \$ 17\.300 · Seña \(50 %\): \$ 8\.650/);
});
