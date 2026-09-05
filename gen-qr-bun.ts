import QRCode from "https://esm.sh/qrcode@1.5.4";
import { writeFileSync } from "fs";

const url = "exp://192.168.100.46:8081";
const outPath = "./expo-qr-lan.png";

const buf: Buffer = await QRCode.toBuffer(url, { width: 400, margin: 2 });
writeFileSync(outPath, buf);
console.log("QR generado:", outPath);
