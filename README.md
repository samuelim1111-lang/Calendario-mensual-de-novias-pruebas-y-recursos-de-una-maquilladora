# Agenda de novias · calendario, pruebas y recursos

**Previsualización:** https://agenda-maquilladora-novias.vercel.app
**Repositorio:** https://github.com/samuelim1111-lang/Calendario-mensual-de-novias-pruebas-y-recursos-de-una-maquilladora

Agenda mensual para una maquilladora de novias de Montevideo que trabaja en su estudio y a domicilio (hasta 60 km). React 19 + Tailwind CSS 4 + localStorage. Todo el build sale en **un solo `dist/index.html`** sin dependencias de CDN (solo las fuentes de Google).

## Datos y privacidad

- Todo se desarrolla y prueba con **datos sintéticos**: nombres inventados, emails `@example.com` y direcciones y lugares marcados como ficticios. No se carga información personal de terceros.
- La app usa el **alias del negocio** («Agenda de novias», «Maquilladora titular») y no contacta al cliente ni a nadie: no envía mensajes, emails ni datos fuera del navegador.
- Dudas de alcance: **partners@kodarvia.com** (nunca al cliente).
- Idioma de la interfaz y la documentación: español rioplatense (Argentina), con voseo.

## Cómo correrlo

```bash
npm install
npm test          # pruebas de dominio (node:test, sin dependencias extra)
npm run build     # genera dist/index.html
npm start         # build + servidor estático en http://localhost:3000
```

También se puede abrir `dist/index.html` directo con doble clic. `qa/e2e.mjs` tiene pruebas de punta a punta con Playwright (opcional).

## Identidad visual

Paleta: `#3A2E2E` (texto), `#FBF7F4` (fondo), `#D8B4A0` (rosa · señadas), `#B8935A` (oro · fechas retenidas), `#6E8B74` (salvia · libre y saldo pagado), `#B5474B` (rojo · Completo y errores), `#FFFFFF` (tarjetas). Los tonos -100/-700 de `src/styles.css` son variantes claras y oscuras de esos mismos colores para fondos suaves y texto con contraste AA. Tipografía: Cormorant Garamond (títulos) y Nunito Sans (texto).

## Tono y estilo

Delicado y prolijo, como una agenda de papel bueno: fondo claro, detalles nude y dorado suave (botones dorados en tono claro, hilo dorado bajo los títulos, «Completo» en rojo suave). Los estados **siempre se escriben**: chips, insignias del día y también las barras de la línea de horas («08:00–10:45 · Señada»). Frases cortas generadas por `fraseDia`, `fraseVence` y `fraseSaldo`:

- «Sábado 28 completo» (franja «Para atender» del calendario y detalle del día)
- «Fecha retenida, vence en 20 h» (calendario y detalle)
- «Saldo $ 8.650 hasta el viernes» (calendario, detalle y texto para compartir)

Los importes se muestran como «$ 8.650» (pesos uruguayos).

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/domain.js` | Reglas puras: ocupación por recurso, disponibilidad, cupo diario, estado del día, precios, estados, vencimiento, prueba, `.ics`, prueba guiada y texto para compartir. Sin React ni storage. |
| `src/seed.js` | Catálogo del briefing (3 recursos, 6 servicios) y 14 reservas de ejemplo. |
| `src/storage.js` | Lectura/escritura en localStorage con clave propia y manejo de errores. |
| `src/App.jsx` | Pantallas: Calendario, Nueva reserva, Detalle, Recursos, Servicios y tarifas, Ajustes. |
| `build.mjs` | esbuild + compilador de Tailwind → `dist/index.html`. |
| `test/domain.test.js` | 16 pruebas automatizadas. |

## Catálogo y configuración inicial

- **Horario de ejemplo**: martes a domingo de 07:00 a 20:00. **Lunes sin reservas** (el calendario lo marca «Cerrado»). Todo lo que ocupa una reserva —incluido el traslado— tiene que caber en ese horario.
- **Recursos (3)**: Maquilladora titular (persona, principal), Asistente de ejemplo (persona) y Estudio (espacio, un solo sillón). Se pueden agregar más, incluso de tipo Equipo.
- **Servicios (6)**, precios en UYU:

| Servicio | Duración | Precio | Usa | Lugar |
|---|---|---|---|---|
| Prueba de maquillaje de novia | 90 min | 3.500 | maquilladora + estudio | solo estudio |
| Maquillaje de novia en estudio | 90 min | 9.000 | maquilladora + estudio | solo estudio |
| Maquillaje de novia a domicilio | 90 min + 60 de traslado bloqueados antes | 9.000 + 60/km | maquilladora | solo domicilio |
| Acompañante (madre, madrina o amiga) | 45 min por persona | 2.800 | a continuación de la novia: asistente si está libre; si no, maquilladora sumando tiempo | con la novia |
| Pestañas postizas | 15 min | 900 | se suman al tramo de la maquilladora en el servicio de novia | con la novia |
| Retoque antes de salir a la ceremonia | 30 min | 1.500 | maquilladora | estudio o domicilio |

Acompañantes y pestañas solo se agregan a un servicio de novia. Su precio y duración salen del catálogo, así que se editan en «Servicios y tarifas». La tarifa de traslado por km (60) también.

## Datos sintéticos

Al abrir por primera vez (si no existe la clave propia, o si tiene datos de una versión anterior) se llama a `crearSeed(new Date())`. Las fechas se calculan desde **hoy en hora de Montevideo** (mes actual y los dos siguientes) y nunca caen en lunes:

- **Sábado Completo**: el primer sábado con ≥ 4 días de margen. Tiene 2 novias (el máximo), 2 pruebas y un retoque; a la maquilladora no le queda ningún hueco de 90 min.
- **2 fechas retenidas**: una retenida hace 46 h (vence ~2 h después de abrir) y la del **caso de aceptación** (novia a domicilio a 30 km a las 9:00 con 2 acompañantes y pestañas).
- **4 señadas**, **2 con saldo pagado**, **1 cancelada** (con la seña retenida anotada), **3 consultas** (una sin fecha) y **2 realizadas** (en los días anteriores a hoy; si hoy es principio de mes, caen en el mes anterior).

Los registros que el encargo no enumera están completados de forma coherente: las dos pruebas del sábado son de las novias que se casan semanas después (`pruebaDe`, misma novia), la consulta con prueba tentativa apunta a su boda, y cada retoque es de la novia de ese mismo día, después de su maquillaje. Los nombres, emails (`example.com`), direcciones y salones son ficticios. La marca es «Agenda de novias»; la persona es la «Maquilladora titular» del catálogo.

Para reemplazarlos, editá `RECURSOS_SEED`, `SERVICIOS_SEED` y las llamadas `mk(...)` en `src/seed.js`, y restaurá desde Ajustes.

## Almacenamiento

- Clave única: **`kodarvia.agenda-maquilladora.v1`** (JSON con `version: 4`, `recursos`, `servicios`, `reservas`, `tarifas`, `contador`).
- «Restaurar datos de prueba» reescribe **solo esa clave**; no toca otras aplicaciones.
- **Cada acción guarda el conjunto completo de datos de la demo** (una sola escritura del JSON). El cambio se aplica en pantalla **solo si esa escritura funcionó**.
- Si `setItem` falla (cuota llena, modo privado, bloqueo): no se aplica nada, no se muestra éxito, no se ocupan recursos ni avanza el correlativo. Aparece *«No se pudo guardar… El cambio no se aplicó»* y el formulario conserva el borrador (también si vas a otra pantalla y volvés).
- **Cómo probar un guardado fallido**: Ajustes → activar «Simular fallo de guardado» → crear una reserva. Se ve el aviso, la URL no cambia, el borrador queda y `contador` y la cantidad de reservas no cambian. Desactivar la simulación, volver a «Nueva reserva» («Recuperamos tu borrador») y guardar: recibe el número siguiente.

## Demo, sincronización y compartir

- Es una **demo**: el formulario y la confirmación lo dicen. Guardar no contacta al negocio ni a la novia.
- Los datos viven solo en el navegador: **no hay cuentas, autenticación ni sincronización entre dispositivos**.
- Cada reserva tiene un **número correlativo** (`numero`, desde `contador`) que solo avanza si el guardado funcionó.
- **Compartir** prepara un texto (servicio, fecha y hora de Montevideo, lugar, total, seña, saldo, estado y vencimiento). Lo envía la persona a mano: «Copiar texto» siempre está, y «Compartir…» abre el menú del dispositivo si el navegador lo permite. Sin envíos automáticos ni API de mensajería.

## Reglas y pruebas

### Ids, relaciones y estados

- **Ids**: `r-…` recursos, `s-…` servicios, `res-…` reservas, más `numero` correlativo por reserva.
- **Relaciones**: `Reserva.servicioId → Servicio`; `Servicio.tramos[].recursoId → Recurso`; `Reserva.acompanantesCon → Recurso` (quién hace a las acompañantes, decidido al retener la fecha); `Reserva.pruebaDe → Reserva`. Un recurso no se da de baja si tiene reservas futuras o lo usa un servicio.
- **Estados**:

| Estado | Ocupa recursos | Sale hacia |
|---|---|---|
| Consulta | No (fecha opcional y tentativa) | Fecha retenida (verifica recursos), Cancelada |
| Fecha retenida | Sí, 48 h | Señada; Cancelada (sola a las 48 h sin seña, al abrir la app o cada 30 s) |
| Señada | Sí, sin vencimiento | Saldo pagado; Realizada (si ya pasó la fecha); Cancelada |
| Saldo pagado | Sí | Realizada (si ya pasó la fecha); Cancelada |
| Realizada | Sí (histórico) | — |
| Cancelada | No | — (si estaba señada, la seña no se devuelve y queda anotada en `senaRetenida`) |

El saldo se espera hasta el día anterior al evento: desde las 00:00 del día del evento, «Registrar saldo pagado» exige tildar **«Pago fuera de plazo»** (queda en `pagoFueraPlazo`).

### Modelo de datos

- **Reserva**: `id, numero, novia{nombre,email}, servicioId, inicio ("YYYY-MM-DDTHH:mm" hora de Montevideo, o null en una consulta), lugar (Estudio|Domicilio), direccion, km, acompanantes (0-4), postizas, acompanantesCon, total, sena, saldo, estado, pagoFueraPlazo, fechaRetencion (ISO UTC), senaRetenida?, pruebaDe?, historial[]`.
- **Recurso**: `id, nombre, tipo (Persona|Espacio|Equipo), diasBloqueados[], principal`.
- **Servicio**: `id, nombre, duracionMin, precioUYU (>0), recursosIds[], tramos[{recursoId, offsetMin, duracionMin}], admiteEstudio, admiteDomicilio, trasladoMin, esNovia, esPrueba, extra ('acompanante'|'pestanas')`.

### Regla «recursos con intervalos propios»

Un servicio **no** reserva a todo el equipo durante toda su duración. Cada recurso tiene su propio intervalo (`tramosEfectivos`), y `verificarDisponibilidad` compara **cada recurso solo contra los intervalos de ese mismo recurso** en reservas que ocupan. Los intervalos son semiabiertos `[inicio, fin)`: dos que se tocan no chocan.

Cómo se arma el intervalo de cada recurso en una reserva:
1. Los tramos del servicio. A domicilio, los espacios (estudio) se quitan.
2. **Pestañas**: +15 min al tramo de la maquilladora (lo que viene después se corre).
3. **Acompañantes**: 45 min × n **a continuación de la novia**. Se prueba con la asistente; si no está libre, con la maquilladora sumando tiempo; si ninguna, se rechaza con los motivos. En el estudio también ocupan el sillón.
4. **Traslado**: a domicilio, la maquilladora queda bloqueada 60 min **antes** de la hora de inicio.
5. Todo tiene que caber entre 07:00 y 20:00, fuera de lunes y de días bloqueados del recurso, y con **no más de 2 novias por día**.

Si algo choca, la reserva se rechaza con un motivo por recurso, p. ej. *«Maquilladora titular no está libre de 08:00 a 10:45 (…); esta reserva la necesita de 10:30 a 11:00.»*

### Cupo diario: Libre / Parcial / Completo

Cada recurso arranca el día con todo su horario libre (07:00–20:00) y baja con cada reserva que lo usa (`huecos`). Para la maquilladora:
- **Libre**: no tiene nada ese día.
- **Parcial**: le queda algún hueco de **90 min** (el servicio de novia más corto).
- **Completo**: no le queda ninguno (o el día está bloqueado).
- **Cerrado**: lunes.

Con el filtro de recurso, la misma regla se aplica al recurso elegido. El cupo de 2 novias se controla al reservar.

### Total, seña y saldo

`total = servicio + km × 60 (solo a domicilio) + acompañantes × 2.800 + pestañas 900`; `seña = total / 2` exacto; `saldo = total − seña`.

### Agendar prueba

Propone «Prueba de maquillaje de novia» en el estudio el **mismo día y hora un mes antes**. Si ya pasó, es lunes o algún recurso está ocupado, avanza día a día hasta el primero libre antes del evento y explica por qué se movió.

### Archivo .ics

`generarICS` arma un VCALENDAR (RFC 5545) con `VTIMEZONE America/Montevideo (UTC−3)`, `DTSTART/DTEND` con TZID (de la hora de inicio al fin de la novia, extras incluidos), `SUMMARY` = servicio · novia, `LOCATION` = Estudio o dirección + km, descripción con extras, traslado y montos, `STATUS` según el estado y líneas plegadas a 75 octetos. En la vista previa de claude.ai el visor no guarda `.ics`; ahí se copia o se guarda como `.ics.txt`. Fuera de claude.ai se descarga directo.

### Caso de aceptación / prueba guiada

Novia a domicilio a 30 km a las 9:00 con 2 acompañantes y pestañas:

| Paso | Resultado observado |
|---|---|
| Total | $ 9.000 + $ 1.800 + $ 5.600 + $ 900 = **$ 17.300**; seña **$ 8.650** |
| Maquilladora | **08:00–10:45** (60 traslado + 90 novia + 15 pestañas) |
| Asistente | **10:45–12:15** (2 acompañantes × 45) |
| Tarea a las 11:00 que solo usa a la maquilladora (retoque) | **Se acepta**: la asistente ocupada no la bloquea |
| Retoque a las 10:30 | **Se rechaza** por la maquilladora |
| Límite: retoque a las 10:45 / 10:44 | Entra a las 10:45; a las 10:44 se rechaza |

**En la app**: Ajustes → «Ejecutar prueba guiada». Corre sobre una **copia aislada** del catálogo inicial en un sábado sin reservas, muestra esperado vs. observado con ✓ y confirma que los datos guardados no cambiaron.

Pruebas automatizadas: `test/domain.test.js` (caso de aceptación, intervalos propios, límite, acompañantes con asistente o maquilladora, horario y lunes, lugar, cupo de 2 novias, Libre/Parcial/Completo, estados, vencimiento, prueba, .ics, validación, prueba guiada y datos sintéticos). Ejecutar con:

```bash
npm test
```
