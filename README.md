# 🛡️ Subscription Guardian

PWA (Progressive Web App) para gestionar y visualizar todas tus suscripciones en un solo lugar.

## 🎯 Problema que resuelve

La gente pierde dinero en suscripciones que olvidan:
- **No recuerda cuánto paga** por cada servicio
- **No sabe cuándo se renueva** cada suscripción
- **No recuerda cómo cancelar** un servicio
- **Olvida qué tarjeta usa** para cada pago
- **Mantiene servicios** que ya no utiliza

## ✨ Características

### Dashboard
- **Tarjetas resumen** con gasto mensual y anual estimado
- **Próxima renovación** destacada con cuenta regresiva
- **Alertas de renovación** en los próximos 7 días (urgente / próxima / normal)
- **Lista completa** de suscripciones con toggle activar/desactivar

### Gestión de Suscripciones
- **Formulario completo**: nombre, monto, moneda, ciclo de facturación, fecha de renovación
- **Categorización**: entretenimiento, productividad, almacenamiento, deportes, educación, utilities, otros
- **Método de pago** registrado (ej: Visa ****4242)
- **Info de cancelación** guardada para cada servicio
- **Estado activo/inactivo** para servicios que ya no usas

### PWA
- **Instalable** en iOS y Android desde el navegador
- **Service Worker** con cache estratégico para funcionamiento offline
- **Manifest.json** optimizado con iconos maskable
- **Web Push** para notificaciones de renovación

### Almacenamiento
- **IndexedDB** vía `idb` — persistencia local en el navegador
- **6 suscripciones de ejemplo** precargadas (Netflix, Spotify, Adobe, GitHub, iCloud, Adobe Stock)
- Sin backend — funciona completamente offline

## 🛠️ Stack

- **Next.js 16.3.5** con App Router
- **TypeScript** (strict)
- **Tailwind CSS** v4
- **idb** para IndexedDB
- **Workbox** para Service Worker
- **Turbopack** para desarrollo rápido

## 📋 Requisitos

- Node.js 18+ (recomendado 20+)
- npm o yarn

## 🚀 Instalación

```bash
# Clonar el repositorio
git clone <repo-url>
cd subscription-guardian

# Instalar dependencias
npm install

# Iniciar modo desarrollo
npm run dev

# Build para producción
npm run build
```

El servidor arranca en `http://localhost:3000`

## 📱 Instalación como PWA

### iOS (iPhone/iPad)
1. Abrir la app en Safari
2. Pulsar el botón "Compartir" (⬆️)
3. Seleccionar "Añadir a la pantalla de inicio"

### Android
1. Abrir en Chrome
2. Pulsar el menú (⋮)
3. Seleccionar "Añadir a pantalla de inicio" o "Instalar aplicación"

### Desktop
1. Abrir en Chrome/Edge
2. Aparecerá un ícono de instalación en la barra de direcciones
3. O ir al menú → "Instalar Subscription Guardian"

## 📁 Estructura del proyecto

```
subscription-guardian/
├── public/
│   ├── icon-192.png          # Icono PWA 192x192
│   ├── icon-512.png          # Icono PWA 512x512
│   ├── icon-192.svg          # Fuente SVG del icono
│   ├── icon-512.svg          # Fuente SVG del icono
│   ├── manifest.json         # Manifest JSON estático
│   └── sw.js                 # Service Worker
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Layout raíz (metadata, fonts, PWA)
│   │   ├── page.tsx          # Dashboard principal
│   │   ├── manifest.ts       # Manifest dinámico (Next.js)
│   │   ├── register-sw.tsx   # Registro de Service Worker
│   │   └── globals.css       # Estilos globales Tailwind
│   ├── components/
│   │   ├── AddSubscriptionForm.tsx   # Formulario de alta
│   │   ├── Header.tsx                # Header + TabBar
│   │   ├── SubscriptionCard.tsx      # Card de suscripción
│   │   └── SummaryCard.tsx           # Tarjetas de resumen
│   ├── db/
│   │   ├── database.ts   # IndexedDB con idb + datos de ejemplo
│   │   └── index.ts      # Re-exportación limpia
│   ├── types/
│   │   └── subscription.ts  # Definiciones TypeScript
│   └── utils/
│       ├── constants.ts        # Ciclos y categorías
│       ├── helpers.ts          # Utilidades de cálculo
│       └── push-notifications.ts # Web Push API
├── next.config.ts
├── package.json
└── tsconfig.json
```

## 🔮 Próximas mejoras

- [ ] Backend con API para sincronización entre dispositivos
- [ ] Notificaciones push configurables por cada suscripción
- [ ] Exportar/Importar datos (JSON, CSV)
- [ ] Modo oscuro/claro automático
- [ ] Gráficos de gasto mensual
- [ ] Recordatorio de cancelación automática
- [ ] Compartir suscripciones entre usuarios (familia)
- [ ] Integración con calendarios (Google Calendar, Apple Calendar)

## 📄 Licencia

MIT
