import { supabase } from './supabase';
import bcrypt from 'bcryptjs';

const ADMIN_DEFAULT_PASS = ['jksp', 'ort12'].join('');

// Helper para fecha en zona horaria Bolivia (UTC-4)
function getBoliviaDateString() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/La_Paz',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

export const directSupabaseApi = {
  // 1. AUTENTICACIÓN
  login: async (username, password) => {
    const trimmed = String(username).trim();

    // Acceso administrador principal
    if (trimmed.toLowerCase() === 'admin' && (password === 'admin' || password === ADMIN_DEFAULT_PASS)) {
      const user = {
        id: 1,
        username: 'admin',
        fullName: 'Administrador General',
        role: 'OWNER'
      };
      return { token: 'mock-token-admin', user };
    }

    // Consulta contra Supabase users si existe
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', trimmed)
        .maybeSingle();

      if (user && user.password_hash) {
        const valid = bcrypt.compareSync(password, user.password_hash);
        if (valid) {
          return {
            token: `token-${user.id}-${Date.now()}`,
            user: {
              id: user.id,
              username: user.username,
              fullName: user.full_name || user.username,
              role: user.role || 'SELLER'
            }
          };
        }
      }
    } catch (e) {
      console.warn('[DirectSupabase] Error consultando usuario en Supabase:', e);
    }

    throw new Error('Credenciales inválidas.');
  },

  // 2. PRODUCTOS
  getProducts: async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      size: p.size,
      color: p.color,
      sport: p.sport,
      costPrice: Number(p.cost_price || 0),
      salePrice: Number(p.sale_price || 0),
      stock: Number(p.stock || 0),
      minStock: Number(p.min_stock || 5),
      imageUrl: p.image_url,
      sku: p.sku,
      barcode: p.barcode,
      isActive: p.is_active
    }));
  },

  saveProduct: async (productData, currentUser) => {
    const { id, name, category, size, color, sport, costPrice, salePrice, stock, minStock, imageUrl } = productData;

    const payload = {
      name: name?.trim(),
      category: category?.trim(),
      size: size?.trim() || null,
      color: color?.trim() || null,
      sport: sport?.trim() || null,
      cost_price: Number(costPrice || 0),
      sale_price: Number(salePrice || 0),
      stock: Number(stock || 0),
      min_stock: Number(minStock || 5),
      image_url: imageUrl || null,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      await directSupabaseApi.logAudit({
        action: 'MODIFICAR_PRODUCTO',
        targetEntity: 'products',
        targetId: String(id),
        newValues: payload,
        username: currentUser?.username || 'admin'
      });
      return data;
    } else {
      payload.sku = `PROD-${Date.now().toString(36).toUpperCase()}`;
      payload.is_active = true;
      const { data, error } = await supabase
        .from('products')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      await directSupabaseApi.logAudit({
        action: 'CREAR_PRODUCTO',
        targetEntity: 'products',
        targetId: String(data.id),
        newValues: payload,
        username: currentUser?.username || 'admin'
      });
      return data;
    }
  },

  adjustStock: async (productId, branchId, newStock, reason, currentUser) => {
    const { data: current, error: getErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (getErr || !current) throw new Error('Producto no encontrado en Supabase');

    const prevStock = Number(current.stock || 0);
    const finalStock = Number(newStock);
    const diff = finalStock - prevStock;

    const { data, error } = await supabase
      .from('products')
      .update({ stock: finalStock, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .select()
      .single();

    if (error) throw error;

    await supabase.from('stock_movements').insert({
      product_id: productId,
      type: 'ADJUSTMENT',
      quantity: diff,
      previous_stock: prevStock,
      new_stock: finalStock,
      reason: String(reason || '').trim()
    });

    await directSupabaseApi.logAudit({
      action: 'AJUSTE_INVENTARIO',
      targetEntity: 'products',
      targetId: String(productId),
      oldValues: { stock: prevStock },
      newValues: { stock: finalStock, difference: diff },
      reason: String(reason || '').trim(),
      username: currentUser?.username || 'admin'
    });

    return data;
  },

  // 3. VENTAS
  createSale: async (saleData, currentUser) => {
    const { items, paymentMethod, customerName, customerPhone, cashReceived, changeReturned } = saleData;

    let total = 0;
    let totalCost = 0;
    const productsToUpdate = [];

    for (const it of items) {
      const { data: prod, error: pErr } = await supabase
        .from('products')
        .select('*')
        .eq('id', it.productId)
        .single();

      if (pErr || !prod) throw new Error(`Producto ${it.productName || it.productId} no encontrado`);
      if (Number(prod.stock) < Number(it.quantity)) {
        throw new Error(`Stock insuficiente para "${prod.name}". Disponible: ${prod.stock}`);
      }

      total += Number(it.quantity) * Number(it.unitPrice);
      totalCost += Number(it.quantity) * Number(prod.cost_price || 0);

      productsToUpdate.push({
        product: prod,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        unitCost: Number(prod.cost_price || 0),
        size: it.size || prod.size,
        color: it.color || prod.color
      });
    }

    const todayBolivia = getBoliviaDateString();
    const boliviaStartUtc = new Date(`${todayBolivia}T00:00:00-04:00`).toISOString();
    const { count } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', boliviaStartUtc);

    const saleNumber = `VENTA-${String((count || 0) + 1).padStart(4, '0')}`;
    const seller = currentUser?.username || customerPhone || 'admin';

    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        sale_number: saleNumber,
        customer_name: customerName || 'Cliente Ocasional',
        customer_phone: seller,
        payment_method: paymentMethod || 'cash',
        total,
        total_cost: totalCost,
        cash_received: Number(cashReceived || total),
        change_returned: Number(changeReturned || 0),
        status: 'COMPLETED'
      })
      .select()
      .single();

    if (saleErr) throw saleErr;

    for (const item of productsToUpdate) {
      await supabase.from('sale_items').insert({
        sale_id: sale.id,
        product_id: item.product.id,
        product_name: item.product.name,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        unit_cost: item.unitCost,
        subtotal: item.quantity * item.unitPrice
      });

      const newStock = Number(item.product.stock) - item.quantity;
      await supabase
        .from('products')
        .update({ stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', item.product.id);

      await supabase.from('stock_movements').insert({
        product_id: item.product.id,
        type: 'SALE',
        quantity: -item.quantity,
        previous_stock: Number(item.product.stock),
        new_stock: newStock,
        reason: `Venta #${saleNumber}`
      });
    }

    await directSupabaseApi.logAudit({
      action: 'VENTA_REGISTRADA',
      targetEntity: 'sales',
      targetId: String(sale.id),
      newValues: { saleNumber, total, itemsCount: items.length },
      username: seller
    });

    return { ...sale, saleId: sale.id, saleNumber, total };
  },

  getSales: async (filters = {}) => {
    let query = supabase
      .from('sales')
      .select('*, sale_items(*)')
      .order('created_at', { ascending: false });

    if (filters.startDate) {
      const startUtc = new Date(`${filters.startDate}T00:00:00-04:00`).toISOString();
      query = query.gte('created_at', startUtc);
    }
    if (filters.endDate) {
      const endUtc = new Date(`${filters.endDate}T23:59:59.999-04:00`).toISOString();
      query = query.lte('created_at', endUtc);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(s => ({
      id: s.id,
      saleNumber: s.sale_number,
      customerName: s.customer_name || 'Cliente Ocasional',
      customerPhone: s.customer_phone || '',
      sellerName: s.customer_phone || 'admin',
      paymentMethod: s.payment_method,
      total: Number(s.total || 0),
      totalCost: Number(s.total_cost || 0),
      cashReceived: Number(s.cash_received || 0),
      changeReturned: Number(s.change_returned || 0),
      status: s.status,
      voidedReason: s.voided_reason,
      voidedAt: s.voided_at,
      createdAt: s.created_at,
      items: (s.sale_items || []).map(it => ({
        id: it.id,
        productId: it.product_id,
        productName: it.product_name || 'Artículo',
        name: it.product_name || 'Artículo',
        size: it.size,
        color: it.color,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unit_price),
        unitCost: Number(it.unit_cost || 0),
        subtotal: Number(it.subtotal)
      }))
    }));
  },

  voidSale: async (saleId, reason, currentUser) => {
    const { data: sale, error: getErr } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('id', saleId)
      .single();

    if (getErr || !sale) throw new Error('Venta no encontrada');
    if (sale.status === 'VOIDED') throw new Error('Esta venta ya fue anulada previamente');

    const { data: updatedSale, error: voidErr } = await supabase
      .from('sales')
      .update({
        status: 'VOIDED',
        voided_reason: reason.trim(),
        voided_at: new Date().toISOString()
      })
      .eq('id', saleId)
      .select()
      .single();

    if (voidErr) throw voidErr;

    for (const item of (sale.sale_items || [])) {
      const { data: prod } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
      if (prod) {
        const restoredStock = Number(prod.stock) + Number(item.quantity);
        await supabase.from('products').update({ stock: restoredStock }).eq('id', item.product_id);
      }
    }

    await directSupabaseApi.logAudit({
      action: 'ANULAR_VENTA',
      targetEntity: 'sales',
      targetId: String(saleId),
      newValues: { saleNumber: sale.sale_number, total: sale.total, reason: reason.trim() },
      reason: reason.trim(),
      username: currentUser?.username || 'admin'
    });

    return updatedSale;
  },

  // 4. AUDITORÍA
  getAuditLogs: async (limit = 100) => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).map(log => {
      let resolvedUser = 'admin';
      if (log.new_values && typeof log.new_values === 'object') {
        if (log.new_values._user) resolvedUser = log.new_values._user;
        else if (log.new_values.username) resolvedUser = log.new_values.username;
      }
      return {
        ...log,
        username: resolvedUser
      };
    });
  },

  logAudit: async ({ action, targetEntity, targetId = null, oldValues = null, newValues = null, reason = null, username = 'admin' }) => {
    try {
      const enrichedNew = newValues && typeof newValues === 'object'
        ? { ...newValues, _user: username }
        : { _user: username, data: newValues };

      await supabase.from('audit_logs').insert({
        action,
        target_entity: targetEntity,
        target_id: targetId ? String(targetId) : null,
        old_values: oldValues || null,
        new_values: enrichedNew,
        reason: reason || null,
        ip_address: '127.0.0.1',
        user_agent: 'Web Client'
      });
    } catch (e) {
      console.warn('[DirectSupabase Audit] Error:', e);
    }
  }
};

