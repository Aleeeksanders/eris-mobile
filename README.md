# Eris Mobile UI (Dashboard Remoto)

Este repositorio almacena la interfaz de red móvil (Frontend Nativo) del ecosistema **AXS**. Construida sobre React Native (Expo), actúa como el panel de control táctil (Dashboard) para comunicarse asincrónicamente con la Red Neuronal Desacoplada alojada en **Eris Core**.

## Propósito Funcional

- **Conectividad Neutra:** Integración modular tipo *Microservicio*. La App puede acceder al cerebro local mediante LAN (ej: `192.168.x.x`) cuando el host de Eris (`Bun`) esté expuesto en Wi-Fi, o vía túnel reverso (Ngrok) para comunicación WAN global sin latencia perceptible.
- **Rendering Dinámico:** Visualización paramétrica del flujo de razonamiento (`<think>`) directo desde la matriz de la IA, parseable en la UI móvil antes de las consolidaciones verbales conclusivas.
- **Cache Local:** Estructura modular preparada para renderizar "Proyectos" en el cajón lateral, preservando el aislamiento de los contextos.

## Tecnologías Base
- **Frontend Framework:** `React Native` via `Expo` (Pila `blank-typescript`).
- **Estados & Ruteadores:** `React Navigation` (Manejo de Drawers fluidos e integraciones táctiles/gestuales orgánicas).
- **Red:** Gestor Websocket resiliente implementado, permitiendo reconexiones adaptativas (`WebSocketManager.ts`).

## Cómo levantar el Entorno Híbrido

Para instanciar la App en tu dispositivo móvil como visualizador directo de la matriz:
1. Instalar la aplicación oficial de [Expo Go](https://expo.dev/go) en Android.
2. Iniciar el servicio desde este repositorio usando Node/Bun:
```bash
bun install
bun run start
```
3. Escanear el código matricial (QR) con la aplicación. **Nota:** Depende de que `eris-core` esté corriendo paralelamente en el host.
