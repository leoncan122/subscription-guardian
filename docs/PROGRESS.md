# Progreso del proyecto

Bitácora de trabajo. Cada sesión agrega una sección nueva arriba (orden cronológico inverso).

---

## 2026-09-26 — Detección de cambios de precio, recordatorios de renovación y push notifications reales

Rama: `feature/price-change-alerts` (PR #20, mergeado a `master`) + un fix directo sobre `master` (`a828aa2`).

### Contexto

Dos pedidos encadenados en la misma sesión: (1) avisar cuando el banco detecta que una suscripción confirmada ahora cobra un monto distinto al guardado, y (2) una notificación push diaria — tanto para esos cambios de precio como para recordar renovaciones 1 y 3 días antes. La app ya tenía el scaffolding de Web Push (`src/utils/push-notifications.ts`, `public/sw.js`) desde el README original, pero nunca había funcionado de verdad: apuntaba a un endpoint inexistente, con la VAPID key de ejemplo de la documentación.

### 1. Detección de cambio de precio (`src/lib/subscription-detection.ts`, migración `012_subscription_price_changes.sql`)

- `recurrence.ts` ya recalculaba en cada re-detección cuál es el precio *actual* según el banco (`sub.amount`, restitchado sobre todo el historial), pero ese dato solo llegaba a un `console.log`. Ahora `storeCharges` compara ese precio contra `subscriptions.amount` (lo que el usuario realmente ve) para toda suscripción ya confirmada.
- Tabla de staging nueva `subscription_price_changes` (una fila viva por suscripción, `pending`/`dismissed`), mismo patrón que `detected_subscriptions`: upsert que resuelve solo, se re-flaggea si el precio cambia de nuevo, no vuelve a molestar si ya se descartó el mismo valor.
- UI: banner nuevo en el dashboard (Aceptar/Ignorar), badge en `SubscriptionCard`, y resaltado (▲/▼) de la fila del historial de cargos en `SubscriptionDetailModal` donde cambió el precio.
- Corre para TrueLayer y Salt Edge por igual (comparten `storeDetectedSubscriptions`).

### 2. Recordatorios de renovación + auto-avance de `renewal_date` (`src/lib/renewal.ts`)

- Se descubrió que `subscriptions.renewal_date` nunca se actualiza sola una vez que pasa (ni siquiera al confirmar un cargo bancario fresco) - un recordatorio de "1/3 días antes" solo habría disparado una vez por suscripción.
- `advancePastRenewalDate()` adelanta una fecha vencida un ciclo de facturación completo por vez hasta dejarla en el futuro; el cron la corre para toda suscripción activa antes de chequear días restantes.
- Sin tabla de estado propia: al ser puramente derivado de la fecha, el cron re-chequea cada día sin necesidad de marcar nada como "ya avisado".

### 3. Push real (antes era un mock que no llegaba a ningún lado)

- Paquete `web-push` + par de claves VAPID real (antes: la key de ejemplo de la documentación, hardcodeada).
- Tabla `push_subscriptions` (migración `013_push_subscriptions.sql`) + `POST /api/push/subscribe` (antes no existía, el cliente le pegaba al vacío).
- `src/lib/supabase/admin.ts`: cliente con la service-role key, para que el cron lea/escriba de todos los usuarios sin una sesión particular (bypassa RLS a propósito).
- `src/app/api/cron/daily-alerts/route.ts` (antes `price-change-alerts`, renombrado al sumarle los recordatorios de renovación): protegido por `CRON_SECRET`, agrupa por usuario, respeta `notifications_enabled`, limpia subscriptions vencidas (404/410) automáticamente. `vercel.json` lo dispara 1 vez al día vía Vercel Cron (Hobby permite como máximo esa frecuencia).
- Deep link: el payload lleva `data.url` = `/dashboard?subscription=<id>` cuando hay un único evento; el dashboard lee ese query param al cargar y abre el modal directo (`src/app/api/cron/daily-alerts` + lectura en `dashboard/page.tsx`).
- Texto del push en 7 idiomas, en un diccionario propio (`src/lib/push.ts`) separado del catálogo i18n de la UI (este texto nunca pasa por React).

### 4. Bugs preexistentes corregidos de paso (no eran de esta feature, pero estaban en el mismo camino)

- `subscribeToPush()` posteaba a `/api/push/subscribe` sin el prefijo `BASE_PATH` - 404 en producción.
- `RegisterSW` pedía permiso de notificaciones a cualquier visitante, incluso deslogueado.
- `public/sw.js`: los íconos del push (`icon-192.png`) no llevaban el prefijo `basePath` que el resto del archivo sí usa.
- `public/sw.js`: `cache.put()` sobre una request no-GET (ej. el POST de subscribe) quedaba sin capturar y aparecía como `Uncaught (in promise) TypeError: Failed to execute 'clone' on 'Response'` en consola - no rompía la respuesta real, pero ensuciaba la consola. Ahora se guarda en cache solo si `request.method === 'GET'` y cualquier fallo de cacheo se atrapa.

### Verificado en producción (`subscription-guardian-iota.vercel.app`)

Con datos reales: se confirmó que el cron corre, detecta un recordatorio de renovación real (`OVHcloud` con `renewal_date` movida a 3 días), entrega el push, y el click abre el dashboard directo en el modal de esa suscripción. Se repitió la prueba después del fix de `sw.js` para confirmar que no rompió nada.

### Pendiente / conocido

- **No hay forma de editar `renewal_date` (ni `amount`) de una suscripción ya creada desde la UI** - se descubrió durante el testing de esta sesión. El modal de detalle solo permite editar "cómo cancelar". Hubo que hacer el UPDATE a mano por SQL para poder probar.
- Relacionado: el tab "Add" del dashboard (`setActiveTab('add')`) no renderiza ningún formulario en ningún lado del árbol de componentes - `AddSubscriptionForm` existe pero quedó huérfano (`handleAddSubscription` sin usar, lo marca eslint).
- Los deploys de preview de Vercel están protegidos por SSO por defecto - no se puede probar el cron ahí sin un "Protection Bypass for Automation" secret. El testing real de esta sesión se hizo contra producción directamente.
- El recordatorio de renovación no tiene catch-up: si el cron no corre exactamente el día que la suscripción está a 1 o 3 días, ese aviso puntual se pierde (igual que ya pasaba con los cambios de precio).
- `advancePastRenewalDate` no se validó todavía con un ciclo semanal o trimestral real en producción, solo con el caso mensual/OVHcloud.

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

### Deploy: se mueve de GitHub Pages a Vercel

`.github/workflows/deploy.yml` desplegaba a GitHub Pages (hosting estático), incompatible con el trabajo de esta sesión (rutas API, `/callback`, middleware, sesión server-side vía cookies — nada de eso corre sin un runtime de Node). Se decidió mover el hosting a **Vercel**, que sí soporta todo esto de forma nativa. El workflow de GitHub Pages fue eliminado.

Dominio de producción: `https://subscription-guardian-iota.vercel.app` (`basePath` se mantiene, así que la app vive bajo `/subscription-guardian`).

**Pendiente al configurar Vercel:**
- Cargar las env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`) en el proyecto de Vercel (Settings → Environment Variables).
- Redirect URI de producción a registrar en la consola de TrueLayer (agregar, no reemplazar la de local): `https://subscription-guardian-iota.vercel.app/subscription-guardian/callback`. Se construye sola en runtime a partir del `origin` de cada request + `basePath`, no requiere cambios de código.

### 7. Sandbox vs Live configurable (`src/lib/truelayer/client.ts`)

Tras mover a Vercel, producción se cambió a **credenciales Live de TrueLayer** (bancos reales, no el mock `uk-cs-mock`). Como los dominios/`client_id`/`client_secret` de sandbox y live no son intercambiables (mezclarlos da "unknown client or client not enabled"), el ambiente ahora es configurable por variable de entorno en vez de estar hardcodeado a sandbox:

- `TRUELAYER_ENV=live` → usa `auth.truelayer.com` / `api.truelayer.com` y `providers=uk-ob-all` (todos los bancos reales UK).
- Cualquier otro valor (u omitida) → sandbox, como antes (`auth.truelayer-sandbox.com` / `api.truelayer-sandbox.com`, `providers=uk-cs-mock`).

Así, desarrollo local sigue siendo sandbox por defecto (seguro para probar) aunque producción esté en Live. **En Vercel hay que setear `TRUELAYER_ENV=live` además de las credenciales Live** (`TRUELAYER_CLIENT_ID`/`TRUELAYER_CLIENT_SECRET` correspondientes a la app Live, no la de sandbox).

Bug encontrado en el camino: el valor de `TRUELAYER_CLIENT_ID` en Vercel estaba puesto como el string literal `"TRUELAYER_CLIENT_ID"` (el nombre de la variable, no su valor) — causaba el mismo error "unknown client or client not enabled". Ya corregido por el usuario en el dashboard de Vercel.

### 8. Solo UK por ahora - otros países (España, etc.)

`providers=uk-ob-all` limita el selector de banco a Reino Unido. TrueLayer sí opera en España (BBVA, Santander, CaixaBank, Sabadell y más, confirmado vía su blog/coverage page), pero **no se agregó soporte para España en esta sesión** porque no se pudo confirmar con confianza desde la documentación pública el string exacto de `providers` para incluir otro país (la doc remite a la herramienta visual "Auth Link Builder" en la Console de TrueLayer, no publica el valor).

Se agregó `TRUELAYER_PROVIDERS` (env var, opcional, solo aplica en modo live) para poder pegar ahí el valor exacto que dé el Auth Link Builder sin tocar código — default `uk-ob-all` si no se setea.

**Importante si se agrega España:** `transaction_classification` (la categorización automática de TrueLayer) y el enriquecimiento de `merchant_name` **solo están soportados para UK, Irlanda y Francia** ([transaction-data-reference](https://docs.truelayer.com/docs/transaction-data-reference)). Para bancos españoles, la detección de suscripciones caería siempre al fallback por descripción + regex de palabras clave (ya implementado), nunca a la clasificación oficial de TrueLayer.

### Pendiente / conocido

- El "filtro por banco" en el dashboard usa `paymentMethod` (texto libre), no una referencia real a la conexión bancaria — con una sola cuenta de prueba no se puede validar bien la diferenciación entre bancos. Si se necesita distinguir bancos específicos, hay que guardar `connection_id` (o el nombre del proveedor) en `subscriptions` al confirmar.
- El endpoint de revocación de token (`DELETE /api/delete`) se implementó según la documentación pero no se verificó con una llamada real exitosa.
- Falta validar el flujo completo en Live con un banco real (todo lo probado hasta ahora fue contra el sandbox `uk-cs-mock`).
