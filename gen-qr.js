const qr = require('qrcode');
const path = require('path');

// QR LAN (misma WiFi)
qr.toFile(path.join(__dirname, 'expo-qr-lan.png'), 'exp://192.168.100.46:8081', { width: 500, margin: 3 }, (err) => {
  if (err) console.error('LAN error:', err); else console.log('QR LAN:', path.join(__dirname, 'expo-qr-lan.png'));
});

// QR Tailscale (cualquier red)
qr.toFile(path.join(__dirname, 'expo-qr-tailscale.png'), 'exp://100.113.151.4:8081', { width: 500, margin: 3 }, (err) => {
  if (err) console.error('Tailscale error:', err); else console.log('QR Tailscale:', path.join(__dirname, 'expo-qr-tailscale.png'));
});
