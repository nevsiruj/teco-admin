# TECO — Prototipo MVP

Prototipo autocontenido del MVP de TECO en una sola carpeta.

## Qué muestra

- Ingreso de un mensaje estilo WhatsApp.
- Interpretación del mensaje con un motor LLM.
- Normalización de una unidad de trabajo.
- Validación de datos mínimos.
- Pedido de aclaración si falta información.
- Registro local del trabajo.
- Dashboard personal simple con métricas básicas.
- Envío opcional de la respuesta por Triii.
- Endpoint de webhook para simular entrada real desde Triii.

## Ejecutar

PowerShell:

```powershell
$env:MIMO_API_KEY="tu_clave"
$env:MIMO_MODEL="mimo-v2.5-pro"
$env:MIMO_BASE_URL="https://token-plan-sgp.xiaomimimo.com/v1"
$env:LLM_PROVIDER="MiMo V2.5 Pro"
node server.mjs
```

Luego abrir:

- `http://localhost:8787`

## Configuración

Variables soportadas:

- `MIMO_API_KEY`
- `MIMO_MODEL` (default: `mimo-v2.5-pro`)
- `MIMO_BASE_URL` (default: `https://token-plan-sgp.xiaomimimo.com/v1`)
- `LLM_PROVIDER` (default: `MiMo V2.5 Pro`)
- `TRII_ENDPOINT`
- `TRII_TOKEN`
- `TRII_ID_CANAL`
- `TRII_API_KEY_HEADER` (opcional)
- `HOST` (default: `127.0.0.1`)
- `PORT` (default: `8787`)
- `INSTATUNNEL_SUBDOMAIN` (opcional, default: `teco-preview-gs-2026`)
- `INSTATUNNEL_REQUEST_TIMEOUT` (opcional, default: `45s`)
- `LOGS_DIR` (opcional, default: `./logs`)

## Notas

- El prototipo guarda datos en `works.json`.
- El prototipo guarda trazas estructuradas en `logs/interactions/YYYY-MM-DD.jsonl`.
- Cada línea registra:
  - lo que preguntó el usuario
  - el prompt visible enviado al motor
  - la respuesta cruda/visible del modelo cuando existe
  - el fallback heurístico cuando aplica
  - la respuesta final que ve el usuario
- Los errores del servidor quedan en `logs/server-errors.jsonl`.
- Si el modelo falla o no hay clave, usa una lectura heurística básica para no cortar la demo.
- La clave no debe quedar guardada dentro de los archivos del prototipo.
- El envío por Triii queda apagado salvo que el token y el canal estén configurados.
- El tunnel público usa el mismo puerto configurado en `PORT` salvo que se fuerce `TARGET_PORT`.
- Hay un supervisor alternativo para URL pública con `InstaTunnel`: `npm run public:tunnel:insta`.
