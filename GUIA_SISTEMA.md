# CajaClara - Sistema de Control de Ventas e Inventario

Sistema de punto de venta y gestión de inventario para operación local.

- Moneda de operación: Bolivianos (Bs.)
- Denominaciones para cálculo de cambio: Bs. 10, Bs. 20, Bs. 50, Bs. 100, Bs. 200

---

## Acceso local

- Dirección local: http://localhost:5173/

---

## Reglas de negocio y validaciones

### 1. Moneda de registro
Todas las operaciones de venta, costos de adquisición, cobros y arqueos se registran en Bolivianos (Bs.).

### 2. Control de existencias e inventario
- Los valores de precio de venta, costo de adquisición, inventario inicial y nivel mínimo deben ser números positivos.
- El registro inicial de existencias admite un máximo de 300 unidades por artículo.
- La entrada de mercadería cuenta con incrementos rápidos de 6, 12, 24, 50, 100 y 200 unidades.

### 3. Restricción de eliminación de productos
- No es posible eliminar artículos del catálogo mientras mantengan existencias mayores a cero.
- Únicamente se permite dar de baja definitiva productos en estado agotado (cero existencias).

### 4. Punto de venta y despacho
- Registro de transacciones mediante pago en efectivo o transferencia bancaria / QR.
- Cálculo automático de cambio en cobros en efectivo.
