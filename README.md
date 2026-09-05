# 📱 Eris Mobile — Sovereign Executive Dashboard

> Interfaz táctil soberana del ecosistema **AXS (Artificial eXperience System)**

**Eris Mobile** es la aplicación nativa Android que actúa como panel de mando remoto para comunicarse con **Eris Core** en tiempo real. Construida con React Native (Expo) con experiencia edge-to-edge, es el punto de acceso principal al ecosistema desde cualquier lugar vía LAN o túnel seguro (Tailscale / Cloudflared).

---

## 🏛️ Posición en el Panteón AXS

```
AXS (Ecosistema)
 └── Eris (Core — C:\Proyectos\eris\)
      └── Eris Mobile ← Tú estás aquí
           Interfaz táctil I/O del sistema Eris
```

La app conecta directamente con `Eris Core` via WebSocket. El perfil de autenticación determina la identidad activa:
- Perfil `ikaros` → 🔱 **Hestia** (Admin Soberana)
- Perfil `eris` → ⚡ **Eris** (Asistente Pública)

---

## ⚙️ Stack Técnico

| Capa              | Tecnología                                                   |
|-------------------|--------------------------------------------------------------|
| Framework         | React Native via **Expo** (blank-typescript)                 |
| Navegación        | React Navigation (Drawer + Stack)                            |
| Red               | `WebSocketManager.ts` — reconexión adaptativa resiliente     |
| Biometría         | **Android Health Connect** (`MetricsService.ts`)             |
| Auth              | `AuthStorage.ts` — gestión segura de credenciales locales    |
| Estilo            | Edge-to-Edge nativo Android                                  |

---

## 📐 Pantallas y Funcionalidades

### `LoginScreen.tsx`
Autenticación Zero-Knowledge. El PIN se verifica localmente sin enviarse por URL al servidor.

### `ChatScreen.tsx`
- Interfaz de chat principal con **streaming token a token** desde el LLM.
- Cajón lateral de proyectos (Project Drawer) para gestionar múltiples contextos de conversación.
- Renderizado visual diferenciado de los tokens de pensamiento `<think>` vs la respuesta final.

### `HomeScreen.tsx`
Dashboard de resumen del estado del sistema y acceso rápido a módulos.

### `MetricsScreen.tsx`
Visualización de métricas biométricas y de sistema integradas desde **Android Health Connect**.

### `GlucoTrackScreen.tsx`
Dashboard dedicado al módulo **GlucoTrack** (Valkyria BioOS):
- Gráfico histórico de glucosa en tiempo real (LibreLinkUp).
- Scanner de código de barras para registro nutricional.
- Integración con `NutritionTool` del backend vía FatSecret API.

---

## 🔌 Conectividad

| Modo           | Protocolo                | Caso de uso                                               |
|----------------|--------------------------|-----------------------------------------------------------|
| **LAN local**  | `ws://192.168.x.x:3000`  | Cuando el host de Eris Core está en la misma red Wi-Fi    |
| **WAN remoto** | `wss://` via Tailscale   | Acceso seguro fuera de la red local, sin latencia perceptible |
| **Cloudflare** | Túnel reverso            | Exposición pública soberana sin abrir puertos             |

> **Nota**: La app requiere que `eris-core` esté corriendo paralelamente en el host.

---

## 🚀 Cómo Levantar el Entorno

1. Instalar **Expo Go** en Android desde [expo.dev/go](https://expo.dev/go).
2. Asegurarse de que `Eris Core` está corriendo (`bun run gui` en `C:\Proyectos\eris\`).
3. Instalar dependencias e iniciar:

```bash
bun install
bun run start
```

4. Escanear el código QR con Expo Go.

### Generar QR de acceso rápido
```bash
bun run gen-qr       # QR para Expo Go (red local)
```

### Build APK (Android nativo)
```bash
./build-apk.ps1      # Script de compilación para APK standalone
```

---

## 🗂️ Estructura del Proyecto

```
eris-mobile/
├── src/
│   ├── screens/
│   │   ├── ChatScreen.tsx       # Chat principal + Project Drawer
│   │   ├── HomeScreen.tsx       # Dashboard de inicio
│   │   ├── LoginScreen.tsx      # Autenticación Zero-Knowledge
│   │   ├── MetricsScreen.tsx    # Biometría y métricas del sistema
│   │   └── GlucoTrackScreen.tsx # Dashboard GlucoTrack + scanner
│   └── services/
│       ├── WebSocketManager.ts  # Conexión resiliente con Eris Core
│       ├── AuthStorage.ts       # Gestión segura de credenciales locales
│       └── MetricsService.ts    # Integración Android Health Connect
├── plugins/                     # Plugins nativos Expo
├── assets/                      # Recursos estáticos
└── App.tsx                      # Punto de entrada principal
```

---

## 🔗 Ecosistema Relacionado

| Repositorio   | Descripción                                                   |
|---------------|---------------------------------------------------------------|
| `eris`        | Backend Core — Motor LLM, WebSocket, herramientas agénticas   |
| `AXS` (Vault) | Bóveda Obsidian — Memoria de largo plazo y base de conocimiento |
