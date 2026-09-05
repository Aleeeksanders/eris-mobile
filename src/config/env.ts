// ============================================================
// Eris Mobile — Configuración de Red
// ============================================================
// LOCAL_URL  → IP de tu PC en WiFi de casa (rápido, sin latencia)
// CLOUD_URL  → IP de Tailscale (funciona desde CUALQUIER red)
//
// ⚠️ Actualiza TAILSCALE_IP con tu IP de Tailscale:
//    Instala Tailscale en tu PC → ejecuta: tailscale ip -4
//    La IP será algo como: 100.x.x.x

const TAILSCALE_IP = '100.113.151.4'; // axs-ceo (tu PC)

export const NetworkConfig = {
  // IP LAN de tu PC (solo funciona en casa, en el mismo WiFi)
  LOCAL_URL: 'ws://192.168.100.46:3000/ws',
  
  // IP de Tailscale: funciona desde cualquier red, cualquier lugar
  CLOUD_URL: `ws://${TAILSCALE_IP}:3000/ws`,
  
  // true = intenta primero Tailscale (recomendado para acceso universal)
  // false = intenta primero LAN local
  PREFER_CLOUD: true,
};
