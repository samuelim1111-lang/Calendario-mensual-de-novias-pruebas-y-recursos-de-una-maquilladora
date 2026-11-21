// Persistencia en localStorage con una clave propia. Nunca se tocan otras claves.
import { crearSeed } from './seed.js';
import { normalizarCorrelativos } from './domain.js';

export const STORAGE_KEY = 'kodarvia.agenda-maquilladora.v1';
let simularFallo = false;
export const setSimularFallo = (v) => { simularFallo = !!v; };
export const getSimularFallo = () => simularFallo;

export function cargar() {
  let raw = null;
  try { raw = window.localStorage.getItem(STORAGE_KEY); } catch (e) {
    return { data: crearSeed(), aviso: `No se puede leer el almacenamiento del navegador (${e.name}). Se muestran datos de prueba que no se guardarán.` };
  }
  if (!raw) return { data: crearSeed(), nuevo: true };
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.reservas)) throw new Error('formato desconocido');
    return { data: normalizarCorrelativos(data) };
  } catch (e) {
    return { data: crearSeed(), aviso: `Los datos guardados estaban dañados (${e.message}); se cargaron datos de prueba. La copia dañada no se borró hasta el próximo guardado.` };
  }
}

/** Guarda y devuelve null si salió bien, o un mensaje de error legible. */
export function guardar(data) {
  try {
    if (simularFallo) {
      const err = new Error('Fallo simulado desde Ajustes'); err.name = 'QuotaExceededError'; throw err;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return null;
  } catch (e) {
    const cuota = e && (e.name === 'QuotaExceededError' || e.code === 22);
    return cuota ? `El navegador no tiene espacio para guardar (${e.message}).` : `El navegador bloqueó el guardado (${e?.name || 'error'}: ${e?.message || ''}).`;
  }
}

export function borrarPropios() {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* sin acceso */ }
}
