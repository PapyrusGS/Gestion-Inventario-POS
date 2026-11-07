import React, { useState, useRef } from 'react';
import { 
  ShieldCheck, 
  Download, 
  Upload, 
  CheckCircle2, 
  X, 
  Smartphone
} from 'lucide-react';
import { exportDatabaseBackup, restoreDatabaseBackup, db } from '../db/db';

export function BackupModal({ isOpen, onClose, onDataRestored }) {
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDownloadBackup = async () => {
    try {
      setIsLoading(true);
      const backup = await exportDatabaseBackup();
      const dateStr = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `InventarioVenta_Respaldo_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      setErrorMessage('Error al generar la copia de seguridad: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('¿Confirma la restauración de la copia de seguridad? Los datos actuales serán reemplazados.')) {
      e.target.value = '';
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage('');
      const text = await file.text();
      const parsed = JSON.parse(text);

      await restoreDatabaseBackup(parsed);

      setRestoreSuccess(true);
      if (onDataRestored) onDataRestored();

      setTimeout(() => {
        setRestoreSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      setErrorMessage('El archivo seleccionado no es válido o está dañado: ' + err.message);
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const handleResetClean = async () => {
    if (window.confirm('¿Confirma el restablecimiento de la base de datos? Se eliminarán los registros existentes.')) {
      await db.products.clear();
      await db.sales.clear();
      await db.stockMovements.clear();
      await db.syncQueue.clear();
      if (onDataRestored) onDataRestored();
      onClose();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ background: '#dcfce7', color: '#16a34a', padding: '0.4rem', borderRadius: '10px' }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Respaldo y Restauración</h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Gestión de copias de seguridad de la base de datos local</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none' }}>
            <X size={24} color="#64748b" />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <Smartphone size={28} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.88rem', color: '#1e3a8a', lineHeight: 1.45 }}>
              <strong>Seguridad de los datos</strong>
              <br />
              Genere copias de respaldo de forma regular para resguardar su catálogo, inventario y registros de venta. El archivo descargado puede importarse posteriormente en este u otro equipo.
            </div>
          </div>

          <div className="clean-card" style={{ background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.2rem' }}>
                1. Exportar copia de seguridad
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Descarga un archivo con las existencias y transacciones actuales
              </div>
            </div>

            <button
              onClick={handleDownloadBackup}
              disabled={isLoading}
              className="btn-touch-primary"
              style={{ padding: '0.65rem 1rem', fontSize: '0.9rem', background: '#2563eb' }}
            >
              <Download size={18} />
              <span>{downloadSuccess ? 'Descargado' : 'Exportar'}</span>
            </button>
          </div>

          <div className="clean-card" style={{ background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.2rem' }}>
                2. Restaurar desde archivo
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Carga un archivo de respaldo para restablecer la información
              </div>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="btn-secondary"
              style={{ padding: '0.65rem 1rem', fontSize: '0.9rem', color: '#0f172a', borderColor: '#94a3b8' }}
            >
              <Upload size={18} />
              <span>{restoreSuccess ? 'Restaurado' : 'Cargar archivo'}</span>
            </button>
          </div>

          {errorMessage && (
            <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', fontSize: '0.88rem' }}>
              {errorMessage}
            </div>
          )}

          {restoreSuccess && (
            <div style={{ background: '#dcfce7', color: '#15803d', padding: '0.75rem', borderRadius: '8px', fontSize: '0.88rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={20} />
              <span>Copia de seguridad restaurada correctamente.</span>
            </div>
          )}

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Restablecimiento del sistema
            </span>
            <button
              onClick={handleResetClean}
              style={{ background: 'none', color: '#ef4444', fontSize: '0.82rem', fontWeight: 600 }}
            >
              Restablecer base de datos
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
