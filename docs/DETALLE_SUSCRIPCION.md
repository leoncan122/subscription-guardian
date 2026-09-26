# Detalle de suscripción: historial de cargos, resumen de gasto y acción de cancelación

Plan para que al pulsar una suscripción se abra una vista de detalle con el listado de cargos (fecha + importe), el total gastado, el ahorro estimado si se cancela de aquí a un año, y una primera acción ("cómo cancelar"), dejando sitio para que en el futuro esa acción se convierta en un plan paso a paso por proveedor o un chatbot.

**Estado general:** ✅ Fases 0–3 implementadas · ⚠️ faltan ejecutar las migraciones 009 y 010 en Supabase

---

## 1. Lo que pide el usuario

- Poder pulsar una suscripción de la lista y ver un **detalle**.
- Dentro del detalle, un **listado de fechas e importe** de los cargos.
- Un **resumen**: total gastado, y el **ahorro** que suponer cancelarla ahora de aquí a un año.
- **Acciones**: de momento solo una, "cómo cancelar esta suscripción". A futuro: un plan de acción distinto según la suscripción, o un chatbot que lo explique. Esta fase futura queda fuera de alcance, pero el diseño no debe cerrarle la puerta (ver Fase 4).

## 2. El problema de fondo: hoy no existe un historial de cargos

Antes de diseñar la vista hay que resolver de dónde salen las fechas e importes, porque **hoy no se guardan en ningún sitio**:

- `subscriptions` (la tabla de suscripciones confirmadas) solo tiene **un** `amount` y **una** `renewal_date` — el estado actual, no un histórico.
- `detected_subscriptions` guarda algo más cerca de un histórico, pero solo **agregado**: `first_seen`, `last_seen`, `occurrence_count`, `amount` (el precio más reciente). No hay una fila por cargo, solo un resumen.
- Al confirmar una detectada (`confirmDetectedSubscription` en `src/lib/supabase/subscriptions.ts`), **ni siquiera ese agregado se copia** — la suscripción nueva nace con `amount` + `renewalDate` calculada y nada más. Desde ese momento la suscripción confirmada no tiene memoria de nada.
- Las fechas de cada cargo individual **sí existen**, pero solo de paso: `AmountGroup.dates` en `src/lib/truelayer/recurrence.ts` las tiene durante la detección, y se usan para calcular `firstSeen`/`lastSeen`/`occurrenceCount`/el ciclo de facturación — pero se descartan antes de llegar a la base de datos. Guardarlas es extender algo que ya se calcula, no construir detección nueva.

Esto separa la funcionalidad en dos mundos, y el detalle tiene que dejarlo claro en la interfaz, no disimularlo:

| | Suscripciones **vinculadas a banco** (confirmadas desde una detectada) | Suscripciones **manuales** (formulario, sin banco) |
|---|---|---|
| ¿Hay cargos reales? | Sí, si empezamos a guardarlos (hoy no) | **Nunca los ha habido** — solo importe/ciclo declarados por el usuario |
| Listado de fechas e importes | Real, a partir de la fecha en que se implemente esto | No se puede mostrar sin inventarlo |
| Total gastado | Suma de cargos reales | No disponible (no hay de dónde sacarlo honestamente) |
| Ahorro el próximo año | Se puede calcular igual en los dos casos: solo depende de `amount` + `billingCycle` + `renewalDate`, no del histórico |

## 3. Decisiones de diseño

### 3.1 Guardar el historial real, no volver a pedirlo al banco cada vez

Se propone una tabla nueva `subscription_charges` (una fila por cargo) en vez de volver a pedir las transacciones a TrueLayer/Salt Edge cada vez que se abre el detalle. Motivos:

- sigue disponible si el usuario desconecta el banco después;
- no depende de una llamada externa lenta para abrir un detalle;
- reaprovecha fechas que `recurrence.ts` ya calcula, en vez de re-implementar el filtrado/agrupado de transacciones fuera de la detección;
- es una sola tabla para TrueLayer y Salt Edge, igual que `storeDetectedSubscriptions` en `src/lib/subscription-detection.ts` ya unifica ambos aggregators hoy.

Columnas: `id`, `user_id`, `detected_subscription_id` (siempre presente — todo cargo nace de una detección), `subscription_id` (nulo hasta que el usuario confirma; se rellena entonces, igual que el resto de campos que hoy se copian en `confirmDetectedSubscription`), `amount`, `currency`, `charged_on DATE`, `created_at`. RLS por `user_id`, como el resto de tablas del proyecto.

### 3.2 El vínculo que falta hoy entre detectada y confirmada

Esto necesita exactamente el vínculo que `docs/SINCRONIZACION_BANCO.md` (Fase 1) ya identificó como pendiente y no ha llegado a implementarse: `subscriptions.detected_subscription_id`. En vez de duplicar ese trabajo, esta feature lo da por Fase 0 (ver más abajo) y, si `SINCRONIZACION_BANCO.md` se implementa antes, esta feature simplemente reutiliza esa columna.

### 3.3 Suscripciones manuales: no fabricar historial

No se inventan cargos pasados para una suscripción sin banco. El bloque de cargos muestra un mensaje ("Sin historial de cargos — esta suscripción se añadió a mano. Conéctala a tu banco para verlo.") y el "total gastado" no se muestra. El ahorro proyectado sí se muestra siempre, porque no necesita histórico. Coherente con el principio ya aplicado en `SINCRONIZACION_BANCO.md`: en una app de dinero, no mostrar como hecho algo que es una suposición.

### 3.4 Fórmulas

- **Total gastado**: `SUM(subscription_charges.amount)` de esa suscripción. Si mezclara divisas (cambio de divisa real, caso raro) se avisa igual que en el dashboard, no se suma sin convertir. Sin filas (manual, o vinculada a banco pero todavía sin re-detectar desde que se despliegue esta feature) → "no disponible", nunca "0".
- **Ahorro el próximo año si se cancela ahora**: no depende del histórico. Nº de cargos que tocarían entre hoy y hoy + 365 días según `renewalDate` + `billingCycle`, multiplicado por `amount` (weekly → hasta 52, monthly → hasta 12, quarterly → hasta 4, yearly → hasta 1; calculado contando fechas de renovación reales, no con una media). Se muestra en la divisa de la suscripción, y opcionalmente convertido a la divisa base con `src/lib/fx.ts` igual que el resto del dashboard.

### 3.5 Cómo se abre el detalle

Hoy toda la app vive en `src/app/dashboard/page.tsx` como una sola pantalla con pestañas en estado de React (`activeTab`, sin sincronizar con la URL — ver `TabBar`), sin rutas dinámicas más allá de `/connect-bank` y `/settings`. Para mantener esa consistencia (y evitar tener que resolver auth/carga de datos otra vez en una ruta nueva), el detalle se abre como un **modal/bottom sheet** dentro del dashboard, no como una URL `/dashboard/subscriptions/[id]`. El disparador es pulsar la tarjeta completa (`SubscriptionCard`), no solo el texto de cancelación.

### 3.6 La acción "cómo cancelar" y el bug que ya existe ahí

Hoy `SubscriptionCard` ya tiene un gancho a medias para esto: si `cancellationInfo` no está vacío, muestra un enlace "How to cancel" cuyo único efecto visible es un `title` (tooltip del navegador) y que además llama a `onEdit(subscription.id)`, que en el dashboard es `handleUpdateSubscription(id, {})` — una actualización vacía que no cambia nada; es un resto de código que no llegó a construirse. Esta feature sustituye ese enlace: al abrir el detalle, `cancellationInfo` se muestra como contenido legible (no un tooltip) dentro de la tarjeta de acción "Cómo cancelar", con un campo editable para rellenarlo si está vacío. No hay hoy ninguna fuente automática de "cómo cancelar cada servicio" — ese es precisamente el plan de acción por proveedor / chatbot que el usuario ya sitúa como futuro (Fase 4).

## 4. Fases

### Fase 0 — Vínculo detectada → confirmada (retoma la Fase 1 de `docs/SINCRONIZACION_BANCO.md`) ✅

- [x] Migración `009_subscription_detected_link.sql`: `subscriptions.detected_subscription_id UUID REFERENCES detected_subscriptions(id) ON DELETE SET NULL` + índice.
- [x] `confirmDetectedSubscription` guarda el vínculo al confirmar (además de enlazar los cargos ya guardados, ver Fase 1).
- [x] Backfill de las suscripciones confirmadas que ya existían, por nombre exacto (`user_id` + `name` = `merchant_name`, `is_confirmed = true`, `payment_method = 'Bank Account'`), solo si hay una coincidencia única — incluido en la propia migración.

### Fase 1 — Persistir el historial de cargos ✅

- [x] Migración `010_subscription_charges.sql`: tabla, índice único por `(detected_subscription_id, charged_on, amount)` para no duplicar en redetecciones, índice por `subscription_id`, RLS.
- [x] `recurrence.ts`: `RecurringSubscription.charges` lleva las fechas e importes individuales de cada grupo (ya calculados) en vez de descartarlos tras calcular los agregados — cada cargo con el precio real al que se cobró, no el precio actual.
- [x] `subscription-detection.ts` (`storeCharges`): inserta las filas en `subscription_charges` tras cada upsert de una detectada (upsert con `ignoreDuplicates` por el índice único de arriba). Si la detectada ya está vinculada a una suscripción confirmada (`subscriptions.detected_subscription_id`), los cargos nuevos se enlazan a ella directamente — el historial sigue creciendo después de confirmar, no solo antes.
- [x] Al confirmar (`confirmDetectedSubscription`), se enlazan retroactivamente los cargos que ya se habían guardado mientras estaba pendiente de revisión.

### Fase 2 — Backend de lectura ✅

- [x] `getSubscriptionCharges(subscriptionId)` en `src/lib/supabase/subscriptions.ts` (fecha + importe + divisa, orden descendente).
- [x] `src/lib/subscription-savings.ts`: `projectedYearlySaving` (no depende de Supabase ni del histórico) y `chargesTotal` (suma en la divisa del cargo más reciente, reporta las demás como excluidas en vez de mezclarlas) como funciones puras.

### Fase 3 — Interfaz del detalle ✅

- [x] Nuevo componente `SubscriptionDetailModal`.
- [x] `SubscriptionCard` abre el modal al pulsar la tarjeta completa (prop `onOpenDetail`); se retira el `onEdit` roto anterior.
- [x] Secciones: cabecera (nombre, categoría, importe/ciclo, próxima renovación), resumen (total gastado / ahorro el próximo año), listado de cargos o mensaje de "sin historial" (distinto si es manual o vinculada a banco), acciones (tarjeta "Cómo cancelar" con el texto de `cancellationInfo`, editable in-line; si está vacío, invita a rellenarlo).
- [x] Claves nuevas (`subscriptionDetail.*`) en los 7 idiomas de `src/i18n/messages`.

### Fase 4 — Futuro (fuera de este alcance)

- [ ] Plan de acción específico por proveedor (pasos guiados de cancelación según el `merchant_name`/categoría).
- [ ] Chatbot o asistente que guíe la cancelación.
- [ ] Gráfico del histórico de precio de la suscripción (los datos ya estarían en `subscription_charges` desde la Fase 1; solo faltaría visualizarlos).

## 5. Verificación

- `npx tsc --noEmit`, `npm run build` y `npx eslint` sobre todos los archivos tocados: ✅. El único error de `eslint` que queda (`normalizeSubscription`, `any`) es preexistente, no de esta feature.
- No probado contra Supabase real (las migraciones no se han ejecutado en ningún entorno — ver acción manual abajo), ni en el navegador.

## 6. Pendiente / riesgos

### Acción manual (bloqueante)

- [ ] Ejecutar `supabase/migrations/009_subscription_detected_link.sql` y `010_subscription_charges.sql`, en ese orden, en el SQL Editor de Supabase. Sin esto, confirmar una suscripción o volver a detectar suscripciones falla al intentar escribir en columnas/tablas que todavía no existen.
- [ ] Después: conectar un banco (o usar uno ya conectado), pulsar "🔄 Check for subscriptions", confirmar una detectada y comprobar que su detalle muestra cargos reales tras una segunda detección.

### Deuda / limitaciones aceptadas

- Las suscripciones manuales seguirán sin historial real ni "total gastado" para siempre; solo tienen ahorro proyectado y la acción de cancelación. Es una limitación aceptada, no un defecto a corregir.
- El historial solo empieza a acumularse desde que esto se despliegue y se ejecuten las migraciones: las suscripciones detectadas hoy no tienen cargos guardados retroactivamente hasta la próxima detección (TrueLayer trae transacciones desde `2024-01-01` fijo; Salt Edge trae `HISTORY_DAYS = 365` días desde la conexión — ver `src/lib/truelayer/service.ts` y `src/lib/saltedge/service.ts`). Las suscripciones confirmadas **antes** de esto no tendrán cargos hasta que se pulse "Check for subscriptions" de nuevo sobre su banco.
- `projectedYearlySaving` usa el ciclo de facturación declarado (`billingCycle`) y la próxima `renewalDate`, avanzando fecha a fecha con `setMonth`/`setDate`/`setFullYear`; no corrige por meses de distinta duración más allá de lo que ya hace `Date`, igual que el resto de la app (`getNextMonth`, `nextRenewalDate`).
