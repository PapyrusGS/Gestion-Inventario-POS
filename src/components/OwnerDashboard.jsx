import React, { useState, useEffect, useCallback } from 'react';
import { 
  Calendar, 
  Banknote, 
  Smartphone, 
  TrendingUp, 
  AlertCircle, 
  FileText, 
  ShoppingBag, 
  Package,
  Ban,
  ShieldCheck,
  Building2,
  Lock,
  X
} from 'lucide-react';
import { db } from '../db/db';
import { api } from '../services/api';

export function OwnerDashboard({ currency = 'Bs.', currentUser, activeBranchId = 1 }) {
  const isOwner = currentUser?.role === 'OWNER';

  const [reportMode, setReportMode] = useState('daily'); // 'daily' | 'range' | 'monthly'
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const [periodSales, setPeriodSales] = useState([]);
  const [criticalProducts, setCriticalProducts] = useState([]);
  const [businessName, setBusinessName] = useState('Sistema de Inventario Venta');

  // Void Sale state (SOLO DUEÑO)
  const [selectedSaleToVoid, setSelectedSaleToVoid] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const setting = await db.settings.get('businessName');
      if (setting?.value && !setting.value.includes('Carlos') && !setting.value.includes('Clara')) {
        setBusinessName(setting.value);
      }

      let allSales = [];
      try {
        const filters = isOwner ? {} : { branchId: activeBranchId };
        allSales = await api.getSales(filters);
      } catch (e) {
        console.warn('Cargando ventas locales de IndexedDB:', e);
        allSales = await db.sales.toArray();
      }

      let filtered = [];
      if (reportMode === 'daily') {
        filtered = allSales.filter(s => s.createdAt && s.createdAt.startsWith(selectedDate));
      } else if (reportMode === 'range') {
        filtered = allSales.filter(s => {
          if (!s.createdAt) return false;
          const saleDate = s.createdAt.split('T')[0];
          return saleDate >= startDate && saleDate <= endDate;
        });
      } else if (reportMode === 'monthly') {
        filtered = allSales.filter(s => s.createdAt && s.createdAt.startsWith(selectedMonth));
      }

      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setPeriodSales(filtered);

      const products = await db.products.toArray();
      const low = products.filter(p => p.stock <= (p.minStock || 5));
      setCriticalProducts(low);
    } catch (err) {
      console.error('Error cargando reportes:', err);
    }
  }, [reportMode, selectedDate, startDate, endDate, selectedMonth, isOwner, activeBranchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVoidSale = async (e) => {
    e.preventDefault();
    setVoidError('');

    if (!voidReason || voidReason.trim().length < 5) {
      setVoidError('Debe ingresar un motivo de anulación detallado (mínimo 5 caracteres).');
      return;
    }

    try {
      await api.voidSale(selectedSaleToVoid.id, voidReason.trim());
      setSelectedSaleToVoid(null);
      setVoidReason('');
      await loadData();
    } catch (err) {
      setVoidError(err.message || 'Error al anular la venta.');
    }
  };

  // Cálculos consolidados del periodo
  const totalSales = periodSales.reduce((sum, s) => sum + s.total, 0);
  const totalCash = periodSales
    .filter(s => s.paymentMethod === 'efectivo')
    .reduce((sum, s) => sum + s.total, 0);
  const totalTransfer = periodSales
    .filter(s => s.paymentMethod === 'transferencia')
    .reduce((sum, s) => sum + s.total, 0);
  const totalProfit = periodSales.reduce((sum, s) => sum + (s.estimatedProfit || 0), 0);

  // Agrupación por días para el modo mensual
  const monthlyBreakdown = React.useMemo(() => {
    if (reportMode !== 'monthly') return [];
    const map = {};
    for (const sale of periodSales) {
      const day = sale.createdAt ? sale.createdAt.split('T')[0] : 'Sin fecha';
      if (!map[day]) {
        map[day] = { day, count: 0, cash: 0, transfer: 0, total: 0, profit: 0 };
      }
      map[day].count += 1;
      map[day].total += sale.total;
      map[day].profit += (sale.estimatedProfit || 0);
      if (sale.paymentMethod === 'efectivo') {
        map[day].cash += sale.total;
      } else {
        map[day].transfer += sale.total;
      }
    }
    // Ordenar ascendente por día
    return Object.values(map).sort((a, b) => a.day.localeCompare(b.day));
  }, [periodSales, reportMode]);

  // Obtener etiqueta legible del periodo actual
  const getPeriodLabel = () => {
    if (reportMode === 'daily') {
      return `Fecha: ${selectedDate}`;
    }
    if (reportMode === 'range') {
      return `Rango: ${startDate} al ${endDate}`;
    }
    const [year, month] = selectedMonth.split('-');
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const monthName = monthNames[parseInt(month, 10) - 1] || selectedMonth;
    return `Mes: ${monthName} de ${year}`;
  };

  // Función de Exportación a PDF formal
  const handleExportPDF = () => {
    const periodLabel = getPeriodLabel();
    const generationDate = new Date().toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let tableRowsHtml = '';
    if (reportMode === 'monthly') {
      tableRowsHtml = `
        <thead>
          <tr style="background:#0f172a; color:#ffffff; font-size:11px;">
            <th style="padding:8px; text-align:left;">Fecha</th>
            <th style="padding:8px; text-align:center;">Operaciones</th>
            <th style="padding:8px; text-align:right;">Efectivo (${currency})</th>
            <th style="padding:8px; text-align:right;">Transf. / QR (${currency})</th>
            <th style="padding:8px; text-align:right;">Total (${currency})</th>
            <th style="padding:8px; text-align:right;">Margen (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${monthlyBreakdown.map(row => `
            <tr style="border-bottom:1px solid #e2e8f0; font-size:11px;">
              <td style="padding:7px 8px; font-weight:600;">${row.day}</td>
              <td style="padding:7px 8px; text-align:center;">${row.count}</td>
              <td style="padding:7px 8px; text-align:right;">${row.cash.toFixed(2)}</td>
              <td style="padding:7px 8px; text-align:right;">${row.transfer.toFixed(2)}</td>
              <td style="padding:7px 8px; text-align:right; font-weight:700;">${row.total.toFixed(2)}</td>
              <td style="padding:7px 8px; text-align:right; color:#059669;">${row.profit.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f1f5f9; font-weight:800; font-size:12px; border-top:2px solid #0f172a;">
            <td style="padding:10px 8px;">TOTAL CONSOLIDADO</td>
            <td style="padding:10px 8px; text-align:center;">${periodSales.length}</td>
            <td style="padding:10px 8px; text-align:right;">${totalCash.toFixed(2)}</td>
            <td style="padding:10px 8px; text-align:right;">${totalTransfer.toFixed(2)}</td>
            <td style="padding:10px 8px; text-align:right; color:#0f172a;">${totalSales.toFixed(2)}</td>
            <td style="padding:10px 8px; text-align:right; color:#059669;">${totalProfit.toFixed(2)}</td>
          </tr>
        </tfoot>
      `;
    } else {
      tableRowsHtml = `
        <thead>
          <tr style="background:#0f172a; color:#ffffff; font-size:11px;">
            <th style="padding:8px; text-align:left;">N° Comprobante</th>
            <th style="padding:8px; text-align:left;">Fecha / Hora</th>
            <th style="padding:8px; text-align:left;">Detalle de Artículos</th>
            <th style="padding:8px; text-align:center;">Método</th>
            <th style="padding:8px; text-align:right;">Total (${currency})</th>
            <th style="padding:8px; text-align:right;">Margen (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${periodSales.map(sale => {
            const timeStr = new Date(sale.createdAt).toLocaleString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
            const itemsStr = sale.items && sale.items.length
              ? sale.items.map(it => `${it.quantity}x ${it.name}`).join(', ')
              : 'Detalle estándar';

            return `
              <tr style="border-bottom:1px solid #e2e8f0; font-size:11px;">
                <td style="padding:7px 8px; font-weight:700;">${sale.saleNumber}</td>
                <td style="padding:7px 8px; color:#475569;">${timeStr}</td>
                <td style="padding:7px 8px; color:#334155;">${itemsStr}</td>
                <td style="padding:7px 8px; text-align:center; text-transform:capitalize;">${sale.paymentMethod}</td>
                <td style="padding:7px 8px; text-align:right; font-weight:700;">${sale.total.toFixed(2)}</td>
                <td style="padding:7px 8px; text-align:right; color:#059669;">${(sale.estimatedProfit || 0).toFixed(2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f1f5f9; font-weight:800; font-size:12px; border-top:2px solid #0f172a;">
            <td colspan="4" style="padding:10px 8px; text-align:right;">TOTAL PERIODO (${periodSales.length} transacciones):</td>
            <td style="padding:10px 8px; text-align:right; color:#0f172a;">${totalSales.toFixed(2)}</td>
            <td style="padding:10px 8px; text-align:right; color:#059669;">${totalProfit.toFixed(2)}</td>
          </tr>
        </tfoot>
      `;
    }

    const printHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Reporte de Ventas y Arqueo - ${businessName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 30px; color: #0f172a; }
          .header-box { border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
          .title { font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
          .subtitle { font-size: 13px; color: #475569; margin-top: 3px; font-weight: 600; }
          .meta-info { font-size: 11px; color: #64748b; text-align: right; line-height: 1.4; }
          .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
          .metric-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; }
          .metric-label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; }
          .metric-val { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 3px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-top: 60px; padding: 0 40px; }
          .sign-box { border-top: 1px solid #94a3b8; text-align: center; padding-top: 6px; font-size: 11px; color: #475569; font-weight: 600; }
          @media print {
            body { padding: 15mm; }
            @page { size: auto; margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div>
            <div class="title">${businessName}</div>
            <div class="subtitle">Reporte Oficial de Ventas y Arqueo de Caja</div>
            <div style="font-size: 12px; color: #1e293b; font-weight: 700; margin-top: 4px;">${periodLabel}</div>
          </div>
          <div class="meta-info">
            <div><strong>Emisión:</strong> ${generationDate}</div>
            <div><strong>Moneda:</strong> Bolivianos (${currency})</div>
            <div><strong>Transacciones:</strong> ${periodSales.length}</div>
          </div>
        </div>

        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-label">Total Vendido</div>
            <div class="metric-val">${currency}${totalSales.toFixed(2)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Efectivo en Caja</div>
            <div class="metric-val">${currency}${totalCash.toFixed(2)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Transferencias / QR</div>
            <div class="metric-val">${currency}${totalTransfer.toFixed(2)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Margen Estimado</div>
            <div class="metric-val" style="color:#059669;">${currency}${totalProfit.toFixed(2)}</div>
          </div>
        </div>

        <div style="font-size: 13px; font-weight: 800; margin-bottom: 6px; text-transform: uppercase;">
          ${reportMode === 'monthly' ? 'Desglose Diario del Mes' : 'Detalle de Operaciones Realizadas'}
        </div>

        <table>
          ${tableRowsHtml}
        </table>

        <div class="signatures">
          <div class="sign-box">Responsable de Caja</div>
          <div class="sign-box">Administración / Gerencia</div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Habilite las ventanas emergentes en el navegador para generar el PDF.');
      return;
    }
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Encabezado con selectores de periodo y accion de exportar PDF */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Cierre de Caja y Reportes</h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            Auditoría de ingresos, arqueo consolidado y generación de reportes en PDF.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Selector de tipo de reporte */}
          <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '10px', padding: '3px' }}>
            <button
              onClick={() => setReportMode('daily')}
              style={{
                border: 'none',
                background: reportMode === 'daily' ? '#0f172a' : 'transparent',
                color: reportMode === 'daily' ? '#ffffff' : '#475569',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Diario
            </button>
            <button
              onClick={() => setReportMode('range')}
              style={{
                border: 'none',
                background: reportMode === 'range' ? '#0f172a' : 'transparent',
                color: reportMode === 'range' ? '#ffffff' : '#475569',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Varios Días
            </button>
            <button
              onClick={() => setReportMode('monthly')}
              style={{
                border: 'none',
                background: reportMode === 'monthly' ? '#0f172a' : 'transparent',
                color: reportMode === 'monthly' ? '#ffffff' : '#475569',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Mensual
            </button>
          </div>

          {/* Inputs de fecha según modo */}
          {reportMode === 'daily' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', padding: '0.4rem 0.85rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
              <Calendar size={18} color="#64748b" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontWeight: 600, color: '#1e293b' }}
              />
            </div>
          )}

          {reportMode === 'range' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', padding: '0.4rem 0.85rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontWeight: 600, color: '#1e293b', fontSize: '0.85rem' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontWeight: 600, color: '#1e293b', fontSize: '0.85rem' }}
              />
            </div>
          )}

          {reportMode === 'monthly' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', padding: '0.4rem 0.85rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
              <Calendar size={18} color="#64748b" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ border: 'none', outline: 'none', fontWeight: 600, color: '#1e293b' }}
              />
            </div>
          )}

          {/* Botón Exportar PDF */}
          <button
            onClick={handleExportPDF}
            className="btn-touch-primary"
            style={{ padding: '0.65rem 1.25rem', fontSize: '0.95rem', background: '#0f172a' }}
            title="Generar e imprimir reporte formal en PDF"
          >
            <FileText size={18} />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de métricas consolidadas del periodo */}
      <div className="metrics-row">
        {/* Efectivo en caja */}
        <div className="metric-card green">
          <div className="metric-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Banknote size={18} color="#10b981" />
            <span>Efectivo en Caja</span>
          </div>
          <div className="metric-number" style={{ color: '#15803d' }}>
            {currency}{totalCash.toFixed(2)}
          </div>
          <div className="metric-sub">
            Cobrado en efectivo durante el periodo
          </div>
        </div>

        {/* Canales digitales */}
        <div className="metric-card blue">
          <div className="metric-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Smartphone size={18} color="#3b82f6" />
            <span>Transferencias y QR</span>
          </div>
          <div className="metric-number" style={{ color: '#1d4ed8' }}>
            {currency}{totalTransfer.toFixed(2)}
          </div>
          <div className="metric-sub">
            Cobros acreditados por canales digitales
          </div>
        </div>

        {/* Total ventas */}
        <div className="metric-card purple">
          <div className="metric-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShoppingBag size={18} color="#8b5cf6" />
            <span>Total Ventas</span>
          </div>
          <div className="metric-number">
            {currency}{totalSales.toFixed(2)}
          </div>
          <div className="metric-sub">
            {periodSales.length} transacciones registradas
          </div>
        </div>

        {/* Margen estimado */}
        <div className="metric-card amber">
          <div className="metric-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <TrendingUp size={18} color="#f59e0b" />
            <span>Margen Estimado</span>
          </div>
          <div className="metric-number" style={{ color: '#b45309' }}>
            {currency}{totalProfit.toFixed(2)}
          </div>
          <div className="metric-sub">
            Ingresos brutos menos costo registrado
          </div>
        </div>
      </div>

      {/* Tabla detallada del reporte */}
      <div className="clean-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
              {reportMode === 'monthly' ? 'Desglose Diario del Mes' : 'Tabla de Transacciones Realizadas'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
              {getPeriodLabel()} • Total registrado: {currency}{totalSales.toFixed(2)}
            </p>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
            {reportMode === 'monthly' ? `${monthlyBreakdown.length} días con ventas` : `${periodSales.length} operaciones`}
          </span>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '480px' }}>
          {reportMode === 'monthly' ? (
            /* Tabla mensual por día */
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '650px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.82rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Fecha</th>
                  <th style={{ padding: '0.85rem', textAlign: 'center' }}>Operaciones</th>
                  <th style={{ padding: '0.85rem', textAlign: 'right' }}>Efectivo</th>
                  <th style={{ padding: '0.85rem', textAlign: 'right' }}>Transferencia / QR</th>
                  <th style={{ padding: '0.85rem', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '0.85rem', textAlign: 'right' }}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {monthlyBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                      No se registran ventas para el mes seleccionado.
                    </td>
                  </tr>
                ) : (
                  monthlyBreakdown.map(row => (
                    <tr key={row.day} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: '#0f172a' }}>{row.day}</td>
                      <td style={{ padding: '0.85rem', textAlign: 'center' }}>{row.count}</td>
                      <td style={{ padding: '0.85rem', textAlign: 'right', color: '#15803d' }}>{currency}{row.cash.toFixed(2)}</td>
                      <td style={{ padding: '0.85rem', textAlign: 'right', color: '#1d4ed8' }}>{currency}{row.transfer.toFixed(2)}</td>
                      <td style={{ padding: '0.85rem', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{currency}{row.total.toFixed(2)}</td>
                      <td style={{ padding: '0.85rem', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{currency}{row.profit.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            /* Tabla detallada de transacciones (diaria o rango) */
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '780px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.82rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Comprobante</th>
                  <th style={{ padding: '0.85rem' }}>Fecha / Hora</th>
                  <th style={{ padding: '0.85rem' }}>Artículos Vendidos</th>
                  <th style={{ padding: '0.85rem', textAlign: 'center' }}>Método</th>
                  <th style={{ padding: '0.85rem', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '0.85rem', textAlign: 'right' }}>Margen</th>
                  <th style={{ padding: '0.85rem', textAlign: 'center' }}>Estado</th>
                  <th style={{ padding: '0.85rem', textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {periodSales.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 9 : 7} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                      No se registran ventas en el periodo consultado.
                    </td>
                  </tr>
                ) : (
                  periodSales.map(sale => {
                    const timeStr = new Date(sale.createdAt).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    const itemsSummary = sale.items && sale.items.length
                      ? sale.items.map(it => `${it.quantity}x ${it.product_name || it.name}`).join(', ')
                      : 'Artículos de venta';
                    const isVoided = sale.status === 'VOIDED';

                    return (
                      <tr key={sale.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: isVoided ? 0.6 : 1, background: isVoided ? '#fef2f2' : 'transparent' }}>
                        <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: '#0f172a' }}>
                          {sale.saleNumber || sale.sale_number}
                        </td>
                        <td style={{ padding: '0.85rem', fontSize: '0.85rem', color: '#64748b' }}>
                          {timeStr}
                        </td>
                        <td style={{ padding: '0.85rem', fontSize: '0.85rem', color: '#334155', maxWidth: '240px' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                            {itemsSummary}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: sale.paymentMethod === 'efectivo' || sale.payment_method === 'cash' ? '#dcfce7' : '#e0e7ff',
                            color: sale.paymentMethod === 'efectivo' || sale.payment_method === 'cash' ? '#15803d' : '#3730a3',
                            textTransform: 'capitalize'
                          }}>
                            {sale.paymentMethod || sale.payment_method}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                          {currency}{Number(sale.total).toFixed(2)}
                        </td>
                        {isOwner && (
                          <td style={{ padding: '0.85rem', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                            {currency}{Number(sale.profit !== undefined ? sale.profit : (sale.estimatedProfit || 0)).toFixed(2)}
                          </td>
                        )}
                        <td style={{ padding: '0.85rem', textAlign: 'center' }}>
                          {isVoided ? (
                            <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#b91c1c', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 800 }} title={sale.voided_reason || 'Venta Anulada'}>
                              ANULADA
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#047857', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                              VÁLIDA
                            </span>
                          )}
                        </td>
                        {isOwner && (
                          <td style={{ padding: '0.85rem', textAlign: 'center' }}>
                            {!isVoided && (
                              <button
                                onClick={() => {
                                  setSelectedSaleToVoid(sale);
                                  setVoidReason('');
                                  setVoidError('');
                                }}
                                style={{
                                  padding: '0.25rem 0.55rem',
                                  borderRadius: '6px',
                                  background: '#fee2e2',
                                  border: '1px solid #fecaca',
                                  color: '#dc2626',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Anular
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Alerta de existencias en nivel critico */}
      <div className="clean-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={20} color="#f59e0b" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Existencias en Nivel Crítico</h3>
          </div>
          <span style={{ fontSize: '0.8rem', background: '#fef3c7', color: '#b45309', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: 700 }}>
            {criticalProducts.length} artículos
          </span>
        </div>

        {criticalProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
            <Package size={30} style={{ margin: '0 auto 0.5rem', color: '#10b981' }} />
            <p style={{ fontWeight: 600 }}>Nivel de existencias adecuado</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {criticalProducts.map(p => (
              <div 
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  background: p.stock <= 0 ? '#fee2e2' : '#fffbeb',
                  border: `1px solid ${p.stock <= 0 ? '#fecaca' : '#fef3c7'}`,
                  borderRadius: '10px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{p.name}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Nivel mínimo: {p.minStock || 5} unid.
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 800, fontSize: '1.05rem', color: p.stock <= 0 ? '#b91c1c' : '#b45309' }}>
                    {p.stock <= 0 ? 'Agotado' : `${p.stock} unid.`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* MODAL ANULACIÓN DE VENTA (SOLO DUEÑO CON MOTIVO OBLIGATORIO) */}
      {selectedSaleToVoid && (
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b91c1c' }}>
                <Ban size={22} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                  Anulación de Venta #{selectedSaleToVoid.saleNumber || selectedSaleToVoid.sale_number}
                </h3>
              </div>
              <button onClick={() => setSelectedSaleToVoid(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ background: '#fee2e2', border: '1px solid #fecaca', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.82rem', color: '#991b1b' }}>
              Al anular esta venta, <strong>los artículos retornarán automáticamente al inventario</strong> de la tienda y la anulación se registrará permanentemente en la <strong>auditoría forense</strong>.
            </div>

            {voidError && (
              <div style={{ padding: '0.6rem', borderRadius: '6px', background: '#fee2e2', color: '#b91c1c', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {voidError}
              </div>
            )}

            <form onSubmit={handleVoidSale} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>
                  Motivo de Anulación (Obligatorio)
                </label>
                <textarea
                  required
                  rows="3"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedSaleToVoid(null)}
                  style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', background: '#dc2626', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                >
                  Confirmar Anulación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
