// Endpoints variables. Ajustables según red del usuario
// Local IP es la IP de tu PC en la subred (ej: 192.168.1.15)
// Cloud IP es tu túnel Ngrok o Tailscale para cuando salgas de casa

export const NetworkConfig = {
  // Configura con la IP LAN de tu Laptop
  LOCAL_URL: 'ws://192.168.1.111:3000/ws',
  
  // Opcional: Túnel remoto cuando estés en calle sin WiFi
  CLOUD_URL: 'wss://tu-tunel-ngrok.ngrok.app/ws',
  
  // Priorizar conectarnos por Cloud o Local primero
  PREFER_CLOUD: false,
};
