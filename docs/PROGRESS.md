# Progreso del proyecto

Bitácora de trabajo. Cada sesión agrega una sección nueva arriba (orden cronológico inverso).

---

## 2026-09-18 — Integración real con TrueLayer (Open Banking)

Rama: `feature/open-banking-integration`

### Contexto

El flujo de "Connect with TrueLayer" existía en el código pero nunca había funcionado: estaba construido contra una API de TrueLayer que no existe (dominios equivocados, endpoint de "consent" inventado, formato de respuesta Open Banking crudo en vez de la Data API real). Esta sesión fue de debugging + implementación end-to-end hasta dejarlo operativo, más la primera versión de detección automática de suscripciones a partir de transacciones bancarias.

### 1. Flujo OAuth de TrueLayer (`src/lib/truelayer/client.ts`, `src/app/api/auth/truelayer/`, `src/app/callback/`)

- Dominios corregidos: `auth.truelayer-sandbox.com` / `api.truelayer-sandbox.com` (antes apuntaba a `sandbox.truelayer.com`, que ni siquiera resuelve).
- Eliminado el paso de "consent" (`POST /auth/consents`) — no existe en la Data API real; el flujo es: redirect directo a `/oauth2/authorize`-equivalente → callback con `code` → `POST /connect/token`.
- `redirect_uri` unificado entre el paso de inicio y el intercambio de token (antes eran distintos, causando `invalid_grant`).
- Nueva ruta `src/app/callback/route.ts` (antes el callback vivía mal ubicado bajo `/api/auth/truelayer`, con un `redirect_uri` que apuntaba a una ruta `/callback` inexistente).
- Endpoints de Data API corregidos: `/data/v1/accounts`, `/data/v1/accounts/{id}/balance`, `/data/v1/accounts/{id}/transactions`, `/data/v1/me` (antes usaba rutas de Open Banking crudo `/open-banking/3.1.9/...`). Respuestas ahora desempaquetadas del envoltorio real `{results, status}`.
- Headers HTTP añadidos según [docs.truelayer.com/docs/http-headers](https://docs.truelayer.com/docs/http-headers): `X-PSU-IP` (IP del usuario, evita rate-limiting de bancos) y `X-Client-Correlation-Id` (UUID por request, para poder correlacionar logs).

### 2. Sesión / autenticación (`src/lib/supabase/client.ts`, `server.ts`, `src/middleware.ts`)

- Cambio a `@supabase/ssr` (`createBrowserClient` / `createServerClient`) — antes la sesión solo vivía en `localStorage`, invisible para el servidor, por lo que el callback de TrueLayer nunca lograba identificar al usuario logueado ("Session expired" persistente).
- `src/middleware.ts` nuevo: refresca la cookie de sesión en cada request.
- `service.ts` de TrueLayer ahora recibe el cliente Supabase autenticado por parámetro en cada función, en vez de usar un cliente global sin sesión (necesario para que las políticas RLS evalúen contra el usuario real).

### 3. Esquema de base de datos (`supabase/migrations/`)

- `002_truelayer_integration.sql`: reemplazado por la versión corregida (la original referenciaba una función de trigger inexistente y nunca corría completa).
- `003_fix_truelayer_schema.sql`: agrega columna `scopes` faltante en `truelayer_connections`, políticas RLS de `INSERT`/`UPDATE` faltantes en `truelayer_accounts` y `detected_subscriptions`.
- `004_fix_truelayer_upsert_constraints.sql`: agrega restricciones `UNIQUE` que faltaban — los `upsert()` del código apuntaban a columnas sin restricción única, por lo que Postgres los rechazaba en silencio (error tragado por el código, nunca se veía en ningún log).
- `005_detected_subscriptions_delete_policy.sql`: política RLS de `DELETE` para poder descartar ("Dismiss") una suscripción detectada.

**Todas corridas manualmente vía SQL Editor de Supabase** (no hay CLI de migraciones configurado en este proyecto).

### 4. Detección de suscripciones (`src/lib/truelayer/service.ts`)

- Filtro por `transaction_category`: solo se consideran `DIRECT_DEBIT`, `STANDING_ORDER`, `PURCHASE`, `BILL_PAYMENT` (excluye `ATM`, `CASH`, `TRANSFER`, `CREDIT`, etc. — ver [transaction-data-reference](https://docs.truelayer.com/docs/transaction-data-reference)).
- Categorización: usa `transaction_classification` de TrueLayer como fuente primaria (mapeado al enum `Category` de la app), con fallback a keywords sobre la descripción cuando TrueLayer no clasifica la transacción (no soportado para `transaction_category = CREDIT` ni fuera de bancos UK/IE/FR).
- Fallback de `merchant_name` → `description`: el sandbox mock de TrueLayer no rellena `merchant_name` en ninguna transacción; ahora se usa `description` (limpiando números de referencia de 4+ dígitos) para poder agrupar transacciones recurrentes igual.
- Fix de bug: el `upsert` reseteaba `is_confirmed` a `false` en cada re-detección, incluso sobre filas ya confirmadas por el usuario. Ahora se omite ese campo del payload de upsert (toma el default solo en inserts nuevos).

### 5. Dashboard (`src/app/dashboard/page.tsx`, `src/lib/supabase/subscriptions.ts`)

- Reemplazado el flujo de conexión bancaria simulado (mock, tabla `bank_connections`, sin lógica real) por datos reales de `truelayer_connections` / `truelayer_accounts`.
- Sección "🔍 Detected Subscriptions": revisión de suscripciones detectadas, agrupadas en acordeón por categoría, con acciones **Confirm** (crea la fila real en `subscriptions`, marca la detectada como confirmada) y **Dismiss** (borra la fila detectada).
- Botón "🔄 Check for subscriptions" por conexión bancaria: re-corre la detección sin necesidad de reconectar el banco.
- Botón "Dismiss" por conexión bancaria: revoca la conexión en TrueLayer y la marca como `revoked` en la DB (`src/app/api/truelayer/disconnect/route.ts`, nuevo).
- Botón "+ Connect another bank" siempre visible (antes desaparecía en cuanto había una conexión).
- Filtros en "Your Subscriptions": por categoría y por método de pago/banco (`paymentMethod`).
- Fix: `getSubscriptions()` ordenaba por `renewalDate` (nombre TS) en vez de `renewal_date` (columna real) — rompía la carga de suscripciones.

### 6. Otros fixes

- Bug de doble `basePath` en navegación client-side (`router.push(BASE_PATH + '/x')` duplicaba el prefijo porque Next ya lo antepone automáticamente cuando `basePath` está configurado). Corregido en todas las páginas.
- Redirect de conveniencia `/` → `/subscription-guardian` en `next.config.ts`.
- Service worker (`public/sw.js`) causaba errores de chunks stale en desarrollo (`next dev` + Turbopack) por cachear JS de forma agresiva; ahora solo se registra en producción, y se desregistra automáticamente si detecta uno instalado durante desarrollo.
- Manejo de errores: varias funciones (`syncAccounts`, `detectSubscriptions`, confirmar/descartar detectadas) tragaban errores de Supabase en silencio (`if (data && !error)` sin loguear el caso contrario) — ahora todas loguean con `console.error`/`console.warn`.

### ⚠️ Bloqueante antes de mergear a `master`: deploy target no coincide con el código

`.github/workflows/deploy.yml` despliega a **GitHub Pages** (hosting 100% estático, sin Node.js) subiendo el directorio `./out`. Pero `next.config.ts` tiene `output: "standalone"` (modo servidor) — con esa config, `npm run build` **no genera `./out`**, así que el deploy fallaría directamente.

Y aunque se corrigiera eso: **todo lo construido en esta sesión requiere servidor** — las rutas API (`/api/auth/truelayer`, `/callback`, `/api/truelayer/detect`, `/api/truelayer/disconnect`), `src/middleware.ts`, y el cliente de Supabase server-side con cookies. Nada de eso puede correr en GitHub Pages. Esto no es algo que se pueda resolver con un ajuste de config — es una decisión de dónde hostear la app (ej. Vercel, un VPS, Railway, etc., cualquiera con runtime de Node) antes de que esta integración funcione en producción.

No lo cambié yo porque no es mi decisión tomar — pero **no mergear a `master` sin resolver esto primero**, o el deploy a producción se rompe.

### Pendiente / conocido

- El "filtro por banco" en el dashboard usa `paymentMethod` (texto libre), no una referencia real a la conexión bancaria — con una sola cuenta de prueba no se puede validar bien la diferenciación entre bancos. Si se necesita distinguir bancos específicos, hay que guardar `connection_id` (o el nombre del proveedor) en `subscriptions` al confirmar.
- El endpoint de revocación de token (`DELETE /api/delete` en `auth.truelayer-sandbox.com`) se implementó según la documentación pero no se verificó con una llamada real exitosa.
- Falta validar el flujo completo con un banco no-mock (fuera de sandbox) — todo lo probado hasta ahora es contra `uk-cs-mock`.
