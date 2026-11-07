import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, initDatabase } from './db.js';
import { authenticateToken, requireRole, generateToken, logAudit } from './auth.js';
import {
  supabaseAdmin,
  getSupabaseUser,
  getSupabaseProducts,
  createSupabaseProduct,
  updateSupabaseProduct,
  adjustSupabaseStock,
  createSupabaseSale,
  getSupabaseSales,
  voidSupabaseSale,
  getCurrentSupabaseCashRegister,
  openSupabaseCashRegister,
  closeSupabaseCashRegister,
  getSupabaseAuditLogs,
  logSupabaseAudit
} from './supabaseClient.js';

// Initialize DB schema & seed data
initDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Request logger for basic access
app.use((req, res, next) => {
  next();
});

// ==========================================
// 1. AUTHENTICATION & SECURITY
// ==========================================

// Login (Autenticación protegida en Base de Datos)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
    }

    const trimmedUser = username.trim();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    let user = null;
    let passwordValid = false;

    // 1. Intentar validar primero contra la base de datos Supabase
    const sbUser = await getSupabaseUser(trimmedUser);
    if (sbUser) {
      if (bcrypt.compareSync(password, sbUser.password_hash)) {
        user = {
          id: sbUser.id,
          username: sbUser.username,
          full_name: sbUser.full_name,
          role: sbUser.role,
          branch_id: null,
          branch_name: 'Todas las Sucursales'
        };
        passwordValid = true;
      }
    } else if (trimmedUser.toLowerCase() === 'admin') {
      // 2. Fallback de inicio de sesión administrativo si users aún no existe en Supabase
      user = {
        id: 1,
        username: 'admin',
        full_name: 'Administración General (Propietarios)',
        role: 'OWNER',
        branch_id: null,
        branch_name: 'Todas las Sucursales'
      };
      if (db) {
        const dbUser = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('admin');
        if (dbUser && bcrypt.compareSync(password, dbUser.password_hash)) {
          passwordValid = true;
        }
      } else if (password === adminPassword) {
        passwordValid = true;
      }
    } else if (db) {
      const dbUser = db.prepare(`
        SELECT u.*, b.name as branch_name 
        FROM users u
        LEFT JOIN branches b ON u.branch_id = b.id
        WHERE u.username = ? AND u.is_active = 1
      `).get(trimmedUser);
      if (dbUser) {
        user = dbUser;
        passwordValid = bcrypt.compareSync(password, dbUser.password_hash);
      }
    }

    if (!user || !passwordValid) {
      logAudit(req, {
        action: 'LOGIN_FALLIDO',
        targetEntity: 'users',
        targetId: username,
        reason: 'Credenciales inválidas'
      });
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = generateToken(user);
    req.user = user;

    logAudit(req, {
      action: 'LOGIN_EXITOSO',
      targetEntity: 'users',
      targetId: String(user.id),
      reason: `Ingreso al sistema con rol: ${user.role}`
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        branchId: user.branch_id,
        branchName: user.branch_name || 'Todas las Sucursales'
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno en el servidor.' });
  }
});

// Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.role, u.branch_id, b.name as branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.id = ? AND u.is_active = 1
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      branchId: user.branch_id,
      branchName: user.branch_name || 'Todas las Sucursales'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change Password
app.post('/api/auth/change-password', authenticateToken, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    logAudit(req, {
      action: 'CAMBIO_PASSWORD',
      targetEntity: 'users',
      targetId: String(req.user.id),
      reason: 'El usuario actualizó su contraseña exitosamente'
    });

    res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. SUCURSALES (BRANCHES)
// ==========================================

app.get('/api/branches', authenticateToken, (req, res) => {
  try {
    const branches = db.prepare('SELECT * FROM branches WHERE is_active = 1 ORDER BY id ASC').all();
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. GESTIÓN DE USUARIOS (SOLO DUEÑO)
// ==========================================

app.get('/api/users', authenticateToken, requireRole(['OWNER']), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.is_active, u.created_at, b.name as branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      ORDER BY u.id ASC
    `).all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticateToken, requireRole(['OWNER']), (req, res) => {
  try {
    const { id, username, password, fullName, role, branchId, isActive } = req.body;

    if (!id) {
      // Create user
      if (!username || !password || !fullName || !role) {
        return res.status(400).json({ error: 'Faltan campos obligatorios para crear el usuario.' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
      if (existing) {
        return res.status(400).json({ error: 'El nombre de usuario ya está en uso.' });
      }

      const hash = bcrypt.hashSync(password, 10);
      const now = new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO users (username, password_hash, full_name, role, branch_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const result = insert.run(username.trim(), hash, fullName.trim(), role, branchId || null, 1, now);

      logAudit(req, {
        action: 'CREAR_USUARIO',
        targetEntity: 'users',
        targetId: String(result.lastInsertRowid),
        newValues: { username, fullName, role, branchId }
      });

      res.status(201).json({ success: true, message: 'Usuario creado exitosamente.' });
    } else {
      // Update user
      const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      let passwordHash = existing.password_hash;
      if (password && password.trim().length > 0) {
        passwordHash = bcrypt.hashSync(password.trim(), 10);
      }

      const update = db.prepare(`
        UPDATE users 
        SET full_name = ?, role = ?, branch_id = ?, is_active = ?, password_hash = ?
        WHERE id = ?
      `);
      update.run(fullName.trim(), role, branchId || null, isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active, passwordHash, id);

      logAudit(req, {
        action: 'MODIFICAR_USUARIO',
        targetEntity: 'users',
        targetId: String(id),
        oldValues: { fullName: existing.full_name, role: existing.role, branchId: existing.branch_id, isActive: existing.is_active },
        newValues: { fullName, role, branchId, isActive }
      });

      res.json({ success: true, message: 'Usuario actualizado exitosamente.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. PRODUCTOS & INVENTARIO (CONECTADO A SUPABASE)
// ==========================================

app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const isOwner = req.user.role === 'OWNER';
    const products = await getSupabaseProducts(isOwner);
    res.json(products);
  } catch (err) {
    console.error('[Supabase] Error al listar productos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Crear o Editar Producto en Supabase
app.post('/api/products', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  try {
    const { id, name, salePrice } = req.body;

    if (!name || salePrice === undefined) {
      return res.status(400).json({ error: 'Nombre y Precio de Venta son obligatorios.' });
    }

    if (!id) {
      const created = await createSupabaseProduct(req.body, req.user, req);
      res.status(201).json({ success: true, message: 'Producto registrado exitosamente en Supabase.', id: created.id });
    } else {
      const updated = await updateSupabaseProduct(id, req.body, req.user, req);
      res.json({ success: true, message: 'Producto actualizado exitosamente en Supabase.', id: updated.id });
    }
  } catch (err) {
    console.error('[Supabase] Error guardando producto:', err);
    res.status(500).json({ error: err.message });
  }
});

// Ajuste manual de inventario en Supabase (SOLO DUEÑO - REQUIERE JUSTIFICACIÓN)
app.post('/api/products/:id/adjust-stock', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const { newStock, reason } = req.body;

    if (!reason || reason.trim().length < 4) {
      return res.status(400).json({ error: 'Es obligatorio indicar un motivo justificativo para el ajuste de inventario.' });
    }

    const data = await adjustSupabaseStock(productId, newStock, reason, req.user, req);
    res.json({ success: true, message: 'Ajuste de inventario aplicado correctamente en Supabase.', newStock: data.stock });
  } catch (err) {
    console.error('[Supabase] Error ajustando inventario:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. VENTAS (PUNTO DE VENTA EN SUPABASE)
// ==========================================

app.post('/api/sales', authenticateToken, async (req, res) => {
  try {
    const sale = await createSupabaseSale(req.body, req.user, req);
    res.status(201).json({
      success: true,
      saleId: sale.id,
      saleNumber: sale.sale_number,
      total: sale.total,
      createdAt: sale.created_at
    });
  } catch (err) {
    console.error('[Supabase] Error registrando venta:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listado de ventas desde Supabase
app.get('/api/sales', authenticateToken, async (req, res) => {
  try {
    const isOwner = req.user.role === 'OWNER';
    const sales = await getSupabaseSales(req.query, isOwner);
    res.json(sales);
  } catch (err) {
    console.error('[Supabase] Error listando ventas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Anulación de Venta en Supabase (SOLO DUEÑO - REQUIERE MOTIVO)
app.post('/api/sales/:id/void', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  try {
    const saleId = Number(req.params.id);
    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Es obligatorio ingresar un motivo detallado para anular una venta (mínimo 5 caracteres).' });
    }

    await voidSupabaseSale(saleId, reason, req.user, req);
    res.json({ success: true, message: 'Venta anulada correctamente en Supabase y existencias restauradas.' });
  } catch (err) {
    console.error('[Supabase] Error anulando venta:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. ARQUEO Y CIERRE DE CAJA EN SUPABASE
// ==========================================

app.get('/api/cash-registers/current', authenticateToken, async (req, res) => {
  try {
    const register = await getCurrentSupabaseCashRegister();
    if (!register) {
      return res.json({ open: false });
    }

    // Calcular ventas acumuladas desde la apertura
    const { data: sales } = await supabaseAdmin
      .from('sales')
      .select('*')
      .gte('created_at', register.opened_at)
      .eq('status', 'COMPLETED');

    let cashSales = 0;
    let qrSales = 0;
    let transferSales = 0;
    let totalSales = 0;

    for (const s of (sales || [])) {
      const tot = Number(s.total || 0);
      totalSales += tot;
      if (s.payment_method === 'cash') cashSales += tot;
      else if (s.payment_method === 'qr') qrSales += tot;
      else if (s.payment_method === 'transfer') transferSales += tot;
    }

    const expectedCash = Number(register.initial_cash || 0) + cashSales;

    res.json({
      open: true,
      register: {
        ...register,
        cash_sales: cashSales,
        qr_sales: qrSales,
        transfer_sales: transferSales,
        total_sales: totalSales,
        expected_cash: expectedCash
      }
    });
  } catch (err) {
    console.error('[Supabase] Error consultando caja actual:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cash-registers/open', authenticateToken, async (req, res) => {
  try {
    const initialCash = Number(req.body.initialCash || 0);
    const existing = await getCurrentSupabaseCashRegister();
    if (existing) {
      return res.status(400).json({ error: 'Ya existe un turno de caja abierto.' });
    }

    const reg = await openSupabaseCashRegister(initialCash, req.body.notes, req.user, req);
    res.status(201).json({ success: true, message: 'Turno de caja abierto correctamente en Supabase.', register: reg });
  } catch (err) {
    console.error('[Supabase] Error abriendo caja:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cash-registers/close', authenticateToken, async (req, res) => {
  try {
    const countedCash = Number(req.body.countedCash || 0);
    const reg = await closeSupabaseCashRegister(countedCash, req.body.notes, req.user, req);
    res.json({
      success: true,
      message: 'Caja cerrada y arqueo completado en Supabase.',
      report: {
        initialCash: reg.initial_cash,
        cashSales: reg.cash_sales,
        qrSales: reg.qr_sales,
        transferSales: reg.transfer_sales,
        totalSales: reg.total_sales,
        expectedCash: reg.expected_cash,
        countedCash: reg.counted_cash,
        difference: reg.difference
      }
    });
  } catch (err) {
    console.error('[Supabase] Error cerrando caja:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. AUDITORÍA FORENSE EN SUPABASE (SOLO DUEÑO)
// ==========================================

app.get('/api/audit-logs', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const logs = await getSupabaseAuditLogs(limit);
    res.json(logs);
  } catch (err) {
    console.error('[Supabase] Error obteniendo logs de auditoría:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. SINCRONIZACIÓN OFFLINE-FIRST A SUPABASE
// ==========================================

app.post('/api/sync', authenticateToken, async (req, res) => {
  try {
    const { offlineSales = [] } = req.body;
    let syncedSalesCount = 0;

    for (const sale of offlineSales) {
      try {
        await createSupabaseSale(sale, req.user, req);
        syncedSalesCount++;
      } catch (sErr) {
        console.warn('[Supabase Sync] Error sincronizando venta offline:', sErr.message);
      }
    }

    const isOwner = req.user.role === 'OWNER';
    const products = await getSupabaseProducts(isOwner);

    res.json({
      success: true,
      syncedSalesCount,
      serverTime: new Date().toISOString(),
      products
    });
  } catch (err) {
    console.error('[Supabase] Error en sincronización:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. DASHBOARD CONSOLIDADO & REPORTES (SOLO DUEÑO)
// ==========================================

app.get('/api/dashboard/stats', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = new Date().toISOString().slice(0, 7);

    const { data: allSales = [] } = await supabaseAdmin
      .from('sales')
      .select('*')
      .eq('status', 'COMPLETED');

    const todaySalesList = (allSales || []).filter(s => s.created_at && s.created_at.startsWith(todayStr));
    const monthSalesList = (allSales || []).filter(s => s.created_at && s.created_at.startsWith(monthStr));

    const todaySales = todaySalesList.reduce((acc, s) => acc + Number(s.total || 0), 0);
    const todayCost = todaySalesList.reduce((acc, s) => acc + Number(s.total_cost || 0), 0);
    const todayProfit = todaySales - todayCost;
    const todayTransactions = todaySalesList.length;

    const monthSales = monthSalesList.reduce((acc, s) => acc + Number(s.total || 0), 0);
    const monthCost = monthSalesList.reduce((acc, s) => acc + Number(s.total_cost || 0), 0);
    const monthProfit = monthSales - monthCost;

    const paymentMethods = [
      { payment_method: 'cash', count: todaySalesList.filter(s => s.payment_method === 'cash').length, total: todaySalesList.filter(s => s.payment_method === 'cash').reduce((a, b) => a + Number(b.total), 0) },
      { payment_method: 'qr', count: todaySalesList.filter(s => s.payment_method === 'qr').length, total: todaySalesList.filter(s => s.payment_method === 'qr').reduce((a, b) => a + Number(b.total), 0) },
      { payment_method: 'transfer', count: todaySalesList.filter(s => s.payment_method === 'transfer').length, total: todaySalesList.filter(s => s.payment_method === 'transfer').reduce((a, b) => a + Number(b.total), 0) }
    ];

    const { data: prods = [] } = await supabaseAdmin
      .from('products')
      .select('id, stock, min_stock')
      .eq('is_active', true);

    const lowStockAlerts = (prods || []).filter(p => Number(p.stock) <= Number(p.min_stock || 5)).length;

    res.json({
      todaySales,
      todayProfit,
      todayTransactions,
      monthSales,
      monthProfit,
      branchStats: [],
      paymentMethods,
      lowStockAlerts
    });
  } catch (err) {
    console.error('[Supabase] Error en dashboard stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export app for Netlify Serverless Functions or start standalone
if (!process.env.NETLIFY && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[API] Servidor de Inventario & Ventas corriendo en http://localhost:${PORT}`);
  });
}

export default app;

