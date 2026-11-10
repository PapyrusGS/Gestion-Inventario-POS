// Client API service with Dual-Mode Architecture:
// 1. Primary: Local Express Server / Netlify Function (/api/...)
// 2. Auto-Fallback: Direct Supabase Cloud Connection (Zero-Server / Netlify Drop)

import { directSupabaseApi } from './supabaseApi';

const TOKEN_KEY = 'inventario_auth_token';
const USER_KEY = 'inventario_auth_user';

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getUser: () => {
    try {
      const u = localStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },
  setAuth: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

function isOfflineOrDown(err) {
  return !err?.status || err.status === 404 || err.status === 502 || err.name === 'TypeError';
}

async function apiRequest(endpoint, options = {}) {
  const token = authStorage.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401 || response.status === 403) {
    if (endpoint !== '/auth/login') {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        authStorage.clearAuth();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      const err = new Error(data.error || 'Sesión no autorizada o expirada.');
      err.status = response.status;
      throw err;
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Error en la solicitud (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return data;
}

export const api = {
  // Auth
  login: async (username, password) => {
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      authStorage.setAuth(res.token, res.user);
      return res;
    } catch (err) {
      if (isOfflineOrDown(err)) {
        console.info('[API] Usando conexión directa a Supabase para login...');
        const res = await directSupabaseApi.login(username, password);
        authStorage.setAuth(res.token, res.user);
        return res;
      }
      throw err;
    }
  },

  logout: () => {
    authStorage.clearAuth();
    window.dispatchEvent(new CustomEvent('auth:logout'));
  },

  getMe: async () => {
    try {
      return await apiRequest('/auth/me');
    } catch {
      return { user: authStorage.getUser() };
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    return await apiRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  // Products
  getProducts: async () => {
    try {
      return await apiRequest('/products');
    } catch (err) {
      if (isOfflineOrDown(err)) {
        console.info('[API] Recuperando productos directo de Supabase...');
        return await directSupabaseApi.getProducts();
      }
      throw err;
    }
  },

  saveProduct: async (productData) => {
    try {
      return await apiRequest('/products', {
        method: 'POST',
        body: JSON.stringify(productData)
      });
    } catch (err) {
      if (isOfflineOrDown(err)) {
        console.info('[API] Guardando producto directo en Supabase...');
        return await directSupabaseApi.saveProduct(productData, authStorage.getUser());
      }
      throw err;
    }
  },

  adjustStock: async (productId, branchId, newStock, reason) => {
    try {
      return await apiRequest(`/products/${productId}/adjust-stock`, {
        method: 'POST',
        body: JSON.stringify({ branchId, newStock, reason })
      });
    } catch (err) {
      if (isOfflineOrDown(err)) {
        console.info('[API] Ajustando stock directo en Supabase...');
        return await directSupabaseApi.adjustStock(productId, branchId, newStock, reason, authStorage.getUser());
      }
      throw err;
    }
  },

  // Sales
  createSale: async (saleData) => {
    try {
      return await apiRequest('/sales', {
        method: 'POST',
        body: JSON.stringify(saleData)
      });
    } catch (err) {
      if (isOfflineOrDown(err)) {
        console.info('[API] Registrando venta directo en Supabase...');
        return await directSupabaseApi.createSale(saleData, authStorage.getUser());
      }
      throw err;
    }
  },

  getSales: async (filters = {}) => {
    try {
      const query = new URLSearchParams(filters).toString();
      return await apiRequest(`/sales${query ? `?${query}` : ''}`);
    } catch (err) {
      if (isOfflineOrDown(err)) {
        console.info('[API] Consultando ventas directo de Supabase...');
        return await directSupabaseApi.getSales(filters);
      }
      throw err;
    }
  },

  voidSale: async (saleId, reason) => {
    try {
      return await apiRequest(`/sales/${saleId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    } catch (err) {
      if (isOfflineOrDown(err)) {
        console.info('[API] Anulando venta directo en Supabase...');
        return await directSupabaseApi.voidSale(saleId, reason, authStorage.getUser());
      }
      throw err;
    }
  },

  // Cash Register
  getCurrentCashRegister: async () => {
    try {
      return await apiRequest('/cash-registers/current');
    } catch {
      return null;
    }
  },

  openCashRegister: async (initialCash, branchId) => {
    try {
      return await apiRequest('/cash-registers/open', {
        method: 'POST',
        body: JSON.stringify({ initialCash, branchId })
      });
    } catch {
      return { success: true };
    }
  },

  closeCashRegister: async ({ countedCash, notes, branchId }) => {
    try {
      return await apiRequest('/cash-registers/close', {
        method: 'POST',
        body: JSON.stringify({ countedCash, notes, branchId })
      });
    } catch {
      return { success: true };
    }
  },

  // Audit Logs
  getAuditLogs: async (filters = {}) => {
    try {
      const query = new URLSearchParams(filters).toString();
      return await apiRequest(`/audit-logs${query ? `?${query}` : ''}`);
    } catch (err) {
      if (isOfflineOrDown(err)) {
        console.info('[API] Consultando auditoría directo de Supabase...');
        return await directSupabaseApi.getAuditLogs();
      }
      throw err;
    }
  },

  // Sync Offline
  sync: async (offlineSales) => {
    try {
      return await apiRequest('/sync', {
        method: 'POST',
        body: JSON.stringify({ offlineSales })
      });
    } catch {
      return { syncedCount: 0 };
    }
  }
};
