# Agenda de novias · calendario, pruebas y recursos

**Previsualización:** https://agenda-maquilladora-novias.vercel.app
**Repositorio:** https://github.com/samuelim1111-lang/Calendario-mensual-de-novias-pruebas-y-recursos-de-una-maquilladora

Agenda mensual para una maquilladora de novias (Montevideo). React 19 + Tailwind CSS 4 + localStorage. Todo el build sale en **un solo `dist/index.html`** sin dependencias de CDN (solo las fuentes de Google).

## Cómo correrlo

```bash
npm install
npm test          # pruebas de dominio (node:test, sin dependencias extra)
npm run build     # genera dist/index.html
npm start         # build + servidor estático en http://localhost:3000
```

También se puede abrir `dist/index.html` directo con doble clic.

## Identidad visual

Paleta: `#3A2E2E` (texto), `#FBF7F4` (fondo), `#D8B4A0` (rosa · confirmadas), `#B8935A` (oro · retenidas), `#6E8B74` (salvia · libre y saldo pagado), `#B5474B` (rojo · Completo y errores), `#FFFFFF` (tarjetas). Los tonos -100/-700 de `src/styles.css` son variantes claras y oscuras de esos mismos colores para fondos suaves y texto con contraste AA. Tipografía: Cormorant Garamond (títulos) y Nunito Sans (texto).

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/domain.js` | Reglas puras: ocupación por recurso, disponibilidad, estado del día, precios, transiciones, vencimiento, prueba, `.ics`. Sin React ni storage. |
| `src/seed.js` | Datos sintéticos (4 recursos, 6 servicios, 14 reservas). |
| `src/storage.js` | Lectura/escritura en localStorage con clave propia y manejo de errores. |
| `src/App.jsx` | Pantallas: Calendario, Nueva reserva, Detalle, Recursos, Servicios y tarifas, Ajustes. |
| `build.mjs` | esbuild + compilador de Tailwind → `dist/index.html`. |
| `test/domain.test.js` | 13 pruebas automatizadas. |

## Datos sintéticos

Al abrir por primera vez (si no existe la clave propia) (o con **Ajustes → Restaurar datos de prueba**) se llama a `crearSeed(new Date())`. Las fechas se calculan desde **hoy en hora de Montevideo**, así siempre caen en el mes actual y los dos siguientes:

- **Sábado Completo**: el primer sábado con ≥ 4 días de margen, con 5 reservas (incluye el caso guiado de las 8:00).
- **2 retenidas**: una retenida hace 46 h (vence ~2 h después de abrir) y otra hace 3 h.
- **1 cancelada** por vencimiento (retenida hace 60 h).
- **2 con saldo pagado** (una ya realizada hace 2 días).
- **9 confirmadas (señadas)**, incluida una prueba de maquillaje generada con la regla «un mes antes». El briefing pide 2 retenidas, 4 señadas, 2 con saldo pagado y 1 cancelada (9) dentro de 14 reservas: las 5 restantes también son señadas, porque no hay otro estado posible.
- La maquilladora tiene bloqueado el día hoy + 12.
- Recursos: Valentina (maquilladora, principal), Lucía (asistente), Estudio Pocitos (espacio) y Kit de aerógrafo (equipo), que usan la Prueba de maquillaje (90 min) y la Novia · Civil (primeros 60 min).

Para reemplazarlos, editá `RECURSOS_SEED`, `SERVICIOS_SEED` y las llamadas `mk(...)` en `src/seed.js`, y restaurá desde Ajustes.

## Almacenamiento

- Clave única: **`kodarvia.agenda-maquilladora.v1`** (JSON con `version`, `recursos`, `servicios`, `reservas`, `tarifas`).
- «Restaurar datos de prueba» hace `removeItem` **solo de esa clave**; no toca otras aplicaciones.
- Si `setItem` falla (cuota llena, modo privado, bloqueo), aparece un aviso fijo arriba: *«No se pudo guardar… se perderán si recargás»* con botón **Reintentar guardado**. Los cambios siguen en pantalla.
- **Cómo probar un guardado fallido**: Ajustes → activar «Simular fallo de guardado» y hacer cualquier cambio (por ejemplo, Guardar tarifas). Al desactivarlo se reintenta el guardado.

## Reglas y pruebas

### Modelo de datos

- **Reserva**: `id, novia{nombre,email}, servicioId, inicio ("YYYY-MM-DDTHH:mm", hora de Montevideo), lugar (Estudio|Domicilio), direccion, km (int), acompanantes (0–4), postizas (bool), total, sena, saldo, estado (Retenida|Confirmada|Saldo pagado|Cancelada), pagoFueraPlazo (bool), fechaRetencion (ISO UTC)`, más `historial[]`, `pruebaDe` y `canceladaPorVencimiento`.
- **Recurso**: `id, nombre, tipo (Persona|Espacio|Equipo), diasBloqueados[]`, más `principal` (la maquilladora; define «Completo»).
- **Servicio**: `id, nombre, duracionMin, precioUYU (>0), recursosIds[], admiteDomicilio`, más `tramos[{recursoId, offsetMin, duracionMin}]` y `esPrueba`.

### Ids, relaciones y estados

- **Ids**: `r-…` recursos, `s-…` servicios, `res-…` reservas (únicos, generados al crear).
- **Relaciones**: `Reserva.servicioId → Servicio`; `Servicio.tramos[].recursoId → Recurso` (y `recursosIds` derivado); `Reserva.pruebaDe → Reserva` (la prueba apunta a su boda). Un recurso no se puede dar de baja si tiene reservas futuras o lo usa algún servicio, así nunca queda una referencia rota. Los servicios se dan de alta y se editan, no se borran.
- **Estados de la reserva**: `Retenida → Confirmada → Saldo pagado`, y `Retenida | Confirmada → Cancelada`. `Saldo pagado` y `Cancelada` son finales. Retenida vence sola a las 48 h. Solo los estados activos (Retenida, Confirmada, Saldo pagado) ocupan recursos.

### Flujo alta → acción → consulta

Alta en «Nueva reserva» (nace Retenida) → acción «Registrar seña» (pasa a Confirmada) → consulta en el detalle y en el calendario. Si falla una validación (email, km, horario, recurso ocupado) o una transición no está permitida, el formulario conserva todo lo cargado y la reserva no cambia de estado: se muestra el motivo y se corrige sin volver a escribir.

### Regla «recursos con intervalos propios»

Un servicio **no** reserva a todo el equipo durante toda su duración. Cada recurso tiene su propio tramo (minutos desde el inicio). `ocupacionDeReserva` convierte esos tramos en intervalos absolutos y `verificarDisponibilidad` compara **cada recurso solo contra los intervalos de ese mismo recurso** en reservas activas (las canceladas no ocupan).

Ajustes al tramo según la reserva:
- **Domicilio**: los recursos de tipo Espacio (estudio) no se ocupan; las personas y los equipos (aerógrafo) sí, porque viajan.
- **Equipos**: cada equipo tiene su propio tramo y solo bloquea a los servicios que lo usan. Si el aerógrafo está ocupado de 10:00 a 11:30, un servicio de la asistente que lo necesite a las 10:30 se rechaza por el equipo, y un retoque que solo usa a la maquilladora no se ve afectado.
- **Acompañantes**: cada una suma 40 min al tramo de la persona de apoyo (la asistente) si el servicio la usa; si no, al de la maquilladora. Los tramos posteriores se corren y los espacios que abarcan el final se estiran.
- Todo el servicio debe quedar dentro de 08:00–20:00 y ningún recurso puede tener el día bloqueado.

Si algo choca, la reserva se rechaza con un motivo por recurso, p. ej.: *«Lucía · Asistente no está libre de 10:45 a 12:15 (Camila Rodríguez · Novia · Día de boda); este servicio necesita ese recurso de 11:00 a 12:30.»* Si ningún horario de 15 en 15 min entra ese día, el formulario lo avisa antes de guardar.

### Libre / Parcial / Completo

- **Completo**: la maquilladora (recurso principal) no tiene ningún hueco libre entre 08:00 y 20:00 tan largo como su tramo en el servicio más corto que la usa (hoy, Maquillaje social: 60 min). Un día bloqueado también es Completo.
- **Libre**: ningún recurso tiene ocupación ni bloqueo ese día.
- **Parcial**: el resto.
- Con el filtro de recurso, la misma regla se aplica al recurso elegido.

### Vencimiento de retenidas

Toda reserva nueva nace **Retenida** con `fechaRetencion = ahora`. Al abrir la app y cada 30 s, `vencerRetenidas` pasa a **Cancelada** las que llevan ≥ 48 h sin seña, registra el motivo en el historial y, al dejar de estar activas, liberan sus recursos.

### Total, seña y saldo

`total = precio del servicio + acompañantes × $2.500 + postizas ($900) + km × $60` (traslado solo a domicilio; tarifas editables en Servicios y tarifas). `seña = total / 2` exacto (si el total es impar, la seña lleva centavos), `saldo = total − seña`.

### Estados

Retenida → Confirmada (registrar seña) o Cancelada · Confirmada → Saldo pagado o Cancelada. **Saldo pagado** solo se puede marcar hasta las 23:59 del día anterior al evento; después exige tildar «Pago fuera de plazo», que queda guardado en `pagoFueraPlazo`.

### Agendar prueba

Propone el servicio marcado «Es prueba», en el estudio, el **mismo día y hora un mes antes** (si ese día no existe, el último del mes). Si ya pasó o algún recurso está ocupado/bloqueado, avanza día a día hasta el primero libre antes del evento, y explica por qué se movió.

### Archivo .ics

`generarICS` arma un VCALENDAR (RFC 5545) con `VTIMEZONE America/Montevideo (UTC−3)`, `DTSTART/DTEND` con TZID, `SUMMARY` = servicio · novia, `LOCATION` = Estudio o dirección + km, descripción con extras y montos, `STATUS` según el estado y líneas plegadas a 75 octetos. Así un calendario en otra zona horaria muestra la hora correcta convertida.

> En la vista previa de claude.ai el visor no permite guardar archivos `.ics`: ahí el botón muestra el contenido para copiar o lo guarda como `.ics.txt`. En la app corriendo por su cuenta se descarga el `.ics` directo.

### Prueba guiada y resultado observado

Datos: Novia · Día de boda a las 08:00 en el estudio (maquilladora 0–165 min, asistente 165–255 min, estudio 0–255 min).

| Paso | Resultado observado |
|---|---|
| Ocupación de la boda | Maquilladora **08:00–10:45**, asistente **10:45–12:15**, estudio 08:00–12:15 |
| Retoque y fotos a las 11:00 (solo maquilladora) | **Se acepta**: la asistente ocupada no la bloquea |
| Peinado de novia a las 11:00 (asistente + estudio) | **Se rechaza** con el motivo de la asistente y del estudio |
| Retoque a las 10:00 | **Se rechaza**: maquilladora ocupada 08:00–10:45 |
| Límite: peinado a las 12:15 / 12:14 | **Entra** a las 12:15 (la asistente termina justo); a las 12:14 se rechaza. Los intervalos son semiabiertos `[inicio, fin)` |

En los datos sintéticos este caso está en el sábado Completo (08:00 boda, 11:00 retoque a domicilio).

Prueba automatizada: `test/domain.test.js` → *«Recursos con intervalos propios: caso guiado del briefing»*. Ejecutar con:

```bash
npm test
```
