import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  AlertTriangle, 
  XCircle, 
  X,
  Edit2,
  SlidersHorizontal,
  ImageOff,
  Upload,
  Loader2
} from 'lucide-react';
import { db } from '../db/db';
import { api } from '../services/api';
import { uploadProductImage } from '../services/supabase';

export function InventoryManager({ currency = 'Bs.', onInventoryChange }) {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  
  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Form states for Create & Edit
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Confecciones & Ropa');
  const [sport, setSport] = useState('Fútbol');
  const [size, setSize] = useState('M');
  const [color, setColor] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState('5');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [formError, setFormError] = useState('');

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    setFormError('');
    try {
      const publicUrl = await uploadProductImage(file);
      setImageUrl(publicUrl);
    } catch (err) {
      setFormError(err.message || 'Error al subir la imagen a Supabase');
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Quick stock adjust state
  const [adjustNewStock, setAdjustNewStock] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState('');

  const loadProducts = async () => {
    try {
      const serverProds = await api.getProducts();
      setProducts(serverProds);
      try {
        await db.products.clear();
        await db.products.bulkPut(serverProds.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          sport: p.sport,
          size: p.size,
          color: p.color,
          costPrice: p.costPrice || 0,
          salePrice: p.salePrice,
          stock: p.stock,
          minStock: p.minStock,
          imageUrl: p.imageUrl,
          updatedAt: p.updated_at
        })));
      } catch (e) {
        console.warn('Error cacheando en IndexedDB:', e);
      }
    } catch (err) {
      console.warn('Servidor inaccesible, cargando datos locales:', err);
      const list = await db.products.toArray();
      setProducts(list);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setCategory('Confecciones & Ropa');
    setSport('Fútbol');
    setSize('M');
    setColor('');
    setSalePrice('');
    setCostPrice('');
    setStock('0');
    setMinStock('5');
    setImageUrl('');
    setFormError('');
    setIsProductModalOpen(true);
  };

  const openEditModal = (p) => {
    setEditingId(p.id);
    setName(p.name || '');
    setCategory(p.category || 'Confecciones & Ropa');
    setSport(p.sport || 'Fútbol');
    setSize(p.size || 'M');
    setColor(p.color || '');
    setSalePrice(String(p.salePrice || ''));
    setCostPrice(String(p.costPrice || ''));
    setStock(String(p.stock !== undefined ? p.stock : 0));
    setMinStock(String(p.minStock || 5));
    setImageUrl(p.imageUrl || '');
    setFormError('');
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('El nombre del producto es obligatorio.');
      return;
    }

    const salePriceNum = Number(salePrice);
    if (isNaN(salePriceNum) || salePriceNum <= 0) {
      setFormError('Ingrese un precio de venta válido.');
      return;
    }

    const costPriceNum = Number(costPrice || 0);
    const stockNum = Number(stock || 0);
    const minStockNum = Number(minStock || 5);

    try {
      await api.saveProduct({
        id: editingId || undefined,
        name: name.trim(),
        category,
        sport,
        size,
        color,
        costPrice: costPriceNum,
        salePrice: salePriceNum,
        stock: stockNum,
        minStock: minStockNum,
        imageUrl: imageUrl.trim()
      });

      setIsProductModalOpen(false);
      await loadProducts();
      if (onInventoryChange) onInventoryChange();
    } catch (err) {
      setFormError(err.message || 'Error al guardar el producto.');
    }
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    setAdjustError('');

    if (!selectedProduct) return;
    const newStk = Number(adjustNewStock);
    if (isNaN(newStk) || newStk < 0) {
      setAdjustError('Ingrese un valor de inventario válido.');
      return;
    }

    if (!adjustReason || adjustReason.trim().length < 4) {
      setAdjustError('Debe ingresar un motivo para registrar este ajuste.');
      return;
    }

    try {
      await api.adjustStock(selectedProduct.id, 1, newStk, adjustReason);
      setIsAdjustModalOpen(false);
      setSelectedProduct(null);
      setAdjustNewStock('');
      setAdjustReason('');
      await loadProducts();
      if (onInventoryChange) onInventoryChange();
    } catch (err) {
      setAdjustError(err.message || 'Error al ajustar inventario.');
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.sport && p.sport.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (p.size && p.size.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()));
    const effectiveStock = p.stock !== undefined ? p.stock : 0;
    if (filterMode === 'low') {
      return matchesSearch && effectiveStock > 0 && effectiveStock <= (p.minStock || 5);
    }
    if (filterMode === 'out') {
      return matchesSearch && effectiveStock <= 0;
    }
    return matchesSearch;
  });

  const lowStockTotal = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= (p.minStock || 5)).length;
  const outOfStockTotal = products.filter(p => (p.stock || 0) <= 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.25rem 0' }}>Inventario de Artículos</h2>
          <p style={{ color: '#64748b', fontSize: '0.88rem', margin: 0 }}>
            Administración unificada de productos, existencias y precios.
          </p>
        </div>

        <button 
          onClick={openCreateModal}
          className="btn-touch-primary"
          style={{ padding: '0.7rem 1.25rem', fontSize: '0.95rem', background: '#0f172a' }}
        >
          <Plus size={18} />
          <span>Nuevo Producto</span>
        </button>
      </div>

      {/* Buscador y filtros */}
      <div className="clean-card" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.75rem 1rem' }}>
        <div className="search-input-wrapper" style={{ flex: '1 1 240px' }}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre, talla o deporte..."
            className="search-input-field"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterMode('all')}
            className={`btn-secondary ${filterMode === 'all' ? 'active-filter' : ''}`}
            style={{ background: filterMode === 'all' ? '#0f172a' : '#ffffff', color: filterMode === 'all' ? '#ffffff' : '#334155', padding: '0.45rem 0.85rem' }}
          >
            Todos ({products.length})
          </button>
          <button
            onClick={() => setFilterMode('low')}
            className="btn-secondary"
            style={{ background: filterMode === 'low' ? '#f59e0b' : '#ffffff', color: filterMode === 'low' ? '#ffffff' : '#b45309', borderColor: '#fde68a', padding: '0.45rem 0.85rem' }}
          >
            <AlertTriangle size={15} />
            <span>Por agotarse ({lowStockTotal})</span>
          </button>
          <button
            onClick={() => setFilterMode('out')}
            className="btn-secondary"
            style={{ background: filterMode === 'out' ? '#ef4444' : '#ffffff', color: filterMode === 'out' ? '#ffffff' : '#b91c1c', borderColor: '#fecaca', padding: '0.45rem 0.85rem' }}
          >
            <XCircle size={15} />
            <span>Agotados ({outOfStockTotal})</span>
          </button>
        </div>
      </div>

      {/* Tabla de Productos Unificada */}
      <div className="clean-card" style={{ overflowX: 'auto', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '680px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.82rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '0.85rem 1rem' }}>Artículo</th>
              <th style={{ padding: '0.85rem 1rem' }}>Categoría / Talla</th>
              <th style={{ padding: '0.85rem 1rem' }}>Precio Venta</th>
              <th style={{ padding: '0.85rem 1rem' }}>Costo Compra</th>
              <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Existencias</th>
              <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  No se registran productos con el criterio indicado.
                </td>
              </tr>
            ) : (
              filteredProducts.map(p => {
                const effectiveStock = p.stock !== undefined ? p.stock : 0;
                const isOut = effectiveStock <= 0;
                const isLow = !isOut && effectiveStock <= (p.minStock || 5);

                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {/* Miniatura de imagen (en blanco si no tiene) */}
                        <div style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <ImageOff size={18} color="#cbd5e1" />
                          )}
                        </div>

                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>{p.name}</div>
                          {p.sport && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {p.sport} {p.color ? `· ${p.color}` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.84rem', color: '#475569' }}>
                      <div>{p.category}</div>
                      {p.size && (
                        <span style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#3730a3', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                          Talla: {p.size}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '0.75rem 1rem', fontWeight: 800, fontSize: '1rem', color: '#059669', fontFamily: 'var(--font-display)' }}>
                      {currency}{Number(p.salePrice).toFixed(2)}
                    </td>

                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.88rem', color: '#475569' }}>
                      {currency}{Number(p.costPrice || 0).toFixed(2)}
                      <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                        +{((Number(p.salePrice) - Number(p.costPrice || 0))).toFixed(2)} {currency}
                      </div>
                    </td>

                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.65rem',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        background: isOut ? '#fee2e2' : (isLow ? '#fef3c7' : '#ecfdf5'),
                        color: isOut ? '#b91c1c' : (isLow ? '#b45309' : '#047857')
                      }}>
                        {effectiveStock} unid.
                      </span>
                    </td>

                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button
                          onClick={() => openEditModal(p)}
                          title="Editar producto"
                          style={{
                            padding: '0.4rem 0.65rem',
                            borderRadius: '6px',
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <Edit2 size={13} />
                          Editar
                        </button>

                        <button
                          onClick={() => {
                            setSelectedProduct(p);
                            setAdjustNewStock(String(p.stock !== undefined ? p.stock : 0));
                            setAdjustError('');
                            setIsAdjustModalOpen(true);
                          }}
                          title="Ajustar inventario"
                          style={{
                            padding: '0.4rem 0.65rem',
                            borderRadius: '6px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            color: '#334155',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <SlidersHorizontal size={13} />
                          Stock
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL CREAR / EDITAR PRODUCTO (SIN PLACEHOLDERS DE EJEMPLO, SIN CODIGO DE BARRA) */}
      {isProductModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                {editingId ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              <button onClick={() => setIsProductModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{ padding: '0.6rem', borderRadius: '6px', background: '#fee2e2', color: '#b91c1c', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>
                  Nombre o Descripción
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              {/* Imagen del Producto (Supabase Storage) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    Foto del Producto (Supabase)
                  </label>
                  <label style={{
                    fontSize: '0.78rem',
                    color: '#2563eb',
                    fontWeight: 700,
                    cursor: isUploadingImage ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    {isUploadingImage ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Subiendo a Supabase...
                      </>
                    ) : (
                      <>
                        <Upload size={13} />
                        Subir desde archivo
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingImage}
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="url"
                    value={imageUrl}
                    placeholder="URL de imagen o sube un archivo arriba"
                    onChange={(e) => setImageUrl(e.target.value)}
                    style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Vista previa"
                      style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1', flexShrink: 0 }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div style={{ width: '40px', height: '40px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ImageOff size={16} color="#cbd5e1" />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>Categoría</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="Confecciones & Ropa">Confecciones & Ropa</option>
                    <option value="Balones & Accesorios">Balones & Accesorios</option>
                    <option value="Calzado Deportivo">Calzado Deportivo</option>
                    <option value="Protección & Accesorios">Protección & Accesorios</option>
                    <option value="Trofeos & Medallas">Trofeos & Medallas</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>Deporte</label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="Fútbol">Fútbol</option>
                    <option value="Básquet">Básquet</option>
                    <option value="Vóley">Vóley</option>
                    <option value="Futsal">Futsal</option>
                    <option value="Entrenamiento">Entrenamiento</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>Talla</label>
                  <input
                    type="text"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>Color</label>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>Precio de Venta ({currency})</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>Costo de Compra ({currency})</label>
                  <input
                    type="number"
                    step="0.5"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>Existencias (Stock)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>Stock Mínimo de Alerta</label>
                  <input
                    type="number"
                    min="1"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', background: '#0f172a', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                >
                  {editingId ? 'Guardar Cambios' : 'Registrar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL AJUSTE DE INVENTARIO */}
      {isAdjustModalOpen && selectedProduct && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '440px', width: '100%', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                Ajuste de Existencias
              </h3>
              <button onClick={() => setIsAdjustModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>{selectedProduct.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Stock actual: {selectedProduct.stock !== undefined ? selectedProduct.stock : 0} unidades
              </div>
            </div>

            {adjustError && (
              <div style={{ padding: '0.6rem', borderRadius: '6px', background: '#fee2e2', color: '#b91c1c', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {adjustError}
              </div>
            )}

            <form onSubmit={handleAdjustStock} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>Nuevo Stock Real</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustNewStock}
                  onChange={(e) => setAdjustNewStock(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1.1rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>Motivo</label>
                <textarea
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  rows="3"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', background: '#0f172a', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                >
                  Aplicar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
