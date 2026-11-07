import React, { useState, useEffect } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  CheckCircle2, 
  Banknote, 
  Smartphone, 
  X, 
  AlertCircle,
  Building2,
  ImageOff
} from 'lucide-react';
import { db, executeSale } from '../db/db';
import { api } from '../services/api';

export function PointOfSale({ currency = 'Bs.', onSaleCompleted, currentUser, activeBranchId = 1 }) {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [cart, setCart] = useState([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [cashReceived, setCashReceived] = useState('');
  const [lastSaleResult, setLastSaleResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const loadProducts = async () => {
    try {
      const serverProds = await api.getProducts();
      setProducts(serverProds);
      try {
        await db.products.clear();
        await db.products.bulkPut(serverProds.map(p => ({
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          category: p.category,
          sport: p.sport,
          size: p.size,
          color: p.color,
          costPrice: p.costPrice || 0,
          salePrice: p.salePrice,
          stock: p.stock,
          otherStock: p.otherStock,
          minStock: p.minStock,
          imageUrl: p.imageUrl,
          updatedAt: p.updated_at
        })));
      } catch (cacheErr) {
        console.warn('Error cacheando en IndexedDB:', cacheErr);
      }
    } catch (err) {
      console.warn('Servidor inaccesible, usando inventario local IndexedDB:', err);
      const local = await db.products.toArray();
      setProducts(local);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [activeBranchId]);

  const categories = ['todos', ...new Set(products.map(p => p.category).filter(Boolean))];
  
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.barcode && p.barcode.includes(searchTerm)) ||
                          (p.sport && p.sport.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (p.size && p.size.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCat = selectedCategory === 'todos' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const addToCart = (product) => {
    if (product.stock <= 0) return;

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert(`Existencias insuficientes para ${product.name} en esta sucursal.`);
          return prev;
        }
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [...prev, {
          productId: product.id,
          name: product.name,
          size: product.size || '',
          color: product.color || '',
          sport: product.sport || '',
          price: product.salePrice,
          costPrice: product.costPrice || 0,
          quantity: 1,
          maxStock: product.stock
        }];
      }
    });
  };

  const updateQuantity = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return null;
        if (newQty > item.maxStock) {
          alert(`Cantidad máxima disponible: ${item.maxStock} unidades.`);
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(Boolean));
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const clearCart = () => setCart([]);

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleConfirmSale = async () => {
    if (cart.length === 0) return;
    setErrorMsg('');

    const cashValue = Number(cashReceived) || cartTotal;
    if (paymentMethod === 'efectivo' && cashReceived !== '' && cashValue < cartTotal) {
      setErrorMsg('El monto recibido es menor al total a pagar.');
      return;
    }

    try {
      let result;
      try {
        result = await api.createSale({
          items: cart.map(it => ({
            productId: it.productId,
            productName: it.name,
            size: it.size || '',
            color: it.color || '',
            quantity: it.quantity,
            unitPrice: it.price
          })),
          paymentMethod: paymentMethod === 'efectivo' ? 'cash' : (paymentMethod === 'qr' ? 'qr' : 'transfer'),
          cashReceived: cashValue,
          changeReturned: Math.max(0, cashValue - cartTotal),
          branchId: activeBranchId
        });
      } catch (apiErr) {
        console.warn('API error o sin conexión, procesando localmente en IndexedDB:', apiErr);
        result = await executeSale({
          items: cart,
          paymentMethod,
          cashReceived: cashValue
        });
      }

      setLastSaleResult({
        ...result,
        total: cartTotal,
        paymentMethod,
        cashReceived: cashValue,
        changeGiven: Math.max(0, cashValue - cartTotal),
        items: [...cart]
      });

      clearCart();
      setIsCheckoutOpen(false);
      setCashReceived('');
      await loadProducts();

      if (onSaleCompleted) onSaleCompleted();
    } catch (err) {
      setErrorMsg(err.message || 'Error al procesar la venta.');
    }
  };

  const roundBills = [10, 20, 50, 100, 200].filter(v => v >= cartTotal);

  return (
    <div className="pos-grid">
      {/* Catalogo de productos */}
      <div className="catalog-panel">
        <div className="catalog-search-bar">
          <div className="search-input-wrapper">
            <Search size={20} />
            <input 
              type="text"
              placeholder="Buscar por nombre o código de barras..."
              className="search-input-field"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')} 
              className="btn-secondary"
              style={{ padding: '0.65rem 0.85rem' }}
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Categorias */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 1rem', overflowX: 'auto', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.85rem',
                fontWeight: 600,
                background: selectedCategory === cat ? '#0f172a' : '#ffffff',
                color: selectedCategory === cat ? '#ffffff' : '#475569',
                border: '1px solid #cbd5e1'
              }}
            >
              {cat === 'todos' ? 'Todos' : cat}
            </button>
          ))}
        </div>

        {/* Grilla de productos */}
        <div className="products-grid">
          {filteredProducts.map(p => {
            const isOutOfStock = (p.stock || 0) <= 0;
            const isLowStock = !isOutOfStock && p.stock <= (p.minStock || 5);

            return (
              <button
                key={p.id}
                onClick={() => !isOutOfStock && addToCart(p)}
                disabled={isOutOfStock}
                className={`product-card ${isOutOfStock ? 'out-of-stock' : ''}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '0.65rem',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '12px',
                  background: '#ffffff',
                  minHeight: 'auto',
                  overflow: 'hidden'
                }}
              >
                <div style={{ width: '100%', marginBottom: '0.4rem' }}>
                  {p.imageUrl ? (
                    <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', marginBottom: '0.4rem' }}>
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: '8px', background: '#f8fafc', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.4rem' }}>
                      <ImageOff size={22} color="#cbd5e1" />
                    </div>
                  )}
                  <div style={{
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    color: '#0f172a',
                    lineHeight: 1.25,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    minHeight: '2.3em'
                  }}>
                    {p.name}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  paddingTop: '0.35rem',
                  borderTop: '1px solid #f1f5f9',
                  gap: '0.4rem'
                }}>
                  <span className={`product-stock-badge ${isOutOfStock ? 'stock-empty' : isLowStock ? 'stock-low' : 'stock-good'}`} style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {isOutOfStock ? 'Agotado' : `${p.stock} unid.`}
                  </span>
                  <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#059669', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>
                    {currency}{Number(p.salePrice).toFixed(2)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel lateral: Detalle de venta */}
      <div className="cart-panel">
        <div className="cart-header">
          <div className="cart-title">
            <ShoppingCart size={22} color="#2563eb" />
            <span>Detalle de Venta</span>
          </div>
          {cart.length > 0 && (
            <button 
              onClick={clearCart} 
              style={{ background: 'none', color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}
            >
              Vaciar
            </button>
          )}
        </div>

        {/* Lista de articulos */}
        <div className="cart-items-list">
          {cart.length === 0 ? (
            <div className="cart-empty-message">
              <ShoppingCart size={44} strokeWidth={1.5} />
              <p style={{ fontWeight: 600, color: '#64748b' }}>No hay productos en la orden</p>
              <p style={{ fontSize: '0.85rem' }}>Seleccione productos del catálogo para agregarlos.</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.productId} className="cart-item-row">
                <div className="cart-item-info">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-subtext">
                    {currency}{Number(item.price).toFixed(2)} c/u | Total: {currency}{(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>

                <div className="cart-item-controls">
                  <button onClick={() => updateQuantity(item.productId, -1)} className="btn-qty">
                    <Minus size={14} />
                  </button>
                  <span className="cart-item-qty">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.productId, 1)} className="btn-qty">
                    <Plus size={14} />
                  </button>
                  <button 
                    onClick={() => removeFromCart(item.productId)} 
                    style={{ background: 'none', color: '#94a3b8', padding: '4px' }}
                    title="Eliminar artículo"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pie de orden y boton de cobro */}
        <div className="cart-footer">
          <div className="cart-total-box">
            <span className="cart-total-label">Total a pagar:</span>
            <span className="cart-total-number">{currency}{cartTotal.toFixed(2)}</span>
          </div>

          <button
            onClick={() => setIsCheckoutOpen(true)}
            disabled={cart.length === 0}
            className="btn-touch-primary"
            style={{ width: '100%', opacity: cart.length === 0 ? 0.5 : 1 }}
          >
            <span>Cobrar {currency}{cartTotal.toFixed(2)}</span>
          </button>
        </div>
      </div>

      {/* Modal de cobro */}
      {isCheckoutOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Cobro de Venta</h3>
              <button onClick={() => setIsCheckoutOpen(false)} style={{ background: 'none' }}>
                <X size={24} color="#64748b" />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>Total a cobrar</span>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
                  {currency}{cartTotal.toFixed(2)}
                </div>
              </div>

              {/* Formas de pago */}
              <div className="form-label" style={{ marginBottom: '0.5rem' }}>Método de pago</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('efectivo')}
                  className={`payment-btn ${paymentMethod === 'efectivo' ? 'active' : ''}`}
                >
                  <Banknote size={26} color={paymentMethod === 'efectivo' ? '#2563eb' : '#64748b'} />
                  <span>Efectivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('transferencia')}
                  className={`payment-btn ${paymentMethod === 'transferencia' ? 'active' : ''}`}
                >
                  <Smartphone size={26} color={paymentMethod === 'transferencia' ? '#2563eb' : '#64748b'} />
                  <span>Transferencia / QR</span>
                </button>
              </div>

              {/* Pago en efectivo */}
              {paymentMethod === 'efectivo' && (
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label className="form-label">Efectivo recibido</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="0.00"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setCashReceived(cartTotal.toString())}
                      style={{ padding: '0.35rem 0.75rem', background: '#e2e8f0', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}
                    >
                      Monto exacto
                    </button>
                    {roundBills.map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCashReceived(val.toString())}
                        style={{ padding: '0.35rem 0.75rem', background: '#e2e8f0', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}
                      >
                        {currency}{val}
                      </button>
                    ))}
                  </div>

                  {cashReceived && Number(cashReceived) >= cartTotal && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#dcfce7', padding: '0.75rem 1rem', borderRadius: '8px', color: '#15803d', fontWeight: 700 }}>
                      <span>Cambio a entregar:</span>
                      <span style={{ fontSize: '1.3rem' }}>{currency}{(Number(cashReceived) - cartTotal).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {errorMsg && (
                <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600 }}>
                  <AlertCircle size={18} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirmSale}
                className="btn-touch-primary"
                style={{ width: '100%' }}
              >
                <CheckCircle2 size={24} />
                <span>Confirmar Cobro</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmacion de venta */}
      {lastSaleResult && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ width: '70px', height: '70px', background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: '#16a34a' }}>
              <CheckCircle2 size={46} />
            </div>

            <h3 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.25rem' }}>Venta Registrada</h3>
            <p style={{ color: '#64748b', marginBottom: '1.25rem' }}>Comprobante {lastSaleResult.saleNumber}</p>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #e2e8f0', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Método de pago:</span>
                <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>
                  {lastSaleResult.paymentMethod}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Total cobrado:</span>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '#059669' }}>
                  {currency}{lastSaleResult.total.toFixed(2)}
                </span>
              </div>
              {lastSaleResult.changeGiven > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 700, borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
                  <span>Cambio entregado:</span>
                  <span>{currency}{lastSaleResult.changeGiven.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => setLastSaleResult(null)}
                className="btn-touch-primary"
                style={{ flex: 1 }}
              >
                Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
