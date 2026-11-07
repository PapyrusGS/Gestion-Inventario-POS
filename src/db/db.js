import Dexie from 'dexie';

export const db = new Dexie('CajaClaraDB');

db.version(1).stores({
  products: '++id, name, barcode, category, stock, minStock, updatedAt, syncStatus',
  sales: '++id, saleNumber, total, paymentMethod, customerName, status, createdAt, syncStatus',
  stockMovements: '++id, productId, type, quantity, createdAt',
  settings: 'key',
  syncQueue: '++id, action, entity, entityId, timestamp, payload'
});

// Seed business settings and ensure clean start
export async function seedInitialDataIfNeeded() {
  const current = await db.settings.get('businessName');
  if (!current || current?.value?.includes('Carlos') || current?.value?.includes('Clara') || current?.value === 'Sistema Venta - Inventario') {
    await db.settings.put({ key: 'businessName', value: 'Sistema de Inventario Venta' });
  }

  // Remove legacy grocery demo items from local Dexie cache so database starts clean at 0
  try {
    const legacyProds = await db.products.where('category').anyOf(['Abarrotes', 'Lácteos', 'Bebidas', 'Frescos', 'Despensa', 'Limpieza']).toArray();
    if (legacyProds.length > 0) {
      const ids = legacyProds.map(p => p.id);
      await db.products.bulkDelete(ids);
    }
  } catch (e) {
    console.warn('Error limpiando productos de demostración:', e);
  }

  // Initial business settings
  const hasSettings = await db.settings.get('currency');
  if (!hasSettings) {
    await db.settings.bulkPut([
      { key: 'businessName', value: 'Sistema de Inventario Venta' },
      { key: 'currency', value: 'Bs.' },
      { key: 'ownerName', value: 'Administrador' }
    ]);
  }
}

// Atomic Sale Transaction: registers sale, adjusts stock, logs movement
export async function executeSale({ items, paymentMethod, customerName = '', customerPhone = '', cashReceived = 0 }) {
  return await db.transaction('rw', [db.products, db.sales, db.stockMovements, db.syncQueue], async () => {
    let total = 0;
    let totalCost = 0;

    for (const item of items) {
      const product = await db.products.get(item.productId);
      if (!product) {
        throw new Error(`Producto ${item.productName} no encontrado.`);
      }

      const newStock = (product.stock || 0) - item.quantity;
      await db.products.update(item.productId, {
        stock: newStock,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending'
      });

      // Stock movement log
      await db.stockMovements.add({
        productId: item.productId,
        productName: product.name,
        type: 'salida_venta',
        quantity: item.quantity,
        previousStock: product.stock,
        newStock: newStock,
        createdAt: new Date().toISOString()
      });

      total += item.price * item.quantity;
      totalCost += (product.costPrice || 0) * item.quantity;
    }

    const saleCount = await db.sales.count();
    const saleNumber = `#V-${String(saleCount + 1).padStart(5, '0')}`;
    const now = new Date().toISOString();

    const saleId = await db.sales.add({
      saleNumber,
      items: items.map(it => ({
        productId: it.productId,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        subtotal: it.price * it.quantity
      })),
      total,
      totalCost,
      estimatedProfit: total - totalCost,
      paymentMethod, // 'efectivo', 'transferencia', 'fiado'
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      cashReceived: paymentMethod === 'efectivo' ? (cashReceived || total) : total,
      changeGiven: paymentMethod === 'efectivo' ? Math.max(0, (cashReceived || total) - total) : 0,
      status: 'completada',
      createdAt: now,
      syncStatus: 'pending'
    });

    // Add to sync queue for cloud sync
    await db.syncQueue.add({
      action: 'CREATE_SALE',
      entity: 'sales',
      entityId: saleId,
      timestamp: now,
      payload: { saleNumber, total, paymentMethod, customerName }
    });

    return { saleId, saleNumber, total };
  });
}

// Add stock (Mercadería nueva)
export async function addProductStock(productId, quantity, newCostPrice = null) {
  return await db.transaction('rw', [db.products, db.stockMovements, db.syncQueue], async () => {
    const product = await db.products.get(productId);
    if (!product) throw new Error('Producto no encontrado');

    const newStock = Number(product.stock || 0) + Number(quantity);
    const updates = {
      stock: newStock,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    };
    if (newCostPrice !== null && !isNaN(newCostPrice) && newCostPrice > 0) {
      updates.costPrice = Number(newCostPrice);
    }

    await db.products.update(productId, updates);

    await db.stockMovements.add({
      productId,
      productName: product.name,
      type: 'entrada',
      quantity: Number(quantity),
      previousStock: product.stock,
      newStock: newStock,
      createdAt: new Date().toISOString()
    });

    await db.syncQueue.add({
      action: 'UPDATE_STOCK',
      entity: 'products',
      entityId: productId,
      timestamp: new Date().toISOString(),
      payload: { quantity, newStock }
    });

    return newStock;
  });
}

// Cobrar fiado
export async function payFiado(saleId) {
  return await db.transaction('rw', [db.sales, db.syncQueue], async () => {
    const sale = await db.sales.get(saleId);
    if (!sale) throw new Error('Venta no encontrada');

    await db.sales.update(saleId, {
      status: 'completada',
      paidAt: new Date().toISOString(),
      syncStatus: 'pending'
    });

    await db.syncQueue.add({
      action: 'PAY_FIADO',
      entity: 'sales',
      entityId: saleId,
      timestamp: new Date().toISOString(),
      payload: { status: 'completada' }
    });
  });
}

// Export database for Disaster Recovery / Backup to File or WhatsApp
export async function exportDatabaseBackup() {
  const products = await db.products.toArray();
  const sales = await db.sales.toArray();
  const stockMovements = await db.stockMovements.toArray();
  const settings = await db.settings.toArray();

  const backupData = {
    version: 1,
    appName: 'SistemaInventarioVenta',
    exportedAt: new Date().toISOString(),
    data: {
      products,
      sales,
      stockMovements,
      settings
    }
  };

  await db.settings.put({ key: 'lastBackup', value: new Date().toISOString() });

  return backupData;
}

// Restore database from JSON backup file
export async function restoreDatabaseBackup(backupData) {
  if (!backupData || !backupData.data) {
    throw new Error('El archivo no es un respaldo válido del sistema.');
  }

  return await db.transaction('rw', [db.products, db.sales, db.stockMovements, db.settings, db.syncQueue], async () => {
    await db.products.clear();
    await db.sales.clear();
    await db.stockMovements.clear();
    await db.settings.clear();
    await db.syncQueue.clear();

    if (backupData.data.products?.length) {
      await db.products.bulkAdd(backupData.data.products);
    }
    if (backupData.data.sales?.length) {
      await db.sales.bulkAdd(backupData.data.sales);
    }
    if (backupData.data.stockMovements?.length) {
      await db.stockMovements.bulkAdd(backupData.data.stockMovements);
    }
    if (backupData.data.settings?.length) {
      await db.settings.bulkPut(backupData.data.settings);
    }

    return true;
  });
}
