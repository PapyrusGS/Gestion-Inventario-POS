@echo off
title Preparar Inventario para Netlify
color 0A
echo ======================================================================
echo   COMPILANDO SISTEMA PARA NETLIFY DROP (PRODUCCION LISTA)
echo ======================================================================
echo.
echo [1/2] Compilando los componentes y estilos con Vite...
call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERROR] Hubo un problema durante la compilacion.
    pause
    exit /b %errorlevel%
)
echo.
echo [2/2] Verificando archivos de produccion...
if exist "dist\index.html" (
    echo       - dist\index.html [OK]
)
if exist "dist\_redirects" (
    echo       - dist\_redirects [OK]
)
echo.
echo ======================================================================
echo   EXITO: LA CARPETA "dist" ESTA LISTA PARA SUBIR A NETLIFY
echo ======================================================================
echo.
echo INSTRUCCIONES PARA SUBIR EN 3 PASOS:
echo  1. Ve a: https://app.netlify.com/drop en tu navegador.
echo  2. Inicia sesion en tu cuenta de Netlify.
echo  3. Arrastra y suelta la carpeta "dist" dentro del recuadro de Netlify.
echo.
echo NOTA: Debe ser la carpeta "dist" (la que contiene los archivos ya compilados).
echo Tu sistema quedara funcionando en la nube con Supabase, sin errores 502!
echo ======================================================================
echo.
pause

