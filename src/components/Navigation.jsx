import React from 'react';
import { 
  ShoppingCart, 
  Boxes, 
  BarChart3,
  ShieldCheck
} from 'lucide-react';

export function Navigation({ activeTab, setActiveTab, lowStockCount, currentUser }) {
  const isOwner = currentUser?.role === 'OWNER';

  const allTabs = [
    {
      id: 'pos',
      label: 'Ventas',
      icon: ShoppingCart,
      badge: null
    },
    {
      id: 'inventory',
      label: 'Inventario',
      icon: Boxes,
      badge: lowStockCount > 0 ? String(lowStockCount) : null,
      badgeType: 'warning'
    },
    {
      id: 'dashboard',
      label: 'Cierre de Caja',
      icon: BarChart3,
      badge: null,
      ownerOnly: true
    },
    {
      id: 'audit',
      label: 'Auditoría',
      icon: ShieldCheck,
      badge: null,
      ownerOnly: true
    }
  ];

  const tabs = allTabs.filter(tab => !tab.ownerOnly || isOwner);

  return (
    <nav className="nav-bar">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
            <span>{tab.label}</span>
            {tab.badge && (
              <span 
                style={{
                  fontSize: '0.72rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  fontWeight: 700,
                  background: tab.badgeType === 'warning' ? '#fef3c7' : '#e0e7ff',
                  color: tab.badgeType === 'warning' ? '#b45309' : '#3730a3'
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
