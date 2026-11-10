import React, { useState, useEffect } from 'react';
import { Store, User, LogOut } from 'lucide-react';
import { db } from '../db/db';

export function Header({ currentUser, onLogout, isOnline = true }) {
  const [businessName, setBusinessName] = useState('Sistema de Inventario Venta');

  useEffect(() => {
    db.settings.get('businessName').then(setting => {
      if (setting?.value && !setting.value.includes('Carlos') && !setting.value.includes('Clara')) {
        setBusinessName(setting.value);
      } else {
        db.settings.put({ key: 'businessName', value: 'Sistema de Inventario Venta' });
        setBusinessName('Sistema de Inventario Venta');
      }
    });
  }, []);

  return (
    <header className="app-header" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.75rem 1rem',
      background: '#0f172a',
      color: '#ffffff',
      flexWrap: 'wrap',
      gap: '0.75rem',
      borderBottom: '3px solid #2563eb'
    }}>
      {/* Logotipo y Titulo */}
      <div className="brand-section" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <div className="brand-logo-badge" style={{
          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
          color: '#ffffff',
          padding: '0.45rem',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Store size={22} strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="brand-title" style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            {businessName}
          </h1>
          <p className="brand-subtitle" style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
            Tienda Deportiva y Confecciones
          </p>
        </div>
      </div>

      {/* Controles de Estado y Sesion */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        {/* Perfil de Usuario Administrador */}
        {currentUser && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            padding: '0.35rem 0.75rem',
            borderRadius: '8px',
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid #3b82f6'
          }}>
            <User size={16} color="#93c5fd" />
            <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff' }}>
                {currentUser.username}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#93c5fd' }}>
                Administración
              </div>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                title="Cerrar sesión"
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  padding: '0.35rem 0.55rem',
                  borderRadius: '6px',
                  marginLeft: '0.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  transition: 'background 0.2s'
                }}
              >
                <LogOut size={14} />
                <span>Salir</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
