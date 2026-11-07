// Client API service connecting frontend to backend server with Offline-First fallback

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
      throw new Error(data.error || 'Sesión no autorizada o expirada.');
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Error en la solicitud (${response.status})`);
  }

  return data;
}

export const api = {
  // Auth
  login: async (username, password) => {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    authStorage.setAuth(res.token, res.user);
    return res;
  },

  logout: () => {
    authStorage.clearAuth();
    window.dispatchEvent(new CustomEvent('auth:logout'));
  },

  getMe: async () => {
    return await apiRequest('/auth/me');
  },

  changePassword: async (currentPassword, newPassword) => {
    return await apiRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  // Branches
  getBranches: async () => {
    return await apiRequest('/branches');
  },

  // Users
  getUsers: async () => {
    return await apiRequest('/users');
  },

  saveUser: async (userData) => {
    return await apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  // Products
  getProducts: async () => {
    return await apiRequest('/products');
  },

  saveProduct: async (productData) => {
    return await apiRequest('/products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  },

  adjustStock: async (productId, branchId, newStock, reason) => {
    return await apiRequest(`/products/${productId}/adjust-stock`, {
      method: 'POST',
      body: JSON.stringify({ branchId, newStock, reason })
    });
  },

  // Sales
  createSale: async (saleData) => {
    return await apiRequest('/sales', {
      method: 'POST',
      body: JSON.stringify(saleData)
    });
  },

  getSales: async (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    return await apiRequest(`/sales${query ? `?${query}` : ''}`);
  },

  voidSale: async (saleId, reason) => {
    return await apiRequest(`/sales/${saleId}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  // Cash Register
  getCurrentCashRegister: async () => {
    return await apiRequest('/cash-registers/current');
  },

  openCashRegister: async (initialCash, branchId) => {
    return await apiRequest('/cash-registers/open', {
      method: 'POST',
      body: JSON.stringify({ initialCash, branchId })
    });
  },

  closeCashRegister: async ({ countedCash, notes, branchId }) => {
    return await apiRequest('/cash-registers/close', {
      method: 'POST',
      body: JSON.stringify({ countedCash, notes, branchId })
    });
  },

  // Audit Logs
  getAuditLogs: async (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    return await apiRequest(`/audit-logs${query ? `?${query}` : ''}`);
  },

  // Dashboard Stats
  getDashboardStats: async () => {
    return await apiRequest('/dashboard/stats');
  },

  // Sync Offline
  sync: async (offlineSales) => {
    return await apiRequest('/sync', {
      method: 'POST',
      body: JSON.stringify({ offlineSales })
    });
  }
};

