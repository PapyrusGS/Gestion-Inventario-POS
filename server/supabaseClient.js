// Cargar variables de entorno locales si existen
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch (e) {
  // Ignorado en producción / Netlify donde las variables vienen inyectadas
}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://uruveaadqbhvwtmnqwds.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'dummy_key_to_prevent_import_crash';

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper de auditoría en Supabase
export async function logSupabaseAudit(req, { action, targetEntity, targetId = null, oldValues = null, newValues = null, reason = null }) {
  try {
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req?.headers?.['user-agent'] || 'DESCONOCIDO';

    await supabaseAdmin.from('audit_logs').insert({
      action,
      target_entity: targetEntity,
      target_id: targetId ? String(targetId) : null,
      old_values: oldValues || null,
      new_values: newValues || null,
      reason: reason || null,
      ip_address: String(ipAddress),
      user_agent: String(userAgent)
    });
  } catch (err) {
    console.warn('[Supabase Audit] Error guardando log en Supabase:', err.message);
  }
}

// 0. USUARIOS (AUTENTICACIÓN EN BASE DE DATOS SUPABASE)
export async function getSupabaseUser(username) {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('username', username.trim())
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[Supabase User] Error consultando tabla users:', err.message);
    return null;
  }
}

// 1. PRODUCTOS
export async function getSupabaseProducts(isOwner = false) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;

  return (data || []).map(p => ({
    id: p.id,
    uuid: p.uuid,
    name: p.name,
    category: p.category,
    sport: p.sport || 'General',
    size: p.size || 'Estándar',
    color: p.color || 'Surtido',
    costPrice: isOwner ? Number(p.cost_price || 0) : 0,
    salePrice: Number(p.sale_price || 0),
    stock: Number(p.stock || 0),
    minStock: Number(p.min_stock || 5),
    imageUrl: p.image_url || null,
    description: p.description || '',
    isActive: p.is_active,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  }));
}

export async function createSupabaseProduct(productData, user, req) {
  const { name, category, sport, size, color, costPrice, salePrice, minStock, stock, imageUrl, image_url } = productData;
  const finalImageUrl = imageUrl || image_url || null;

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      name: name.trim(),
      category: category || 'Confecciones & Ropa',
      sport: sport || 'General',
      size: size || 'Estándar',
      color: color || 'Surtido',
      cost_price: Number(costPrice || 0),
      sale_price: Number(salePrice || 0),
      stock: Number(stock || 0),
      min_stock: Number(minStock || 5),
      image_url: finalImageUrl ? finalImageUrl.trim() : null,
      is_active: true
    })
    .select()
    .single();

  if (error) throw error;

  // Registrar movimiento inicial de stock si stock > 0
  if (Number(stock || 0) > 0) {
    await supabaseAdmin.from('stock_movements').insert({
      product_id: data.id,
      type: 'PURCHASE',
      quantity: Number(stock),
      previous_stock: 0,
      new_stock: Number(stock),
      reason: 'Inventario inicial al registrar producto'
    });
  }

  await logSupabaseAudit(req, {
    action: 'CREAR_PRODUCTO',
    targetEntity: 'products',
    targetId: String(data.id),
    newValues: { name, category, costPrice, salePrice, stock: Number(stock || 0), imageUrl: finalImageUrl }
  });

  return data;
}

export async function updateSupabaseProduct(id, productData, user, req) {
  const { name, category, sport, size, color, costPrice, salePrice, minStock, stock, imageUrl, image_url } = productData;
  const finalImageUrl = imageUrl || image_url;

  // Obtener producto actual
  const { data: current, error: getErr } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (getErr || !current) throw new Error('Producto no encontrado en Supabase');

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (category !== undefined) updates.category = category;
  if (sport !== undefined) updates.sport = sport;
  if (size !== undefined) updates.size = size;
  if (color !== undefined) updates.color = color;
  if (costPrice !== undefined) updates.cost_price = Number(costPrice);
  if (salePrice !== undefined) updates.sale_price = Number(salePrice);
  if (minStock !== undefined) updates.min_stock = Number(minStock);
  if (stock !== undefined) updates.stock = Number(stock);
  if (finalImageUrl !== undefined) updates.image_url = finalImageUrl ? finalImageUrl.trim() : null;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // Si hubo cambio de stock manual
  if (stock !== undefined && Number(stock) !== Number(current.stock)) {
    const diff = Number(stock) - Number(current.stock);
    await supabaseAdmin.from('stock_movements').insert({
      product_id: id,
      type: 'ADJUSTMENT',
      quantity: diff,
      previous_stock: Number(current.stock),
      new_stock: Number(stock),
      reason: 'Edición directa de existencias en formulario de producto'
    });
  }

  await logSupabaseAudit(req, {
    action: 'MODIFICAR_PRODUCTO',
    targetEntity: 'products',
    targetId: String(id),
    oldValues: { name: current.name, costPrice: current.cost_price, salePrice: current.sale_price, stock: current.stock },
    newValues: { name: updates.name, costPrice: updates.cost_price, salePrice: updates.sale_price, stock: updates.stock }
  });

  return data;
}

export async function adjustSupabaseStock(productId, newStock, reason, user, req) {
  const { data: current, error: getErr } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (getErr || !current) throw new Error('Producto no encontrado en Supabase');

  const prevStock = Number(current.stock || 0);
  const finalStock = Number(newStock);
  const diff = finalStock - prevStock;

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ stock: finalStock, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .select()
    .single();

  if (error) throw error;

  await supabaseAdmin.from('stock_movements').insert({
    product_id: productId,
    type: 'ADJUSTMENT',
    quantity: diff,
    previous_stock: prevStock,
    new_stock: finalStock,
    reason: reason.trim()
  });

  await logSupabaseAudit(req, {
    action: 'AJUSTE_INVENTARIO',
    targetEntity: 'products',
    targetId: String(productId),
    oldValues: { stock: prevStock },
    newValues: { stock: finalStock, difference: diff },
    reason: reason.trim()
  });

  return data;
}

// 2. VENTAS
export async function createSupabaseSale(saleData, user, req) {
  const { items, paymentMethod, customerName, customerPhone, cashReceived, changeReturned, clientSaleNumber } = saleData;

  if (!items || !items.length) {
    throw new Error('La venta debe contener al menos un producto.');
  }

  // 1. Verificar stock disponible en Supabase
  let total = 0;
  let totalCost = 0;
  const productsToUpdate = [];

  for (const it of items) {
    const { data: prod, error: pErr } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', it.productId)
      .single();

    if (pErr || !prod) {
      throw new Error(`Producto ${it.productName || it.productId} no encontrado en Supabase.`);
    }

    if (Number(prod.stock) < Number(it.quantity)) {
      throw new Error(`Stock insuficiente para "${prod.name}". Disponible: ${prod.stock}, Solicitado: ${it.quantity}`);
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

  // 2. Generar número correlativo de venta
  const todayStr = new Date().toISOString().split('T')[0];
  const { count } = await supabaseAdmin
    .from('sales')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${todayStr}T00:00:00Z`);

  const saleNumber = clientSaleNumber || `VENTA-${String((count || 0) + 1).padStart(4, '0')}`;

  // 3. Insertar venta
  const { data: sale, error: saleErr } = await supabaseAdmin
    .from('sales')
    .insert({
      sale_number: saleNumber,
      customer_name: customerName || 'Cliente Ocasional',
      customer_phone: customerPhone || '',
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

  // 4. Insertar items y decrementar stock
  for (const item of productsToUpdate) {
    await supabaseAdmin.from('sale_items').insert({
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
    await supabaseAdmin
      .from('products')
      .update({ stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', item.product.id);

    await supabaseAdmin.from('stock_movements').insert({
      product_id: item.product.id,
      type: 'SALE',
      quantity: -item.quantity,
      previous_stock: Number(item.product.stock),
      new_stock: newStock,
      reason: `Venta #${saleNumber}`
    });
  }

  await logSupabaseAudit(req, {
    action: 'VENTA_REGISTRADA',
    targetEntity: 'sales',
    targetId: String(sale.id),
    newValues: { saleNumber, total, itemsCount: items.length }
  });

  return sale;
}

export async function getSupabaseSales(filters = {}, isOwner = false) {
  let query = supabaseAdmin
    .from('sales')
    .select(`
      *,
      sale_items (*)
    `)
    .order('created_at', { ascending: false });

  if (filters.startDate) {
    query = query.gte('created_at', `${filters.startDate}T00:00:00Z`);
  }
  if (filters.endDate) {
    query = query.lte('created_at', `${filters.endDate}T23:59:59Z`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(s => ({
    id: s.id,
    uuid: s.uuid,
    saleNumber: s.sale_number,
    customerName: s.customer_name || 'Cliente Ocasional',
    customerPhone: s.customer_phone || '',
    paymentMethod: s.payment_method,
    total: Number(s.total || 0),
    totalCost: isOwner ? Number(s.total_cost || 0) : 0,
    cashReceived: Number(s.cash_received || 0),
    changeReturned: Number(s.change_returned || 0),
    status: s.status,
    voidedReason: s.voided_reason,
    voidedAt: s.voided_at,
    createdAt: s.created_at,
    items: (s.sale_items || []).map(it => ({
      id: it.id,
      productId: it.product_id,
      productName: it.product_name,
      size: it.size,
      color: it.color,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unit_price),
      unitCost: isOwner ? Number(it.unit_cost || 0) : 0,
      subtotal: Number(it.subtotal)
    }))
  }));
}

export async function voidSupabaseSale(saleId, voidReason, user, req) {
  // Obtener venta con sus items
  const { data: sale, error: getErr } = await supabaseAdmin
    .from('sales')
    .select(`
      *,
      sale_items (*)
    `)
    .eq('id', saleId)
    .single();

  if (getErr || !sale) throw new Error('Venta no encontrada en Supabase.');
  if (sale.status === 'VOIDED') throw new Error('Esta venta ya se encuentra anulada.');

  // Anular venta
  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('sales')
    .update({
      status: 'VOIDED',
      voided_reason: voidReason.trim(),
      voided_at: now
    })
    .eq('id', saleId);

  if (updErr) throw updErr;

  // Restaurar stock de cada item
  for (const it of (sale.sale_items || [])) {
    if (it.product_id) {
      const { data: prod } = await supabaseAdmin
        .from('products')
        .select('stock')
        .eq('id', it.product_id)
        .single();

      if (prod) {
        const prevStock = Number(prod.stock || 0);
        const restoredStock = prevStock + Number(it.quantity);

        await supabaseAdmin
          .from('products')
          .update({ stock: restoredStock, updated_at: now })
          .eq('id', it.product_id);

        await supabaseAdmin.from('stock_movements').insert({
          product_id: it.product_id,
          type: 'VOID',
          quantity: Number(it.quantity),
          previous_stock: prevStock,
          new_stock: restoredStock,
          reason: `Anulación Venta #${sale.sale_number}: ${voidReason.trim()}`
        });
      }
    }
  }

  await logSupabaseAudit(req, {
    action: 'ANULAR_VENTA',
    targetEntity: 'sales',
    targetId: String(saleId),
    oldValues: { status: 'COMPLETED', total: sale.total },
    newValues: { status: 'VOIDED', voidReason }
  });

  return { success: true };
}

// 3. CIERRES DE CAJA
export async function getCurrentSupabaseCashRegister() {
  const { data, error } = await supabaseAdmin
    .from('cash_registers')
    .select('*')
    .eq('status', 'OPEN')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function openSupabaseCashRegister(initialCash, notes, user, req) {
  const { data, error } = await supabaseAdmin
    .from('cash_registers')
    .insert({
      initial_cash: Number(initialCash || 0),
      notes: notes || '',
      status: 'OPEN'
    })
    .select()
    .single();

  if (error) throw error;

  await logSupabaseAudit(req, {
    action: 'APERTURA_CAJA',
    targetEntity: 'cash_registers',
    targetId: String(data.id),
    newValues: { initialCash }
  });

  return data;
}

export async function closeSupabaseCashRegister(countedCash, notes, user, req) {
  const current = await getCurrentSupabaseCashRegister();
  if (!current) throw new Error('No hay una caja abierta actualmente.');

  // Calcular ventas desde opened_at
  const { data: sales } = await supabaseAdmin
    .from('sales')
    .select('*')
    .gte('created_at', current.opened_at)
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

  const expectedCash = Number(current.initial_cash || 0) + cashSales;
  const counted = Number(countedCash || 0);
  const difference = counted - expectedCash;

  const { data, error } = await supabaseAdmin
    .from('cash_registers')
    .update({
      closed_at: new Date().toISOString(),
      cash_sales: cashSales,
      qr_sales: qrSales,
      transfer_sales: transferSales,
      total_sales: totalSales,
      expected_cash: expectedCash,
      counted_cash: counted,
      difference,
      notes: notes || '',
      status: 'CLOSED'
    })
    .eq('id', current.id)
    .select()
    .single();

  if (error) throw error;

  await logSupabaseAudit(req, {
    action: 'CIERRE_CAJA',
    targetEntity: 'cash_registers',
    targetId: String(data.id),
    newValues: { countedCash, expectedCash, difference }
  });

  return data;
}

// 4. AUDITORÍA FORENSE
export async function getSupabaseAuditLogs(limit = 100) {
  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
