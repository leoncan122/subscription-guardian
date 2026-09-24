# Perfil de usuario: país, idioma, divisa y zona horaria

Plan y seguimiento para que la app conozca los datos del usuario que configuran su vista (país, idioma, formato regional, divisa base, zona horaria) sin obligarle a rellenar un formulario largo.

**Estado general:** ✅ Fases 1–4 implementadas · ⚠️ falta ejecutar la migración 006 en Supabase · Fase 5 pendiente (futuro)

---

## 1. Análisis

### Conceptos que parecen uno pero son varios

"El usuario es de España" en realidad son varias preferencias independientes:

| Dato | Para qué sirve | ¿Se puede deducir? |
|---|---|---|
| **País de residencia** | Qué bancos mostrar por defecto al conectar, normativa (UK vs UE) | Región del idioma del navegador, IP o primer banco conectado |
| **Idioma** (`es`, `en`, `ca`…) | Textos de la interfaz | `navigator.language` |
| **Formato regional** (`es-ES`, `en-GB`) | Fechas, separador decimal | Navegador. No siempre coincide con el idioma |
| **Divisa base** | En qué divisa se muestran los **totales** | Divisa del país, o de la cuenta donde cobra la nómina |
| **Zona horaria** | Avisos de renovación ("se cobra mañana") | `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| **Países de los bancos** | — | **No es una preferencia**: cada conexión ya tiene su país y cada cuenta su divisa |

Idioma y país no van siempre juntos (un expatriado en Alemania puede usar la app en español con bancos alemanes y euros; alguien en Suiza puede cobrar en CHF y pagar en EUR).

### Lo que se escapaba en la idea inicial

1. **Suscripciones en varias divisas.** Netflix en EUR y una herramienta SaaS en USD no se pueden sumar tal cual. Hace falta:
   - guardar siempre la divisa **original** de cada cargo (ya se hacía);
   - una **divisa base** del usuario para los totales;
   - un tipo de cambio diario (API pública del BCE vía Frankfurter, en caché), marcando los totales convertidos como aproximados ("≈").
2. **Zona horaria**, para que los avisos lleguen el día correcto.
3. **Día de cobro de la nómina** (opcional): permite avisar de "estos cargos llegan antes de tu nómina".
4. **Preferencias de notificaciones**.

### ¿Onboarding o panel de perfil?

**Las dos cosas, con un onboarding casi invisible.** Regla: deducir primero, pedir confirmación después y dejarlo todo editable.

- **Al entrar por primera vez**, sin preguntar: se guardan idioma, formato regional, zona horaria, país y divisa deducidos del navegador.
- **Confirmación de una sola pantalla/tarjeta**, ya rellenada: "Vives en España · Ves tus gastos en EUR · [Confirmar] [Cambiar]".
- **Tras conectar un banco**: si ninguna cuenta está en la divisa base, se sugiere cambiarla.
- **Panel de Ajustes**: todo editable, más las notificaciones.
- **Países de los bancos**: no van en el perfil. El selector de país de `connect-bank` preselecciona el país de residencia.

### Estado inicial del código (antes de empezar)

- Divisa fija: `"USD"` en los totales del dashboard, `'GBP'` como valor por defecto en `src/lib/truelayer/service.ts`, `'USD'` en `normalizeSubscription`.
- Los totales sumaban importes de divisas distintas sin convertir.
- `formatCurrency` siempre formateaba en `en-US`.
- Existía una tabla `user_settings` (migración 001) con `currency` y `notifications_enabled`, pero **ningún código la usaba**.

### Decisión de modelo de datos

En lugar de crear una tabla `profiles` nueva, se **amplía `user_settings`**, que ya tiene `user_id UNIQUE`, RLS y trigger de `updated_at`. Así no hay dos tablas solapadas. La columna `currency` pasa a significar "divisa base".

---

## 2. Fases

### Fase 1 — Modelo de datos y perfil automático ✅

- [x] Migración `006_user_settings_profile.sql`: añadir `country`, `locale`, `timezone`, `payday`, `onboarded_at` a `user_settings`.
- [x] `src/lib/supabase/settings.ts`: leer, crear y actualizar los ajustes; deducir valores por defecto del navegador.
- [x] `src/contexts/SettingsContext.tsx`: carga los ajustes del usuario y, si no existen, los crea automáticamente.
- [x] Integrar el provider en `layout.tsx`.

### Fase 2 — Divisa base y conversión de totales ✅

- [x] Ruta `GET /api/fx?base=EUR` con tipos de cambio del BCE (Frankfurter), cacheada 12 h.
- [x] Utilidades de conversión (`src/lib/fx.ts`).
- [x] `formatCurrency` respeta el `locale` del usuario.
- [x] Totales del dashboard en divisa base, marcados con "≈" cuando hay conversión.
- [x] Formulario de alta usa la divisa base por defecto.

### Fase 3 — Panel de ajustes ✅

- [x] Página `/settings`: país, idioma/formato, divisa base, zona horaria, día de nómina, notificaciones.
- [x] Acceso desde la cabecera.

### Fase 4 — Confirmación de onboarding y sugerencias ✅

- [x] Tarjeta de confirmación en el dashboard mientras `onboarded_at` sea nulo.
- [x] Sugerencia de cambiar la divisa base si ninguna cuenta conectada está en esa divisa.
- [x] `connect-bank` preselecciona el país de residencia.

### Fase 5 — Futuro (fuera de este alcance) ⏳ pendiente

- [ ] Traducción de la interfaz (i18n). El `locale` ya se guarda.
- [ ] Avisos "antes de tu nómina" usando `payday`.
- [ ] Envío de notificaciones respetando `timezone` y `notifications_enabled`.
- [ ] Deducción del país por IP (p. ej. cabecera `x-vercel-ip-country`).

---

## 3. Registro de progreso

_(se actualiza al terminar cada fase)_

### Fase 1 — completada

- `supabase/migrations/006_user_settings_profile.sql`: añade `country`, `locale`, `timezone`, `payday` (1–31) y `onboarded_at` a `user_settings`, y recrea sus políticas RLS de forma idempotente.
- `src/lib/locale.ts`: listas de países, idiomas y divisas admitidas, y `detectLocaleDefaults()`. El país se deduce primero de la **zona horaria** (mejor señal de residencia que el idioma: un navegador en inglés en Madrid sigue siendo alguien que vive en España), después de la región del idioma y, si no, `GB`.
- `src/lib/supabase/settings.ts`: `getOrCreateUserSettings()` crea la fila con valores deducidos la primera vez y rellena los campos vacíos de filas antiguas (incluido el `USD` por defecto de la migración 001, que nadie había elegido). `updateUserSettings()` para cambios parciales.
- `src/contexts/SettingsContext.tsx` + `layout.tsx`: `useSettings()` disponible en toda la app; con sesión iniciada carga los datos guardados y sin sesión usa los deducidos.

⚠️ **Acción manual:** ejecutar `006_user_settings_profile.sql` en el SQL Editor de Supabase (no hay CLI de migraciones). Hasta entonces, la carga de ajustes falla y la app usa los valores deducidos del navegador, sin romperse.

### Fase 2 — completada

- `src/app/api/fx/route.ts`: `GET /api/fx?base=EUR` devuelve los tipos de referencia del BCE (vía Frankfurter, sin clave de API). La llamada externa se cachea 12 h con `fetch(..., { next: { revalidate } })` y la respuesta 1 h en el navegador. Solo acepta las divisas de `CURRENCIES`.
- `src/lib/fx.ts`: `convertAmount`, `monthlyTotalInBase` (suma mensualizada en divisa base e indica si hubo conversión y qué divisas no se pudieron convertir) y el hook `useFxRates`, que solo pide tipos de cambio si hay alguna suscripción en otra divisa.
- `src/utils/helpers.ts`: `formatCurrency(amount, currency, locale)` usa el `locale` del usuario (`1.234,50 €` en `es-ES`); `convertToMonthly` ahora se exporta y el dashboard ya no duplica esa lógica.
- Dashboard: los totales mensual y anual van en la divisa base, con "≈" si incluyen conversiones y un aviso si alguna divisa quedó fuera. Las suscripciones detectadas y las tarjetas usan el formato del usuario.
- `SummaryCard` formatea con `Intl` (antes `USD 12.00`).
- `AddSubscriptionForm` toma la divisa base por defecto y ofrece las divisas admitidas. Nota: este formulario **no está montado en ninguna página** (la pestaña "Add" no hace nada), así que el cambio no se ve todavía.

### Fase 3 — completada

- `src/app/settings/page.tsx`: página `/settings` con país de residencia, divisa base, idioma/formato (con vista previa de importe y fecha), zona horaria (todas las de `Intl.supportedValuesOf`), día de nómina opcional y el interruptor de notificaciones.
  - Al cambiar de país, la divisa lo acompaña **salvo** que el usuario ya hubiera elegido una distinta de la del país anterior.
  - Si el valor guardado no está en las listas cerradas (p. ej. un `en-IE` deducido del navegador), se añade como opción para que el desplegable no muestre otro valor sin avisar.
  - Guardar desde aquí cuenta como confirmar el onboarding (`onboarded_at`).
- `src/components/Header.tsx`: botón ⚙️ que lleva a `/settings`.
- La interfaz de ajustes está en inglés, como el resto de la app (hasta que llegue la i18n de la Fase 5).

### Fase 4 — completada

- Dashboard, tarjeta **"👋 Is this right?"**: se muestra mientras `onboarded_at` sea nulo, con el país, la divisa y un ejemplo de formato ya rellenados. "Looks right" guarda `onboarded_at`; "Change" lleva a `/settings`.
- Dashboard, **sugerencia de divisa**: si hay cuentas conectadas y ninguna está en la divisa base, propone la divisa más frecuente entre las cuentas ("Use GBP" / "Keep EUR"). Solo aparece cuando el onboarding ya está confirmado, para no mostrar dos tarjetas a la vez. El rechazo se recuerda en `localStorage` para esa divisa: es una comodidad del navegador, así que en otro dispositivo la sugerencia puede volver a salir.
- `connect-bank`: preselecciona el país de residencia (`GB` → `uk` de TrueLayer) si está entre los países admitidos; el usuario puede elegir otro.

### Verificación

- `npm run build` ✅ y `tsc --noEmit` ✅.
- `eslint`: sin errores en los archivos nuevos o modificados. Siguen los errores que ya había en `AuthContext.tsx`, `register-sw.tsx`, `subscriptions.ts`, `sync.ts` y `push-notifications.ts`, que no se han tocado.
- `GET /api/fx?base=EUR` y `?base=GBP` devuelven los tipos del día; `?base=XYZ` devuelve 400.
- Detección con navegadores simulados: `en-US` + `Europe/Madrid` → ES/EUR (conservando el formato `en-US`); `es` + `UTC` → ES/`es-ES`/EUR; `es-MX` + `America/Mexico_City` → MX/MXN; `fr` + `Asia/Tokyo` → FR/EUR.
- En el servidor de desarrollo, con la sesión iniciada, se vio el fallo esperado mientras no exista la migración (`column user_settings.country does not exist`): la app no se rompe y usa los valores deducidos.
- **No verificado de extremo a extremo** con la migración aplicada (guardar ajustes, confirmar el onboarding, sugerencia de divisa con un banco real).

---

## 4. Pendiente

### Acción manual (bloqueante)

- [ ] Ejecutar `supabase/migrations/006_user_settings_profile.sql` en el SQL Editor de Supabase. Sin esto, "Looks right" y "Save" en `/settings` fallan con un aviso de error.
- [ ] Después, probar: primer acceso → tarjeta de confirmación → `/settings` → cambiar divisa → totales con "≈".

### Deuda detectada por el camino (no abordada)

- [x] ~~`detectSubscriptions` guardaba **todas** las suscripciones detectadas como `GBP`, sin importar la divisa real.~~ **Corregido** en `src/lib/truelayer/service.ts`: ahora usa la divisa de las transacciones (o la de la cuenta si el banco no la informa). Las filas ya guardadas se corrigen al pulsar "🔄 Check for subscriptions", porque el upsert actualiza la divisa. Las suscripciones **ya confirmadas** con la divisa incorrecta hay que corregirlas a mano o borrarlas y volver a confirmarlas. Cómo evitarlo en el futuro: ver `docs/SINCRONIZACION_BANCO.md`.
- [ ] `syncAccounts` todavía usa `'GBP'` como último recurso si TrueLayer no informa la divisa de la cuenta (caso raro).
- [ ] `AddSubscriptionForm` no está montado en ninguna página (la pestaña "Add" de la barra inferior no hace nada).
- [ ] La columna `subscriptions.currency` sigue teniendo `DEFAULT 'USD'` en la base de datos; ahora no afecta porque el código siempre envía la divisa, pero se podría eliminar.
- [ ] Los países admitidos para bancos (`TRUELAYER_COUNTRIES`: UK, ES) son menos que los países de residencia; es intencionado, pero conviene ampliarlos a medida que TrueLayer lo permita.

### Fase 5 (futuro)

- [ ] i18n de la interfaz (el `locale` ya se guarda; los textos siguen en inglés, salvo alguno suelto en español en `connect-bank`).
- [ ] Avisos "antes de tu nómina" usando `payday`. Se podría detectar solo a partir de los ingresos recurrentes de TrueLayer.
- [ ] Notificaciones que respeten `timezone` y `notifications_enabled`.
- [ ] País por IP (`x-vercel-ip-country`) como señal adicional en la detección.
