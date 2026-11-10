# 🚀 Guía de Despliegue en Netlify (Método Drag & Drop / Sin GitHub)

Este método te permite publicar el sistema directamente en Netlify **sin usar GitHub, sin gastar minutos de compilación de tu cuenta y sin riesgo de errores 502**.

---

### ¿Por qué se arrastra la carpeta `dist` y no la carpeta raíz?

1. **Código fuente vs Código compilado:**
   - La carpeta raíz del proyecto contiene archivos de desarrollo (`.jsx`, `node_modules`, código TypeScript/React crudo).
   - Los navegadores web no entienden JSX directamente sin un compilador.
   - La carpeta **`dist`** es el resultado de compilar todo el sistema: contiene el HTML, CSS y Javascript empaquetados y optimizados que los navegadores pueden ejecutar a máxima velocidad.

2. **Conexión Directa a Supabase Cloud:**
   - El sistema ahora cuenta con arquitectura **Dual-Mode**:
     - En tu computadora local: se conecta a tu servidor Node local.
     - En Netlify: se conecta directamente a tu base de datos **Supabase Cloud**, lo que elimina por completo el error `502` de funciones caídas.

---

### Pasos para Publicar en Netlify (1 Minuto)

1. **Asegurar la compilación más reciente:**
   - Haz doble clic en el archivo `preparar_para_netlify.bat` (o ejecuta `npm run build` en tu terminal).
   - Esto actualizará automáticamente la carpeta `dist`.

2. **Abrir Netlify Drop:**
   - Abre tu navegador y ve a: [https://app.netlify.com/drop](https://app.netlify.com/drop).
   - Inicia sesión con tu cuenta de Netlify.

3. **Arrastrar y Soltar:**
   - Toma la carpeta **`dist`** que está dentro de `Inventario-Local` y arrástrala hacia el recuadro con líneas punteadas que dice:
     > *"Drag and drop your site folder here"*

4. **¡Listo!:**
   - Netlify publicará tu sitio en 10 segundos y te dará una URL activa (ejemplo: `https://mi-tienda-deportiva.netlify.app`).
   - Puedes iniciar sesión con tu usuario y contraseña de siempre. Todas las ventas, productos y reportes se sincronizarán en tiempo real con Supabase.

