import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  FileText, 
  Eye 
} from 'lucide-react';
import { api } from '../services/api';

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
    if (action.includes('ANULADA') || action.includes('AJUSTE')) return { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' };
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
            <option value="VENTA_ANULADA">Ventas Anuladas</option>
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
                <th style={{ padding: '0.75rem 0.5rem' }}>Sucursal</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Operación</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Detalle / Motivo</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    No se registran eventos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const badge = getActionBadgeColor(log.action);
                  const formattedDate = new Date(log.timestamp).toLocaleString();
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.65rem 0.5rem', color: '#64748b', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {formattedDate}
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', fontWeight: 700, color: '#0f172a' }}>
                        {log.username}
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', color: '#334155' }}>
                        {log.branch_name || (log.branch_id ? `Sucursal #${log.branch_id}` : 'General')}
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <span style={{
                          fontSize: '0.74rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          fontWeight: 700,
                          background: badge.bg,
                          color: badge.text,
                          border: `1px solid ${badge.border}`
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', color: '#334155', maxWidth: '320px' }}>
                        <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {log.reason || (log.new_values ? `Datos: ${log.new_values}` : log.target_entity)}
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
          <div style={{ background: '#ffffff', borderRadius: '12px', maxWidth: '520px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.75rem' }}>
              Detalle del Registro de Auditoría
            </h3>
            <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <div><strong>Operación:</strong> {selectedLog.action}</div>
              <div><strong>Fecha y Hora:</strong> {new Date(selectedLog.timestamp).toLocaleString()}</div>
              <div><strong>Usuario:</strong> {selectedLog.username}</div>
              <div><strong>Sucursal:</strong> {selectedLog.branch_name || 'General'}</div>
              <div><strong>IP Origen:</strong> {selectedLog.ip_address}</div>
              {selectedLog.reason && (
                <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '0.5rem', borderRadius: '6px' }}>
                  <strong>Motivo:</strong> {selectedLog.reason}
                </div>
              )}
              {selectedLog.new_values && (
                <div>
                  <strong>Detalle de Datos:</strong>
                  <pre style={{ background: '#f1f5f9', padding: '0.5rem', borderRadius: '6px', fontSize: '0.78rem', overflowX: 'auto' }}>
                    {selectedLog.new_values}
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
