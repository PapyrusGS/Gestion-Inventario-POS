// Utilidades de Fecha y Hora para La Paz, Bolivia (UTC-4, America/La_Paz)

export const BOLIVIA_TIMEZONE = 'America/La_Paz';

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

export function getBoliviaMonth(date = new Date()) {
  const dStr = getBoliviaDate(date);
  return dStr ? dStr.slice(0, 7) : '';
}

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

