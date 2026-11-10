import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  RefreshCw, 
  Eye 
} from 'lucide-react';
import { api } from '../services/api';
import { formatBoliviaDateTime } from '../utils/dateUtils';

// Helper para convertir los datos crudos de auditoría en texto claro y comprensible
function formatAuditSummary(log) {
  const nv = (typeof log.new_values === 'object' && log.new_values !== null) ? log.new_values : {};
  const ov = (typeof log.old_values === 'object' && log.old_values !== null) ? log.old_values : {};

  switch (log.action) {
    case 'VENTA_REGISTRADA':
      return `Venta #${nv.saleNumber || log.target_id || ''} • Total: Bs.${Number(nv.total || 0).toFixed(2)} (${nv.itemsCount || 1} ítems)`;
    
    case 'ANULAR_VENTA':
    case 'VENTA_ANULADA':
      return `Venta #${nv.saleNumber || log.target_id || ''} Anulada • Motivo: ${log.reason || nv.reason || 'Sin motivo especificado'}`;
    
    case 'CREAR_PRODUCTO':
      return `Nuevo producto: "${nv.name || 'Sin nombre'}" (Stock: ${nv.stock ?? 0}, Precio: Bs.${nv.salePrice || nv.sale_price || 0})`;
    
    case 'MODIFICAR_PRODUCTO': {
      const changes = [];
      if (ov.name && nv.name && ov.name !== nv.name) changes.push(`Nombre: ${nv.name}`);
      if (ov.stock !== undefined && nv.stock !== undefined && ov.stock !== nv.stock) changes.push(`Stock: ${ov.stock} → ${nv.stock}`);
      if (ov.salePrice !== undefined && nv.salePrice !== undefined && ov.salePrice !== nv.salePrice) changes.push(`Precio: Bs.${ov.salePrice} → Bs.${nv.salePrice}`);
      return `Edición de "${nv.name || ov.name || 'Producto'}": ${changes.length ? changes.join(' | ') : 'Actualización de campos'}`;
    }
    
    case 'AJUSTE_INVENTARIO': {
      const diffStr = nv.difference !== undefined ? ` (${nv.difference > 0 ? '+' : ''}${nv.difference})` : '';
      const reasonStr = log.reason ? ` • Motivo: ${log.reason}` : '';
      return `Ajuste de Stock: ${ov.stock ?? '?'} → ${nv.stock ?? '?'}${diffStr}${reasonStr}`;
    }
    
    case 'APERTURA_CAJA':
      return `Apertura de turno con Bs.${Number(nv.initialCash || 0).toFixed(2)} en caja`;
    
    case 'CIERRE_CAJA':
      return `Cierre de caja • Contado: Bs.${Number(nv.countedCash || 0).toFixed(2)} | Esperado: Bs.${Number(nv.expectedCash || 0).toFixed(2)}`;
    
    case 'LOGIN_EXITOSO':
      return log.reason || `Inicio de sesión exitoso`;
    
    case 'LOGIN_FALLIDO':
      return log.reason || `Intento de acceso fallido`;
    
    default: {
      if (log.reason) return log.reason;
      if (typeof log.new_values === 'object' && log.new_values !== null) {
        const entries = Object.entries(log.new_values)
          .filter(([k]) => !k.startsWith('_'))
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        return entries.length ? entries.join(', ') : (log.target_entity || 'Operación registrada');
      }
      return log.target_entity || 'Registro de sistema';
    }
  }
}

export function AuditPanel() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const filters = {};
      if (actionFilter) filters.action = actionFilter;
      const res = await api.getAuditLogs(filters);
      setLogs(res || []);
    } catch (err) {
      console.error('Error cargando auditoría:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [actionFilter]);

  const getActionBadgeColor = (action) => {
    if (action.includes('FALLIDO') || action.includes('DENEGADO')) return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' };
    if (action.includes('ANULADA') || action.includes('ANULAR') || action.includes('AJUSTE')) return { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' };
    if (action.includes('VENTA') || action.includes('EXITOSO')) return { bg: '#dcfce7', text: '#15803d', border: '#86efac' };
    return { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Barra de cabecera */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        borderLeft: '5px solid #0f172a'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <ShieldCheck size={24} color="#0f172a" />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
              Bitácora de Auditoría y Control
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            Registro histórico de operaciones del sistema, ventas, anulaciones y cambios de inventario.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={isLoading}
          style={{
            padding: '0.55rem 0.95rem',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.88rem',
            fontWeight: 700
          }}
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          Actualizar Registros ({logs.length})
        </button>
      </div>

      {/* Tabla de registros */}
      <div style={{ background: '#ffffff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {/* Filtros */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              background: '#ffffff',
              fontWeight: 600
            }}
          >
            <option value="">Todas las operaciones registradas</option>
            <option value="LOGIN_EXITOSO">Ingresos al Sistema</option>
            <option value="VENTA_REGISTRADA">Ventas Registradas</option>
            <option value="ANULAR_VENTA">Ventas Anuladas</option>
            <option value="AJUSTE_INVENTARIO">Ajustes de Inventario</option>
            <option value="CREAR_PRODUCTO">Nuevos Productos Creados</option>
            <option value="MODIFICAR_PRODUCTO">Productos Editados</option>
            <option value="APERTURA_CAJA">Aperturas de Turno</option>
            <option value="CIERRE_CAJA">Cierres de Caja</option>
          </select>
        </div>

        {/* Tabla */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Fecha / Hora</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Usuario</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Operación</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Detalle / Motivo</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    No se registran eventos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const badge = getActionBadgeColor(log.action);
                  const formattedDate = formatBoliviaDateTime(log.timestamp);
                  const usernameDisplay = log.username || log.new_values?._user || 'admin';
                  const summaryText = formatAuditSummary(log);

                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.65rem 0.5rem', color: '#64748b', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {formattedDate}
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', fontWeight: 700, color: '#0f172a' }}>
                        <span style={{
                          display: 'inline-block',
                          background: '#f1f5f9',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '6px',
                          color: '#1e293b'
                        }}>
                          {usernameDisplay}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <span style={{
                          fontSize: '0.74rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          fontWeight: 700,
                          background: badge.bg,
                          color: badge.text,
                          border: `1px solid ${badge.border}`,
                          whiteSpace: 'nowrap'
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', color: '#334155', maxWidth: '380px' }}>
                        <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={summaryText}>
                          {summaryText}
                        </div>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedLog(log)}
                          style={{
                            padding: '0.3rem 0.6rem',
                            borderRadius: '6px',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.78rem'
                          }}
                        >
                          <Eye size={12} /> Ver
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detalle de Auditoría */}
      {selectedLog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '12px', maxWidth: '540px', width: '100%', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.75rem', color: '#0f172a' }}>
              Detalle del Registro de Auditoría
            </h3>
            
            <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <div><strong>Operación:</strong> <span style={{ fontWeight: 700, color: '#2563eb' }}>{selectedLog.action}</span></div>
              <div><strong>Fecha y Hora:</strong> {formatBoliviaDateTime(selectedLog.timestamp)}</div>
              <div><strong>Usuario Responsable:</strong> <span style={{ fontWeight: 700 }}>{selectedLog.username || selectedLog.new_values?._user || 'admin'}</span></div>
              <div><strong>Entidad Afectada:</strong> {selectedLog.target_entity} {selectedLog.target_id ? `(#${selectedLog.target_id})` : ''}</div>
              <div><strong>IP Origen:</strong> {selectedLog.ip_address || '127.0.0.1'}</div>
              
              {selectedLog.reason && (
                <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '0.65rem', borderRadius: '6px', color: '#92400e' }}>
                  <strong>Motivo Registrado:</strong> {selectedLog.reason}
                </div>
              )}

              {/* Resumen explicativo */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.65rem', borderRadius: '6px' }}>
                <strong style={{ display: 'block', marginBottom: '0.2rem', color: '#475569' }}>Resumen del Cambio:</strong>
                <div style={{ color: '#0f172a', fontWeight: 600 }}>{formatAuditSummary(selectedLog)}</div>
              </div>

              {/* Valores anteriores formateados de manera segura en JSON */}
              {selectedLog.old_values && (
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.82rem', color: '#64748b' }}>Estado Anterior:</strong>
                  <pre style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '0.6rem', borderRadius: '6px', fontSize: '0.78rem', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '140px' }}>
                    {typeof selectedLog.old_values === 'object' ? JSON.stringify(selectedLog.old_values, null, 2) : String(selectedLog.old_values)}
                  </pre>
                </div>
              )}

              {/* Valores nuevos formateados de manera segura en JSON */}
              {selectedLog.new_values && (
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.82rem', color: '#64748b' }}>Datos / Valores Nuevos:</strong>
                  <pre style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '0.6rem', borderRadius: '6px', fontSize: '0.78rem', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '160px' }}>
                    {typeof selectedLog.new_values === 'object' ? JSON.stringify(selectedLog.new_values, null, 2) : String(selectedLog.new_values)}
                  </pre>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedLog(null)}
              style={{
                width: '100%',
                padding: '0.65rem',
                borderRadius: '8px',
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
