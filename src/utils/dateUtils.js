// Utilidades de Fecha y Hora configuradas para La Paz, Bolivia (UTC-4, America/La_Paz)

export const BOLIVIA_TIMEZONE = 'America/La_Paz';

/**
 * Obtiene la fecha YYYY-MM-DD en la zona horaria de Bolivia
 * @param {Date|string|number} date
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function getBoliviaDate(date = new Date()) {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BOLIVIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Obtiene el mes YYYY-MM en la zona horaria de Bolivia
 * @param {Date|string|number} date
 * @returns {string} Mes en formato YYYY-MM
 */
export function getBoliviaMonth(date = new Date()) {
  const dStr = getBoliviaDate(date);
  return dStr ? dStr.slice(0, 7) : '';
}

/**
 * Formatea fecha y hora en formato legible para Bolivia
 * @param {Date|string|number} date
 * @param {boolean} includeSeconds
 * @returns {string} Fecha y hora legible (DD/MM/YYYY, HH:mm)
 */
export function formatBoliviaDateTime(date, includeSeconds = false) {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: BOLIVIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: false
  }).format(d);
}

/**
 * Formatea únicamente la hora en formato HH:mm (hora de Bolivia)
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatBoliviaTime(date) {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: BOLIVIA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
}

