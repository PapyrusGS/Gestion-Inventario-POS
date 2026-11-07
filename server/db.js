import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'inventario.sqlite');
export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode & foreign keys for performance and data integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'OWNER',
      branch_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      sport TEXT DEFAULT 'General',
      size TEXT DEFAULT 'Estándar',
      color TEXT DEFAULT 'Surtido',
      cost_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 5,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branch_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(branch_id, product_id),
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      sale_number TEXT NOT NULL,
      branch_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      customer_name TEXT DEFAULT 'Cliente Ocasional',
      customer_phone TEXT DEFAULT '',
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'qr', 'transfer')),
      total REAL NOT NULL,
      total_cost REAL NOT NULL,
      cash_received REAL DEFAULT 0,
      change_returned REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'VOIDED')),
      voided_reason TEXT,
      voided_by INTEGER,
      voided_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (voided_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      size TEXT,
      color TEXT,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      branch_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('SALE', 'PURCHASE', 'ADJUSTMENT', 'VOID')),
      quantity INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      reason TEXT,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cash_registers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      branch_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      initial_cash REAL NOT NULL DEFAULT 0,
      cash_sales REAL NOT NULL DEFAULT 0,
      qr_sales REAL NOT NULL DEFAULT 0,
      transfer_sales REAL NOT NULL DEFAULT 0,
      total_sales REAL NOT NULL DEFAULT 0,
      expected_cash REAL NOT NULL DEFAULT 0,
      counted_cash REAL,
      difference REAL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED')),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      user_id INTEGER,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      branch_id INTEGER,
      action TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      target_id TEXT,
      old_values TEXT,
      new_values TEXT,
      reason TEXT,
      ip_address TEXT,
      user_agent TEXT
    );
  `);

  // Migrate image_url column in SQLite if it was created previously without it
  try {
    db.exec('ALTER TABLE products ADD COLUMN image_url TEXT;');
  } catch {
    // Column already exists
  }

  // Seed default branches if empty
  const branchCount = db.prepare('SELECT COUNT(*) as count FROM branches').get().count;
  if (branchCount === 0) {
    const now = new Date().toISOString();
    const insertBranch = db.prepare('INSERT INTO branches (code, name, address, phone, created_at) VALUES (?, ?, ?, ?, ?)');
    insertBranch.run('SUC1', 'Sucursal 1 - Tienda Principal', 'Calle Comercio #120', '71000001', now);
    insertBranch.run('SUC2', 'Sucursal 2 - Confecciones y Artículos', 'Calle Comercio #154', '71000002', now);
  }

  // Seed or update to single Administrator account (Husband & Wife)
  const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  const now = new Date().toISOString();
  if (!adminUser) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const insertUser = db.prepare('INSERT INTO users (username, password_hash, full_name, role, branch_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    insertUser.run('admin', adminHash, 'Administración General (Propietarios)', 'OWNER', null, now);
  } else {
    db.prepare('UPDATE users SET full_name = ? WHERE username = ?').run('Administración General (Propietarios)', 'admin');
  }

  // Seed initial sporting goods and confecciones with image URLs
  const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (prodCount === 0) {
    const sampleProducts = [
      {
        uuid: 'prod-001',
        barcode: '7771001001',
        name: 'Camiseta Deportiva DRI-FIT Pro',
        category: 'Confecciones & Ropa',
        sport: 'Fútbol',
        size: 'M',
        color: 'Azul / Blanco',
        cost_price: 35.00,
        sale_price: 65.00,
        min_stock: 10,
        image_url: null,
        stockSuc1: 25,
        stockSuc2: 18
      },
      {
        uuid: 'prod-002',
        barcode: '7771001002',
        name: 'Camiseta Deportiva DRI-FIT Pro',
        category: 'Confecciones & Ropa',
        sport: 'Fútbol',
        size: 'L',
        color: 'Azul / Blanco',
        cost_price: 35.00,
        sale_price: 65.00,
        min_stock: 10,
        image_url: null,
        stockSuc1: 30,
        stockSuc2: 15
      },
      {
        uuid: 'prod-003',
        barcode: '7771001003',
        name: 'Short Deportivo Transpirable',
        category: 'Confecciones & Ropa',
        sport: 'Entrenamiento',
        size: 'M',
        color: 'Negro',
        cost_price: 20.00,
        sale_price: 38.00,
        min_stock: 8,
        image_url: null,
        stockSuc1: 20,
        stockSuc2: 25
      },
      {
        uuid: 'prod-004',
        barcode: '7771001004',
        name: 'Balón de Fútbol N°5 Termosellado',
        category: 'Balones & Accesorios',
        sport: 'Fútbol',
        size: 'N° 5',
        color: 'Blanco / Verde Neón',
        cost_price: 75.00,
        sale_price: 130.00,
        min_stock: 5,
        image_url: null,
        stockSuc1: 12,
        stockSuc2: 6
      },
      {
        uuid: 'prod-005',
        barcode: '7771001005',
        name: 'Balón de Básquetbol Cuero Compuesto',
        category: 'Balones & Accesorios',
        sport: 'Básquet',
        size: 'N° 7',
        color: 'Naranja clásico',
        cost_price: 85.00,
        sale_price: 145.00,
        min_stock: 4,
        image_url: null,
        stockSuc1: 8,
        stockSuc2: 4
      },
      {
        uuid: 'prod-006',
        barcode: '7771001006',
        name: 'Canilleras Reforzadas con Tobillera',
        category: 'Protección & Accesorios',
        sport: 'Fútbol',
        size: 'Adulto',
        color: 'Negro / Rojo',
        cost_price: 22.00,
        sale_price: 45.00,
        min_stock: 6,
        image_url: null,
        stockSuc1: 15,
        stockSuc2: 8
      },
      {
        uuid: 'prod-007',
        barcode: '7771001007',
        name: 'Medias de Fútbol Antideslizantes',
        category: 'Confecciones & Ropa',
        sport: 'Fútbol',
        size: 'Universal',
        color: 'Blanco',
        cost_price: 14.00,
        sale_price: 28.00,
        min_stock: 12,
        image_url: null,
        stockSuc1: 40,
        stockSuc2: 30
      },
      {
        uuid: 'prod-008',
        barcode: '7771001008',
        name: 'Juego de Chalecos de Entrenamiento (x10)',
        category: 'Confecciones & Ropa',
        sport: 'General',
        size: 'Adulto',
        color: 'Amarillo Neón',
        cost_price: 70.00,
        sale_price: 120.00,
        min_stock: 3,
        image_url: null,
        stockSuc1: 5,
        stockSuc2: 3
      },
      {
        uuid: 'prod-009',
        barcode: '7771001009',
        name: 'Servicio de Estampado / Dorsal',
        category: 'Confecciones & Ropa',
        sport: 'Personalizado',
        size: 'Estándar',
        color: 'A elección',
        cost_price: 8.00,
        sale_price: 20.00,
        min_stock: 0,
        image_url: null,
        stockSuc1: 999,
        stockSuc2: 999
      }
    ];

    const insertProd = db.prepare(`
      INSERT INTO products (uuid, barcode, name, category, sport, size, color, cost_price, sale_price, min_stock, image_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertStock = db.prepare(`
      INSERT INTO branch_stocks (branch_id, product_id, stock, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const p of sampleProducts) {
      const res = insertProd.run(
        p.uuid,
        p.barcode,
        p.name,
        p.category,
        p.sport,
        p.size,
        p.color,
        p.cost_price,
        p.sale_price,
        p.min_stock,
        p.image_url,
        now,
        now
      );
      const prodId = Number(res.lastInsertRowid);
      insertStock.run(1, prodId, p.stockSuc1, now);
      insertStock.run(2, prodId, p.stockSuc2, now);
    }
  }
}
