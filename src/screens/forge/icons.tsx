// Íconos de Forge: los mismos trazos que usaba el HTML (lucide), dibujados con react-native-svg.
import React from 'react';
import { SvgXml } from 'react-native-svg';

const P: Record<string, string> = {
"Dumbbell": "<path d=\"M6.5 6.5l11 11M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M7 17l-4 4M17 7l4-4\"/>",
"Utensils": "<path d=\"M3 2v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2M5 2v20M21 15V2a5 3 0 0 0-3 5v6a2 2 0 0 0 2 2h1zm0 0v7\"/>",
"Droplets": "<path d=\"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 4 12 2c-.5 2-2 4-4 6.5S5 13 5 15a7 7 0 0 0 7 7z\"/>",
"Footprints": "<path d=\"M4 16v-2a3 3 0 0 1 6 0v2M14 16v-2a3 3 0 0 1 6 0v2M4 20h6M14 20h6\"/>",
"Moon": "<path d=\"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z\"/>",
"GlassWater": "<path d=\"M5 3h14l-1 17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 3zM5.5 9h13\"/>",
"Flame": "<path d=\"M12 2c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1 .5-2 1-3 .5 1 1.5 1.5 2 1.5C10 7 12 5 12 2z\"/>",
"Swords": "<path d=\"M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M5 14l-2 2v3h3l2-2\"/>",
"HeartPulse": "<path d=\"M12 21s-8-5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 1-.3 2-.7 3M3.5 13h3l2 3 3-6 2 3h3\"/>",
"Wind": "<path d=\"M3 8h10a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8a3 3 0 1 1-3 3\"/>",
"RotateCcw": "<path d=\"M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5\"/>",
"Info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5M12 8h.01\"/>",
"Check": "<path d=\"M5 12l5 5L20 6\"/>",
"ListChecks": "<path d=\"M3 7l2 2 4-4M3 17l2 2 4-4M13 6h8M13 12h8M13 18h8\"/>",
"Trophy": "<path d=\"M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 18h6M10 22h4M12 14v4\"/>",
"Lock": "<rect x=\"4\" y=\"11\" width=\"16\" height=\"10\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 0 1 8 0v4\"/>",
"ChevronDown": "<path d=\"M5 9l7 7 7-7\"/>",
"Sparkles": "<path d=\"M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM18 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z\"/>",
"Target": "<circle cx=\"12\" cy=\"12\" r=\"8\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/>",
"Home": "<path d=\"M3 11l9-8 9 8M5 10v10h14V10\"/>",
"GitBranch": "<path d=\"M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 6c0 6-6 4-6 9\"/>",
"X": "<path d=\"M6 6l12 12M18 6L6 18\"/>",
"Hand": "<path d=\"M18 11V6a1.5 1.5 0 0 0-3 0M15 6V4a1.5 1.5 0 0 0-3 0v2M12 6V4.5a1.5 1.5 0 0 0-3 0V11M9 11V8a1.5 1.5 0 0 0-3 0v6a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6v-3\"/>",
"Plus": "<path d=\"M12 5v14M5 12h14\"/>",
"Minus": "<path d=\"M5 12h14\"/>",
"ScrollText": "<path d=\"M5 4h11v13a3 3 0 0 0 3 3H8a3 3 0 0 1-3-3V4zM19 17V7a2 2 0 0 0-2-2M9 8h6M9 12h5\"/>",
"Upload": "<path d=\"M4 17v3h16v-3M12 3v12M7 8l5-5 5 5\"/>",
"FileText": "<path d=\"M6 2h8l4 4v16H6zM14 2v4h4M9 13h6M9 17h6\"/>",
"Trash2": "<path d=\"M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6\"/>",
"User": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21a8 8 0 0 1 16 0\"/>",
"CalendarDays": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"17\" rx=\"2\"/><path d=\"M3 9h18M8 2v4M16 2v4M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01\"/>",
"Shield": "<path d=\"M12 2l8 3v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5z\"/>",
"Skull": "<path d=\"M12 2a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14zM9 12h.01M15 12h.01M10 19v2M14 19v2\"/>",
"Crown": "<path d=\"M3 7l4 4 5-7 5 7 4-4-2 13H5z\"/>",
"Heart": "<path d=\"M12 21s-8-5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11z\"/>",
"Zap": "<path d=\"M13 2L4 14h7l-2 8 9-12h-7z\"/>"
};

// Los que agregó Forge 2.0 (lucide)
Object.assign(P, {
  ChevronRight: '<path d="m9 18 6-6-6-6"/>',
  ChevronLeft: '<path d="m15 18-6-6 6-6"/>',
  TrendingUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  Search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  Timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
  Pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  BarChart: '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
  Settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  HelpCircle: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
});

export type IconName = keyof typeof P | string;

export function Icon({ name, size = 20, color = '#ece8e4', strokeWidth = 2, fill = 'none' }: { name: IconName; size?: number; color?: string; strokeWidth?: number; fill?: string }) {
  const body = P[name] ?? '';
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
}
