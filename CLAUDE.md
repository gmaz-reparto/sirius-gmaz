# GMAZ Rutas — Blueprint Técnico

> App de gestión de entregas Coca-Cola · Pasto, Nariño, Colombia  
> Desarrollada en 3 sesiones: MAPA DINAMICO → MAPA DINAMICO 2 → MAPA DINAMICO 3

---

## Resumen del proyecto

Single-file PWA (Progressive Web App) que usan los repartidores de Coca-Cola GMAZ en Pasto para registrar entregas, reportar novedades de rechazo y consultar facturas en ruta. El coordinador tiene un panel protegido por PIN para cargar los archivos diarios y monitorear la operación en tiempo real.

**Archivo principal:** `gmaz-rutas-v3.html` (~4500+ líneas)  
**Hosting:** GitHub Pages → `https://gmaz-reparto.github.io/sirius-gmaz/gmaz-rutas-v3.html`  
**Base de datos:** Supabase → `arcymdurfmlubtgfyawn.supabase.co`  
**Mapas:** Google Maps API + Street View

---

## Credenciales (ya están en el HTML — NO cambiar sin avisar)

```js
SUPABASE_URL  = 'https://arcymdurfmlubtgfyawn.supabase.co'
SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  // anon key
GMAPS_KEY     = 'AIzaSyDkHJi_SIHezXS2vmhDBbCtZ62ajSfv9cI'
```

---

## Estructura de la base de datos (Supabase)

### Tabla `clientes_rutas` — SE LIMPIA Y RECARGA CADA DÍA
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | text | Código cliente 12-dígitos (cédula del cliente) |
| nombre | text | Nombre / razón social |
| direccion | text | Dirección de entrega |
| lat | numeric | Latitud (formato colombiano con coma → se convierte) |
| lng | numeric | Longitud |
| ruta | text | Ruta de entrega: KA4V11, KA4V12… |
| CAJA_ | numeric | Cajas a entregar a ese cliente |
| fecha | date | Fecha del día |

**Fuente:** Excel diario `P_PAS_XX.xlsx` — columnas fijas:
- A = código cliente (id)
- B = nombre (Descripción_)
- C = dirección
- F = longitud (Longitud_)
- G = latitud (Latitud_)
- H = ruta (ID_de_ruta_)
- Columna CAJA_: cajas asignadas

**Filtros al subir:** ignorar filas con "Descanso" en columna B, ignorar filas sin código en columna A.

---

### Tabla `maestro_vendedores` — SE ACTUALIZA MENSUAL O CUANDO HAY CAMBIOS
| Columna | Tipo | Descripción |
|---------|------|-------------|
| codigo | text | Código cliente 12-dígitos (llave de cruce con clientes_rutas) |
| nombre_cliente | text | Nombre del cliente |
| ruta_vendedor | text | Ruta de preventa del vendedor: KA4V21, KA4V29… |
| celular_vendedor | text | Celular del vendedor (para llamar y WhatsApp) |

**Lógica clave:** El mismo cliente (mismo código 12-dígitos) puede estar en varias rutas de entrega (KA4V11, KA4V12) pero tiene UN solo vendedor. El maestro vincula el código cliente → vendedor.

---

### Tabla `novedades` — registros de rechazo del día
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | Auto-generado |
| fecha | date | Fecha de la novedad |
| codigo_cliente | text | Código 12-dígitos |
| nombre_cliente | text | Nombre del cliente |
| motivo | text | Uno de los 6 motivos válidos |
| foto_url | text | URL pública en Supabase Storage |
| ruta | text | Ruta de entrega KA4Vxx |
| conductor | text | Nombre del repartidor |
| created_at | timestamptz | Auto-generado |

**IMPORTANTE:** La restricción `motivo_valido` fue eliminada con `DROP CONSTRAINT`. Los 6 motivos válidos son:
1. CLIENTE CERRADO
2. CLIENTE SIN DINERO
3. PEDIDO MAL ELABORADO
4. CLIENTE NO HIZO PEDIDO
5. PRODUCTO NO CARGADO
6. RECHAZO PARCIAL

---

### Tabla `estados_entrega` — progreso guardado para no perder al salir
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | Auto |
| fecha | date | Fecha |
| codigo_cliente | text | Código 12-dígitos |
| nombre_cliente | text | Nombre |
| estado | text | pendiente / entregado / novedad |
| motivo | text | Motivo si es novedad |
| foto_url | text | URL foto si aplica |
| ruta | text | Ruta KA4Vxx |

---

### Tabla `reportes_diarios` — Excel de novedades generado a las 9:45pm
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | Auto |
| fecha | date | Fecha UNIQUE |
| archivo_url | text | URL del Excel en Storage |
| total_novedades | integer | Conteo |
| total_entregados | integer | Conteo |

---

### Supabase Storage — Buckets

| Bucket | Visibilidad | Contenido |
|--------|-------------|-----------|
| `facturas_Gmaz` | PUBLIC | PDFs de facturas y soportes + FACTURAS_INDEX.json |
| `fotos-novedades` | PUBLIC | Fotos de evidencia de rechazos |
| `reportes` | PUBLIC | Archivos Excel de novedades generados |

**Estructura bucket `facturas_Gmaz`:**
```
facturas_Gmaz/
└── 2026-06-08/              ← carpeta por fecha
    ├── FACTURAS_CREDITO.pdf
    ├── SOPORTES.pdf
    └── FACTURAS_INDEX.json  ← índice automático { "12xxxxxxxxxx": [2, 3, 5] }
```

---

## Módulos del sistema

### M1 — Splash Screen
- Pantalla roja GMAZ con animación de puntos pulsantes
- Se oculta al cargar datos (clase `oculto` = `opacity:0 + pointer-events:none`, NO `display:none`)
- Inicia carga de datos desde Supabase en background

---

### M2 — Selección de Ruta
- Tarjetas en 2 columnas, una por ruta activa ese día
- Cada tarjeta muestra: nombre ruta, clientes totales, pendientes (rojo), entregados (verde), cajas totales
- Los datos se leen de `clientes_rutas` agrupados por campo `ruta`
- Al tocar una tarjeta → animación de transición 3 segundos → entra al mapa

**Activar panel coordinador:** 2 clics en texto "GMAZ" del header → pide PIN de 4 dígitos.  
**PIN actual:** `1234` (constante `COORDINADOR_PIN` en el código — cambiar si es necesario)

---

### M3 — Mapa Principal (60% mapa / 40% lista de clientes)
- Google Maps con marcadores numerados (1, 2, 3…) por orden nearest-neighbor desde GPS
- Camión rojo SVG como marcador GPS en tiempo real (`watchPosition`)
- El punto #1 parpadea indicando por dónde empezar
- Lista scrolleable de clientes en panel inferior con buscador
- Al registrar novedad → marcador cambia a amarillo con `!`
- Al marcar entregado → marcador cambia a verde con `✓`
- Botón `←` en header para volver a selección de rutas (sin perder progreso)

**Tacómetro HUD** (franja roja en borde derecho):
- 50% transparente, Military HUD, verde neón
- Se despliega lateralmente con 30% de ancho
- Muestra: % cierre, entregados, rechazos, cajas rechazadas
- Se actualiza cada 30 segundos desde Supabase

---

### M4 — Vista de Cliente (70% Street View / 30% panel botones)
- Street View apunta a la dirección del cliente automáticamente
- Header muestra badge doble: `KA4V11 · KA4V21` (ruta entrega roja · ruta vendedor verde)
- Botones: **[NAVEGAR]** [FACTURAS] [LLAMAR] en fila superior, **[REPORTAR NOVEDAD]** ancho completo

---

### M5 — Navegación GPS
- Traza línea roja desde posición actual hasta cliente seleccionado
- Usa `ultimaPosGPS` del `watchPosition` activo (no pide GPS nuevo cada vez)
- Punto animado que avanza sobre la línea (efecto brillo)
- Si GPS no disponible: mensaje claro pidiendo activar permisos

---

### M6 — Facturas y Soportes
- Lee `FACTURAS_INDEX.json` del Storage (intenta hoy, luego ayer si falla)
- Al tocar Facturas en un cliente → va directo a sus páginas si tiene facturas
- PDF.js renderiza las páginas en canvas
- Extrae códigos `12xxxxxxxxxx` de cada página para indexar
- Envío por WhatsApp: `navigator.share()` con PDF adjunto, fallback con URL `wa.me/57XXXXXXXXXX`
- El índice se regenera automáticamente cada vez que el coordinador sube PDFs nuevos

---

### M7 — Novedades (rechazos)
**Flujo cuando cliente NO tiene novedad previa:**
1. Clic en "Reportar Novedad" → abre cámara automáticamente
2. Foto tomada → aparece modal con foto + selector de motivo (sin texto libre)
3. Foto es OBLIGATORIA — botón confirmar deshabilitado sin foto
4. Al confirmar:
   - Foto sube a `fotos-novedades/YYYY-MM-DD/codigo_timestamp.jpg`
   - Novedad se guarda en tabla `novedades`
   - Estado del cliente se actualiza en `estados_entrega`
   - WhatsApp abre automáticamente al número del vendedor con mensaje preformateado

**Mensaje WhatsApp (emojis universales Android 6+):**
```
🚨 *NOVEDAD DE ENTREGA - GMAZ*

📦 *Cliente:* CAFETERIA SAN FRANCISCO
🔢 *Codigo:* 1210728687
📍 *Direccion:* CL 12 NUMERO 22F 16
🚚 *Ruta entrega:* KA4V12
🕐 *Hora:* 19/05/2026, 09:27 p.m.
❌ *Motivo:* CLIENTE SIN DINERO

📸 *Foto de evidencia:*
https://arcymdurfmlubtgfyawn.supabase.co/storage/v1/object/public/fotos-novedades/...

_Enviado desde GMAZ Rutas_
```

**Flujo cuando cliente YA tiene novedad (logró entregar después):**
1. Clic en "Reportar Novedad" → opción "¿Lograste entregar?"
2. Si confirma → cambia estado a entregado + WhatsApp confirmación al vendedor + borra foto de Storage

---

### M8 — Panel Coordinador (3 pestañas)

**Acceso:** 2 clics en "GMAZ" → PIN de 4 dígitos → panel

**Tab 1 — Rutina diaria (orden estricto mañana):**
1. 📥 Descargar Excel novedades del día anterior → nombre: `Novedades-YYYY-MM-DD.xlsx`
2. 🗑️ Limpiar fotos del día anterior (Supabase Storage)
3. 🗺️ Subir rutas del día (Excel P_PAS_XX.xlsx) + botón borrar
4. 📄 Subir facturas y soportes (PDFs) + botón borrar → genera FACTURAS_INDEX.json automático
5. 👥 Actualizar maestro vendedores (solo cuando haya cambios) + botón borrar

Cada paso muestra su estado al abrir (✅ cargado / ⚠️ vacío).

**Tab 2 — Operación hoy (dashboard tiempo real):**
- Diseño Corporate Red
- Velocímetro con % cierre general
- Total rechazos + cajas rechazadas del día
- Alerta de ruta con más rechazos
- Barras de progreso por ruta con colores semáforo (verde ≥90%, amarillo ≥75%, rojo <75%)
- Detalle de clientes rechazados: nombre, ruta entrega, motivo (ícono), ruta vendedor (badge rojo), cajas (badge amarillo)
- Se actualiza cada 30 segundos

**Tab 3 — Histórico (últimas 7 días):**
- Lista de días con count de novedades
- Botón ↓ Excel por cada día
- Excel incluye: Fecha, Ruta entrega, Código, Cliente, Motivo, Ruta vendedor
- Los datos se toman directo de la tabla `novedades` en Supabase

---

### M9 — Persistencia de progreso
- Al registrar cualquier novedad o entrega → guarda en `estados_entrega`
- Al volver a seleccionar la misma ruta → restaura todos los estados del día
- Sin pérdida de progreso aunque el repartidor cierre el navegador

---

## Flujo diario completo

```
COORDINADOR (cada mañana):
  1. Abre panel (2 toques + PIN)
  2. Descarga Excel novedades de ayer → guárdalo con nombre fecha
  3. Limpia fotos del día anterior
  4. Sube Excel P_PAS_XX (rutas del día) → tabla se limpia y recarga
  5. Sube PDFs facturas/soportes → genera índice automático
  6. Actualiza maestro (si hubo cambios de vendedores)

REPARTIDOR (en ruta):
  1. Abre app en Chrome
  2. Selecciona su ruta (KA4V12, etc.)
  3. El mapa ordena los puntos con nearest-neighbor desde su GPS
  4. Para cada cliente:
     - Sin novedad → cliente queda como ENTREGADO automáticamente
     - Con problema → toca "Reportar Novedad" → foto → motivo → WhatsApp al vendedor
  5. Al terminar puede volver al inicio sin perder lo avanzado

SISTEMA (automático 9:45pm hora Colombia = 2:45am UTC):
  - Edge Function "generar-reporte" genera Excel de novedades
  - Guarda en bucket "reportes" como reporte_YYYY-MM-DD.xlsx
  - Cron job activado con pg_cron en Supabase
```

---

## Detalles de implementación críticos

### La clase `oculto` — IMPORTANTE
```css
.oculto { opacity: 0; pointer-events: none; }
```
**NO usa `display:none`**. Esto permite transiciones CSS. Si un elemento debe estar completamente fuera del DOM usad `style.display = 'none'` explícito.

### Bug histórico resuelto — `cerrarModal()` antes de `abrirNovedad()`
`cerrarModal()` borraba `clienteActual` antes de que `abrirNovedad()` lo leyera. Solución: guardar en variable local `const clienteNovedad = {...clienteActual}` antes de llamar `cerrarModal()`.

### Upload Excel — columnas por posición, no por nombre
La tabla usa posición fija:
- Columna A (índice 0) = código cliente (id)
- Columna B (índice 1) = nombre
- Columna C (índice 2) = dirección
- Columna F (índice 5) = longitud
- Columna G (índice 6) = latitud
- Columna H (índice 7) = ruta

### Coordenadas colombianas
El Excel trae coordenadas con coma decimal (formato colombiano): `-77,272400`. El parser convierte `.replace(',', '.')` antes de `parseFloat`.

### Subida de PDFs — nombres limpios
Antes de subir a Storage, limpiar nombres: `nombre.replace(/[áàäâ]/g,'a')...replace(/[\s()]/g,'_')`. Supabase rechaza tildes, espacios y paréntesis en nombres de archivos.

### Borrado de tabla en Supabase (workaround)
El cliente JS de Supabase no permite `DELETE` sin filtros. Workaround:
```js
fetch(`${SUPABASE_URL}/rest/v1/clientes_rutas?id=neq.DUMMY_NEVER_MATCHES`, {
  method: 'DELETE',
  headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
})
```

### WhatsApp — sin `window.open()` (Chrome bloquea popups)
Usar elemento `<a>` creado dinámicamente:
```js
const a = document.createElement('a');
a.href = 'https://wa.me/57' + celular + '?text=' + encodeURIComponent(mensaje);
a.click();
```

---

## Archivos en el repositorio (D:\gmaz-rutas → github.com/gmaz-reparto/sirius-gmaz)

| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `gmaz-rutas-v3.html` | ACTIVO | App principal — este es el que usan los repartidores |
| `gmaz-rutas-v2.html` | Obsoleto | Versión anterior |
| `gmaz-rutas-v4.html` | Obsoleto | Versión intermedia (reemplazada por v3) |
| `gmaz-comercial-v1.html` | Activo | App comercial separada |
| `index.html` | Activo | Menú de acceso |
| `soportes-gmaz.html` | Activo | Módulo de soportes |
| `ka4v*.html` | Histórico | Versiones estáticas por ruta (obsoletas) |

---

## Cómo hacer cambios sin romper nada

1. **Leer el contexto completo primero** — el archivo tiene 4500+ líneas. Buscar la función a modificar antes de editar.
2. **No cambiar la clase `oculto`** — está diseñada sin `display:none` intencionalmente.
3. **No mover la lógica de `cerrarModal()`** — si se llama antes de leer `clienteActual`, se pierde el cliente.
4. **Al agregar nuevos motivos de rechazo** — la constraint `motivo_valido` fue eliminada, así que no hay validación en DB. Solo hay que agregar la opción al HTML.
5. **Al subir nueva versión a GitHub** — el link `gmaz-reparto.github.io/sirius-gmaz/gmaz-rutas-v3.html` se actualiza automáticamente. Los repartidores no necesitan cambiar nada.
6. **Probar en local** — abrir el archivo directamente en Chrome con doble clic. GPS y vibración requieren HTTPS (no funcionan en local), el resto sí.

---

## Edge Function (generar-reporte)

Desplegada en Supabase. Se activa por cron job a las 2:45am UTC (9:45pm Colombia).  
Genera Excel de novedades del día y lo guarda en bucket `reportes`.

Para re-desplegar si se pierde:
```bash
cd D:\gmaz-rutas
supabase functions deploy generar-reporte --project-ref arcymdurfmlubtgfyawn
```

---

## Estado actual del proyecto (junio 2026)

- [x] Selección de ruta con tarjetas
- [x] Mapa con marcadores numerados y camión GPS
- [x] Street View automático por cliente
- [x] Navegación GPS dentro de la app
- [x] Facturas con PDF.js e índice automático
- [x] Novedades con foto obligatoria y WhatsApp al vendedor
- [x] Panel coordinador con 3 pestañas
- [x] Tacómetro HUD deslizable
- [x] Histórico de novedades 7 días
- [x] Persistencia de progreso en Supabase
- [x] Dashboard de operación en tiempo real
- [x] CAJA_ incluida en tabla para tacómetro
- [x] Buscador de clientes en lista
- [x] Vibración háptica en botones
- [ ] Enrutamiento de toda la ruta de una vez (línea multiparada)
- [ ] Refactorización en módulos separados
