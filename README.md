# Pulso eléctrico

Panel de precio de la luz por horas en España (PVPC), pensado para tarifas indexadas al mercado como **Octopus Flexi**. Muestra el precio de la hora actual, un resumen en lenguaje natural para decidir qué hacer, y recomendaciones de consumo por aparato según el momento del día.

Es un único archivo HTML autocontenido — sin build, sin dependencias, sin backend propio. Se abre en cualquier navegador y consulta los datos oficiales en directo.

## Contenido

- [Funcionalidades](#funcionalidades)
- [Fuente de datos](#fuente-de-datos)
- [Cómo se calculan los precios](#cómo-se-calculan-los-precios)
- [Uso](#uso)
- [Estructura del archivo](#estructura-del-archivo)
- [Personalización](#personalización)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Aviso legal](#aviso-legal)

## Funcionalidades

- **Precio de la hora actual** en €/kWh, con etiqueta BARATO / MEDIO / CARO.
- **Resumen automático de la mañana**: mejor y peor franja de 3 horas del día, y si merece la pena mover el consumo o no.
- **Nota de patrón de consumo semanal** (editable, ver [Personalización](#personalización)).
- **Gráfico de barras de 24 horas**, coloreado por tramo de precio, con la hora actual marcada y tooltip al pasar el cursor.
- **Pestañas Hoy / Mañana** — la de mañana se activa sola en cuanto REE publica los precios del día siguiente (normalmente entre las 20:00 y las 21:00).
- **Listas de las 4 horas más baratas y más caras** del día.
- **Recomendaciones por aparato** (lavadora, lavavajillas, coche eléctrico, cocinar, ordenador, TV, móvil, etc.), cada uno con su potencia aproximada y nivel de impacto (bajo / medio / alto) en el precio final.
- **Calculadora del término de potencia** contratada (P1/P2), con coste diario y estimación mensual.
- **Actualización automática** cada 10 minutos, y botón de refresco manual.
- Dos secciones desplegables con la explicación técnica de los datos y de qué mueve el precio día a día.

## Fuente de datos

Los precios se leen en tiempo real desde el **archivo público de ESIOS / Red Eléctrica de España (REE)** — el mismo dato oficial que usan las comercializadoras (Endesa, Octopus, etc.) para publicar el precio PVPC:

```
GET https://api.esios.ree.es/archives/70/download_json?locale=es&date=AAAA-MM-DD
```

- No requiere API key ni registro.
- Devuelve el precio **PVPC** final por hora para la Península (campo `PCB`), ya con impuestos y peajes incluidos — no el precio de mercado mayorista en bruto.
- Se hacen dos llamadas por carga: una para hoy y otra para mañana (esta última falla silenciosamente si REE aún no la ha publicado, y la pestaña "Mañana" se desactiva).

## Cómo se calculan los precios

1. **Unidad**: el archivo da el precio en €/MWh (con coma decimal, ej. `"153,59"`) → se convierte a €/kWh dividiendo entre 1000.
2. **Bandas barato / medio / caro**: las 24 horas del día se ordenan de menor a mayor precio y se cortan en terciles. El tercio más barato es BARATO, el de en medio MEDIO, el más caro CARO. Es relativo a cada día, no un umbral fijo en €.
3. **Mejor y peor franja**: se evalúan todas las ventanas de 3 horas consecutivas y se eligen la de media más baja y la de media más alta.
4. **Recomendación por aparato**: aparatos de impacto bajo (<150 W) siempre muestran "cuando quieras", porque el ahorro por mover la hora es de céntimos. Los de impacto medio y alto sí siguen la banda de la hora actual.
5. **Hora de Madrid**: se calcula con `Intl.DateTimeFormat` fijado a `Europe/Madrid`, para que el resultado sea correcto sin importar la zona horaria o el idioma del dispositivo del usuario.

## Uso

1. Descarga `pulso-electrico.html`.
2. Ábrelo con doble clic o arrástralo a cualquier navegador moderno (Chrome, Safari, Firefox, Edge).
3. No hace falta servidor ni instalación — hace las peticiones directamente desde el navegador.

> El navegador necesita conexión a internet para consultar `api.esios.ree.es`. Si el sitio se abre desde `file://`, algunos navegadores pueden bloquear la petición por CORS; en ese caso, sírvelo desde un servidor local sencillo (`python3 -m http.server`) o súbelo a cualquier hosting estático.

## Estructura del archivo

Todo vive en `pulso-electrico.html`:

| Sección | Qué contiene |
|---|---|
| `<style>` | Tema visual (paleta, tipografías, layout responsive) |
| `#loadingState` / `#errorState` | Estados de carga y de error de red |
| `#app` | Contenido principal una vez cargan los datos |
| `<script>` (IIFE) | Fetch a ESIOS, parseo, cálculo de bandas, render de cada sección |

Funciones clave del script:

- `madridParts(offsetDays)` — hora/fecha fiable en zona horaria de Madrid.
- `fetchDay(offsetDays)` / `parsePVPCResponse(json)` — descarga y parseo de precios.
- `computeBands(hours)` — clasifica cada hora en barato/medio/caro.
- `renderChart`, `renderBriefing`, `renderLists`, `renderAppliances` — pintan cada bloque de la UI.
- `computePotencia()` — calculadora del término de potencia contratada.

## Personalización

- **Potencia contratada**: los campos de la calculadora de potencia vienen rellenados con un ejemplo (4,5 kW / 4,5 kW); cualquier usuario los edita directamente en la página.
- **Aparatos**: añade o edita entradas en el array `APPLIANCES` (línea ~652) — cada uno con `emoji`, `name`, `watts` e `impact` (`'bajo' | 'medio' | 'alto'`).
- **Nota de patrón de consumo**: el bloque bajo "Tu patrón de consumo" está escrito a mano con un ejemplo; sustitúyelo por tu propio consumo o elimínalo si no aplica.
- **Colores y tipografías**: variables CSS en `:root` al principio del `<style>`.

## Limitaciones conocidas

- El precio mostrado es el **PVPC oficial**, usado como referencia del patrón horario. Octopus Flexi y otras tarifas indexadas siguen ese mismo patrón, pero añaden su propio margen de gestión, por lo que el céntimo exacto de la factura puede variar ligeramente — para el importe exacto, consulta la app de tu comercializadora.
- Los precios de "mañana" solo están disponibles después de que REE los publique (entre las 20:00 y las 21:00 aprox.); antes de esa hora la pestaña aparece desactivada.
- Los vatios de cada aparato son valores aproximados de uso típico, no una medición del aparato real del usuario.
- Sin backend ni caché propia: cada carga depende de que `api.esios.ree.es` esté disponible.

## Aviso legal

Los datos de precio provienen de una fuente pública oficial (REE/ESIOS) y se muestran con fines informativos. Esta página no está afiliada a Red Eléctrica de España, Octopus Energy ni Endesa. No constituye asesoramiento para la contratación de tarifas; para el precio exacto de tu contrato, consulta siempre a tu comercializadora.
