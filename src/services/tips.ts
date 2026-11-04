// ============================================================
// Eris Mobile — un tip por día ("¿Sabías que…?")
//
// Plan para que la app se digiera fácil (2026-10-10, paso 3): no mostrar todo el día uno, sino presentar UNA función por
// día en Inicio, en el momento en que sirve. Solo los tips de lo que la persona usa (Finanzas si tiene Finanzas, el
// código de barras si tiene Nutrición…). "Ya lo sé" lo descarta para siempre; la × lo esconde hasta mañana. El mismo tip
// se mantiene todo el día; al día siguiente pasa al siguiente que no haya visto. Cuando se acaban, no se muestra nada.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

export type TipAction =
  | { kind: 'chat'; label: string; message?: string }   // abre el chat (con una pregunta inofensiva, si la hay)
  | { kind: 'nutri'; label: string }
  | { kind: 'forge'; label: string }
  | { kind: 'profile'; label: string }
  | { kind: 'more'; label: string }                     // abre "Ver más de tu día"
  | { kind: 'ok'; label: string };                      // solo entendido

export interface Tip {
  id: string;
  icon: string;
  title: string;
  text: string;
  action: TipAction;
  /** módulo que tiene que estar activo para que el tip tenga sentido */
  needs?: 'nutri' | 'toji' | 'finanzas';
}

/** En orden: lo más útil para alguien que recién empieza, primero. */
export const TIPS: Tip[] = [
  { id: 'chat_log', icon: '💬', title: 'Anota hablando', text: 'Escríbele «anota un pan con palta» y Eris lo registra con sus calorías. No hace falta buscar nada.', action: { kind: 'chat', label: 'Abrir el chat' } },
  { id: 'clock', icon: '🕰️', title: 'Tu reloj interno', text: 'El dial de Inicio parte cuando despiertas: te dice en qué comida estás y cuánta agua va al día a esta hora.', action: { kind: 'ok', label: 'Entendido' } },
  { id: 'ask_status', icon: '📊', title: 'Pregúntale «¿cómo voy?»', text: 'Eris cruza comida, agua, sueño y movimiento y te dice qué hacer ahora.', action: { kind: 'chat', label: 'Preguntar', message: '¿Cómo voy hoy?' } },
  { id: 'voice', icon: '🎙️', title: 'Díselo por voz', text: 'Mantén el micrófono en el chat y habla normal. Si entendió algo mal, lo corrige con el contexto.', action: { kind: 'chat', label: 'Abrir el chat' } },
  { id: 'barcode', icon: '📷', title: 'Escanea el envase', text: 'En Nutrición, el código de barras trae las calorías y los sellos del producto.', action: { kind: 'nutri', label: 'Ir a Nutrición' }, needs: 'nutri' },
  { id: 'food_water', icon: '🍉', title: 'Tu comida también hidrata', text: 'La fruta, la sopa o una jalea suman a tu agua del día según el agua que traen.', action: { kind: 'ok', label: 'Entendido' } },
  { id: 'water_notif', icon: '💧', title: '+250 ml sin abrir la app', text: 'Cuando te recuerde el agua, toca «+250 ml» en la notificación y queda anotado.', action: { kind: 'ok', label: 'Entendido' } },
  { id: 'finance_chat', icon: '💰', title: 'Anota gastos hablando', text: '«Gasté 5 lucas en el almuerzo» y queda en Finanzas, con su categoría.', action: { kind: 'chat', label: 'Abrir el chat' }, needs: 'finanzas' },
  { id: 'forge', icon: '🔥', title: 'Forge: entrenar como juego', text: 'Misiones del día, niveles y racha. Eris también te puede armar la rutina.', action: { kind: 'forge', label: 'Abrir Forge' }, needs: 'toji' },
  { id: 'schedule', icon: '🌙', title: '¿Trasnochas o trabajas de noche?', text: 'Fija tu hora de despertar en Perfil y tus comidas, tu agua y tus avisos se ordenan a tu día.', action: { kind: 'profile', label: 'Ir a Perfil' } },
  { id: 'medical', icon: '🩺', title: 'Cuéntale de tu salud', text: 'En Perfil puedes poner condiciones y medicamentos: Eris ajusta tus metas y sus consejos.', action: { kind: 'profile', label: 'Ir a Perfil' } },
  { id: 'pattern', icon: '🧠', title: 'Aprende tu patrón', text: 'Con unos días de datos, Eris compara tu día con tus días normales, no con promedios de nadie.', action: { kind: 'more', label: 'Ver mi análisis' } },
  { id: 'journal', icon: '✨', title: 'Tu ánimo también cuenta', text: 'Anota cómo te sentiste: Eris lo cruza con tu sueño y tu comida.', action: { kind: 'more', label: 'Anotar ánimo' } },
  { id: 'bubble', icon: '🫧', title: 'Eris sobre otras apps', text: 'Activa la burbuja en Perfil y háblale sin salir de lo que estás haciendo.', action: { kind: 'profile', label: 'Ir a Perfil' } },
];

const KEY = 'eris_tips_v1';
interface TipState { day?: string; current?: string; hiddenDay?: string; seen: string[]; dismissed: string[] }

const today = () => new Date().toDateString();
async function load(): Promise<TipState> {
  try { const s = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null'); if (s && Array.isArray(s.seen)) return s; } catch {}
  return { seen: [], dismissed: [] };
}
const save = (s: TipState) => AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});

/** El tip de hoy (el mismo todo el día), o null si lo escondió hoy o ya no quedan. */
export async function tipOfToday(modules: { nutri: boolean; toji: boolean; finanzas: boolean }): Promise<Tip | null> {
  const s = await load();
  const d = today();
  if (s.hiddenDay === d) return null;
  const ok = (t: Tip) => !s.dismissed.includes(t.id) && (!t.needs || modules[t.needs]);
  if (s.day === d && s.current) {
    const t = TIPS.find((x) => x.id === s.current);
    return t && ok(t) ? t : null;
  }
  const next = TIPS.find((t) => ok(t) && !s.seen.includes(t.id));
  if (!next) return null;
  await save({ ...s, day: d, current: next.id, seen: [...s.seen, next.id] });
  return next;
}

/** "Ya lo sé": no vuelve a aparecer. */
export async function dismissTip(id: string) {
  const s = await load();
  await save({ ...s, dismissed: [...new Set([...s.dismissed, id])], hiddenDay: today() });
}

/** La ×: se esconde hasta mañana. */
export async function hideTipToday() {
  const s = await load();
  await save({ ...s, hiddenDay: today() });
}
