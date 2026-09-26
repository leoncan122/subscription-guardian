# Sincronización de suscripciones confirmadas con el banco

Plan para que las suscripciones confirmadas se mantengan al día con lo que el banco informa (divisa, cambios de importe) sin sobrescribir lo que el usuario ha decidido.

**Estado general:** ⏳ Pendiente · ✅ Fase 1 (vínculo) implementada al construir `docs/DETALLE_SUSCRIPCION.md` · ✅ corregida la agrupación por importe (requisito de la Fase 4)

---

## 1. Contexto

Al pulsar **Confirm** sobre una suscripción detectada, `confirmDetectedSubscription` (`src/lib/supabase/subscriptions.ts`) **copia** sus datos a una fila nueva de `subscriptions`. Desde ese momento las dos filas quedan desconectadas:

- No hay ninguna columna que las relacione; solo coinciden por el nombre (`subscriptions.name` = `detected_subscriptions.merchant_name`).
- Si la detección se vuelve a ejecutar y corrige o cambia algún dato, la suscripción confirmada no se entera.

Caso real que lo destapó: `detectSubscriptions` guardaba toda suscripción detectada como `GBP` (corregido, ver `docs/PERFIL_USUARIO.md`). Las detectadas se corrigen solas al volver a detectarlas, pero las ya confirmadas se quedaron en `GBP` y hubo que corregirlas a mano con SQL.

## 2. Decisión: qué se actualiza solo y qué no

Una suscripción confirmada **es del usuario**. Sobrescribirla sin avisar puede deshacer sus cambios y genera desconfianza, y más en una app de dinero. Por eso se distingue entre tipos de dato:

| Dato | Tipo | Comportamiento |
|---|---|---|
| **Divisa** | Dato objetivo del banco | Se corrige sola, **salvo** que el usuario la haya cambiado a mano |
| **Importe** | Dato del banco que cambia con el tiempo (subidas de precio) | **No** se cambia solo: se muestra un aviso para confirmar ("Netflix subió de 12,99 € a 13,99 € — ¿actualizar?") |
| Nombre, categoría, método de pago, notas | Decisiones del usuario | Nunca se tocan |
| Próxima renovación | Derivado de la última transacción | A valorar: se podría recalcular a partir de `last_seen` |

El aviso de subida de precio es además una funcionalidad valiosa en sí misma: detectar subidas que el usuario no ha notado.

## 3. Fases

### Fase 1 — Vínculo real entre las dos filas ✅

- [x] Migración `009_subscription_detected_link.sql`: añade `subscriptions.detected_subscription_id UUID REFERENCES detected_subscriptions(id) ON DELETE SET NULL`.
- [x] `confirmDetectedSubscription` guarda el vínculo al confirmar la suscripción.
- [x] Rellenado el vínculo de las suscripciones confirmadas que ya existían, por nombre y solo si coincide exactamente una (`user_id` + `name` = `merchant_name`, `is_confirmed = true`, `payment_method = 'Bank Account'`) — incluido en la propia migración.
- [x] "Dismiss" solo borra detectadas **no confirmadas** (`dismissDetectedSubscription`/`.eq('is_confirmed', false)` en el dashboard); ninguna ruta borra una detectada ya vinculada a una confirmada, así que `ON DELETE SET NULL` no llega a activarse en el uso normal.

Implementado como parte de `docs/DETALLE_SUSCRIPCION.md` (esa feature necesitaba exactamente este vínculo para poder guardar y encontrar el historial de cargos). Las Fases 2–4 de aquí abajo siguen pendientes.

### Fase 2 — Saber qué ha tocado el usuario

- [ ] Registrar qué campos ha editado el usuario (p. ej. `subscriptions.user_edited_fields TEXT[]`, o una columna `currency_overridden BOOLEAN` si solo importa la divisa).
- [ ] `updateSubscription` los marca cuando el cambio viene del usuario (no de la sincronización).
- Nota: hoy la edición prácticamente no existe (`SubscriptionCard` llama a `onEdit` con `{}`), así que esta fase puede ir a la par con construir la edición.

### Fase 3 — Corrección automática de la divisa

- [ ] En `detectSubscriptions`, después del upsert: si la fila detectada está confirmada y vinculada, y la divisa de la suscripción no ha sido editada por el usuario, actualizar `subscriptions.currency`.

### Fase 4 — Aviso de cambio de importe

- [x] ~~Agrupación por importe: tras una subida, los cargos antiguos y los nuevos formaban dos grupos que acababan en la misma fila, y ganaba el último procesado, no el precio actual.~~ Corregido (ver registro).
- [ ] Si el importe reciente de una detectada confirmada difiere del de su suscripción, guardar el cambio pendiente (p. ej. columnas `pending_amount` / `pending_amount_since` en `subscriptions`, o una tabla de avisos).
- [ ] Dashboard: tarjeta "X subió de A a B — [Actualizar] [Ignorar]". "Ignorar" debe recordarse para ese importe concreto, para no volver a avisar del mismo cambio.
- [ ] Opcional: historial de precios por suscripción.

## 4. Registro de progreso

_(se actualiza al terminar cada fase)_

### Corrección de la agrupación por importe — completada

**Problema:** `detectSubscriptions` agrupa los cargos por comercio **e importe exacto**. Tras una subida de precio, una misma suscripción quedaba partida en dos grupos. Los dos se guardaban en la misma fila (el upsert es por `user_id, merchant_name, billing_cycle`) y el importe final dependía del orden de procesado. Además, una subida con un solo cargo al precio nuevo se ignoraba (hacen falta dos cargos iguales).

**Por qué no se agrupa solo por comercio:** en comercios con compras sueltas (Amazon, categoría `PURCHASE`), todas las compras se mezclarían en una falsa suscripción. Repetir el importe exacto es lo que distingue una suscripción de compras sueltas, así que ese primer paso se mantiene.

**Solución** (`src/lib/truelayer/recurrence.ts`, llamado desde `detectSubscriptions` en `service.ts`), sobre los grupos de importe exacto de cada comercio y divisa:
1. Se unen en una misma suscripción los grupos (con 2 o más cargos) que **van uno detrás de otro en el tiempo, sin solaparse**, y tienen **precios parecidos** (el mayor ≤ 1,5 veces el menor). El importe guardado es el del cargo más reciente, y `first_seen`, `last_seen` y `occurrence_count` cubren toda la historia.
2. Un **único cargo** posterior a un precio parecido, aproximadamente un ciclo después (entre 0,5 y 1,5 ciclos), se toma como una subida reciente que aún no se ha repetido.
3. El ciclo de facturación se calcula con todas las fechas unidas, no solo con las del último precio.
4. Si quedan dos suscripciones del mismo comercio y ciclo (también en divisas distintas), se guarda la de cargo más reciente, de forma determinista, y la otra se registra en el log con un `warn`. La base de datos solo admite una fila por comercio y ciclo.
5. Las subidas detectadas se registran en el log (`price changes: Netflix 13.99 -> 17.99 EUR`).

`detectBillingCycle` se movió a `recurrence.ts` sin cambiar su lógica.

**Verificado** con casos simulados:
- subida ya repetida, en cualquier orden de entrada → 17,99 € con 6 cargos;
- subida reciente con un solo cargo → precio nuevo;
- compras sueltas en Amazon → no se unen a Prime;
- dos pólizas simultáneas → se guarda una y la otra queda en el log;
- salto de precio ×2 → se trata como un plan distinto;
- mismo comercio en dos divisas → una sola fila;
- dos comercios con el mismo importe → dos filas;
- un solo cargo → no es suscripción.

También pasan `tsc` y `eslint`. **No probado contra un banco real.**

**Limitaciones que siguen:**
- Dos suscripciones simultáneas del mismo comercio y ciclo (dos pólizas de Segurcaixa) no se pueden guardar las dos, por la restricción única. Habría que cambiar la restricción o el nombre con el que se guardan.
- Los umbrales (×1,5 en precio, 0,5–1,5 ciclos) son heurísticos.
- Las **suscripciones confirmadas no cambian**: la detectada se actualiza al precio nuevo, pero la copia en `subscriptions` mantiene el importe antiguo. Avisar de ese cambio es el resto de la Fase 4.
