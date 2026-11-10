import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { PointOfSale } from './components/PointOfSale';
import { InventoryManager } from './components/InventoryManager';
import { OwnerDashboard } from './components/OwnerDashboard';
import { AuditPanel } from './components/AuditPanel';
import { LoginModal } from './components/LoginModal';
import { db, seedInitialDataIfNeeded } from './db/db';
import { api, authStorage } from './services/api';

export function App() {
  const [currentUser, setCurrentUser] = useState(() => authStorage.getUser());
  const [activeTab, setActiveTab] = useState('pos');
  const currency = 'Bs.';
  const [lowStockCount, setLowStockCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [activeBranchId, setActiveBranchId] = useState(() => currentUser?.branchId || 1);

  // Monitor network status
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      // Trigger background sync if there are pending offline transactions
      try {
        const pendingSales = await db.syncQueue.toArray();
        if (pendingSales.length > 0) {
          await api.sync(pendingSales.map(s => s.payload));
          await db.syncQueue.clear();
          console.log('[Sync] Ventas offline sincronizadas con éxito');
        }
      } catch (err) {
        console.warn('[Sync] Error sincronizando ventas offline:', err);
      }
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleLogout = () => setCurrentUser(null);
    window.addEventListener('auth:logout', handleLogout);
    window.addEventListener('auth:expired', handleLogout);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('auth:logout', handleLogout);
      window.removeEventListener('auth:expired', handleLogout);
    };
  }, []);

  // Update current user branch
  useEffect(() => {
    if (currentUser?.branchId) {
      setActiveBranchId(currentUser.branchId);
    }
  }, [currentUser]);

  const isOwner = currentUser?.role === 'OWNER';

  // Si no es propietario (ej. vendedor), restringir acceso a Cierre de Caja y Auditoría
  useEffect(() => {
    if (!isOwner && (activeTab === 'dashboard' || activeTab === 'audit')) {
      setActiveTab('pos');
    }
  }, [isOwner, activeTab]);

  const updateBadges = useCallback(async () => {
    try {
      let prods = [];
      try {
        prods = await api.getProducts();
      } catch {
        prods = await db.products.toArray();
      }
      const low = prods.filter(p => (p.stock || p.stockSuc1 || 0) <= (p.minStock || 5)).length;
      setLowStockCount(low);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await seedInitialDataIfNeeded();
      await updateBadges();
    };
    init();
  }, [refreshTrigger, updateBadges]);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    if (user.branchId) {
      setActiveBranchId(user.branchId);
    }
    triggerRefresh();
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
  };

  return (
    <div className="app-container">
      {/* Si no ha iniciado sesión, se despliega el modal de login */}
      {!currentUser && (
        <LoginModal onLoginSuccess={handleLoginSuccess} />
      )}

      {/* Cabecera y Navegación unificadas y fijas al hacer scroll */}
      <div className="sticky-top-bar" style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.12)'
      }}>
        <Header
          currentUser={currentUser}
          onLogout={handleLogout}
          isOnline={isOnline}
        />

        <Navigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          lowStockCount={lowStockCount}
          currentUser={currentUser}
        />
      </div>

      <main className="main-content">
        {activeTab === 'pos' && (
          <PointOfSale
            key={`pos-${refreshTrigger}-${currentUser?.id || 'anon'}`}
            currency={currency}
            currentUser={currentUser}
            onSaleCompleted={triggerRefresh}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryManager
            key={`inv-${refreshTrigger}-${currentUser?.id || 'anon'}`}
            currency={currency}
            currentUser={currentUser}
            onInventoryChange={triggerRefresh}
          />
        )}

        {activeTab === 'dashboard' && isOwner && (
          <OwnerDashboard
            key={`dash-${refreshTrigger}-${currentUser?.id || 'anon'}`}
            currency={currency}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'audit' && isOwner && (
          <AuditPanel />
        )}
      </main>
    </div>
  );
}

export default App;
