/**
 * mealSlots — «Mis comidas» de Nutrición: qué comidas usa cada persona, en qué orden y a qué hora se anota cada una.
 * Lógica PURA (sin React Native), con pruebas.
 *
 * 2026-10-16 (pedido del usuario: «revisa a full ese apartado, porque de hacerse mal nos pitea la app entera»). Lo que se
 * corrigió:
 *  - La lista por defecto ponía la cena ANTES que la once, y ese orden quedaba guardado en cada teléfono. Ahora el orden
 *    sale siempre del horario del día (services/mealSchedule.ts), no de cómo quedó guardada la lista.
 *  - Borrar una comida de siempre la sacaba de la lista: lo anotado por chat en esa comida quedaba en otra (la de la hora)
 *    o al final con un nombre genérico. Ahora las seis de siempre no se borran, se OCULTAN, y siguen existiendo para
 *    mostrar lo ya anotado con su nombre y en su lugar.
 *  - Una comida propia no tenía hora: quedaba al final y, en un día anterior, a mediodía. Ahora tiene su hora.
 *  - Un nombre vacío borraba la comida sin avisar, y podían quedar dos comidas con el mismo nombre. Ahora no.
 *  - «Cena» como comida propia era otra cena distinta de la de siempre: ahora vuelve a mostrar la de siempre.
 */

import { MEAL_ORDER, typicalHour, typicalTimeOf, slotIsPast, fitsSlot, TOLERANCE_H, hourOf, dayStartHour } from './mealSchedule';

export interface MealSlot {
  id: string;
  name: string;
  emoji: string;
  /** Oculta en la lista para anotar (las de siempre no se borran: así lo ya anotado sigue en su lugar). */
  hidden?: boolean;
  /** Hora habitual de una comida propia (horas desde la medianoche, de a media hora). Las de siempre usan el horario del día. */
  hour?: number;
}

export const KNOWN_SLOTS: ReadonlyArray<MealSlot> = [
  { id: 'desayuno',    name: 'Desayuno',        emoji: '🌅' },
  { id: 'colacion_am', name: 'Colación mañana', emoji: '🍎' },
  { id: 'almuerzo',    name: 'Almuerzo',        emoji: '☀️' },
  { id: 'colacion_pm', name: 'Colación tarde',  emoji: '🍌' },
  { id: 'once',        name: 'Once',            emoji: '🫖' },
  { id: 'cena',        name: 'Cena',            emoji: '🌙' },
];
const KNOWN_IDS = new Set<string>(MEAL_ORDER);
export const isKnownSlot = (id: string) => KNOWN_IDS.has(id);
export const MAX_VISIBLE = 8;
export const NAME_MAX = 20;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Las de siempre, tal cual vienen (copias nuevas: nadie puede modificar la tabla). */
export const defaultSlots = (): MealSlot[] => KNOWN_SLOTS.map((s) => ({ ...s }));

/** Nombres con que se dice cada comida de siempre («merienda» es la colación de la tarde). */
const KNOWN_NAMES: Record<string, string> = {
  desayuno: 'desayuno', 'colacion manana': 'colacion_am', 'colacion de la manana': 'colacion_am', 'colacion de media manana': 'colacion_am',
  'colacion am': 'colacion_am', almuerzo: 'almuerzo', 'colacion tarde': 'colacion_pm', 'colacion de la tarde': 'colacion_pm',
  'colacion pm': 'colacion_pm', merienda: 'colacion_pm', once: 'once', onces: 'once', 'la once': 'once', cena: 'cena',
};
/** ¿Ese nombre es una de las comidas de siempre? («Cena», «Merienda» → su id) */
export const knownIdForName = (name: string): string | null => KNOWN_NAMES[fold(name)] ?? null;

/** Hora del día relativa al inicio del ciclo (5:00): para ordenar, una comida de la 1 AM va después de la cena. */
const relHour = (h: number) => (((h - 5) % 24) + 24) % 24;
const clampHour = (h: number) => Math.min(23.5, Math.max(0, Math.round(h * 2) / 2));

/** Dónde va una comida en el día (horas desde las 5:00). Las de siempre, por el horario normal; las propias, por su hora. */
export function slotOrderKey(slot: Pick<MealSlot, 'id' | 'hour'>): number {
  if (slot.id === 'merienda') return relHour(typicalHour('colacion_pm') ?? 16.5);
  const t = typicalHour(slot.id);
  if (t !== null) return relHour(t);
  return typeof slot.hour === 'number' ? relHour(slot.hour) : 23.9;
}

/** Ordenadas como pasa el día (desayuno → … → once → cena), las propias en su hora. Ante un empate, la de siempre primero. */
export function sortSlots(slots: MealSlot[]): MealSlot[] {
  const k = (s: MealSlot) => (isKnownSlot(s.id) ? 0 : 1); // a la misma hora, primero la de siempre
  return slots.map((s, i) => ({ s, i })).sort((a, b) => slotOrderKey(a.s) - slotOrderKey(b.s) || k(a.s) - k(b.s) || a.i - b.i).map((x) => x.s);
}

/**
 * Lo guardado en el teléfono → una lista válida. Tolera cualquier cosa (JSON roto, campos que faltan, ids repetidos):
 * - las seis de siempre están SIEMPRE (las que alguien borró antes quedan ocultas);
 * - nombres vacíos vuelven al nombre de siempre; una comida propia sin nombre se descarta;
 * - al menos una a la vista; orden del día.
 */
export function normalizeSlots(raw: unknown): MealSlot[] {
  if (!Array.isArray(raw)) return defaultSlots();
  const out: MealSlot[] = [];
  const seen = new Set<string>();
  for (const r of raw as any[]) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id.trim() || r.id.length > 40 || seen.has(r.id)) continue;
    const base = KNOWN_SLOTS.find((k) => k.id === r.id);
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, NAME_MAX) : '';
    if (!base && !name) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      name: name || base!.name,
      emoji: typeof r.emoji === 'string' && r.emoji.trim() ? r.emoji.trim().slice(0, 8) : base?.emoji ?? '🍽️',
      ...(r.hidden === true ? { hidden: true } : {}),
      ...(!base && typeof r.hour === 'number' && Number.isFinite(r.hour) ? { hour: clampHour(r.hour) } : {}),
    });
  }
  // Las de siempre que no estaban (alguien las borró con la versión anterior): ocultas, para que lo anotado siga en su lugar
  for (const k of KNOWN_SLOTS) if (!seen.has(k.id)) out.push({ ...k, hidden: true });
  if (!out.some((s) => !s.hidden)) for (const s of out) if (isKnownSlot(s.id)) delete s.hidden;
  return sortSlots(out);
}

export const visibleSlots = (slots: MealSlot[]) => slots.filter((s) => !s.hidden);

/** «🌙 Cena» (también para una comida oculta: lo ya anotado ahí se sigue viendo con su nombre). */
export function slotLabel(slots: MealSlot[], id: string, fallback: (id: string) => string): string {
  const s = slots.find((x) => x.id === id) ?? KNOWN_SLOTS.find((x) => x.id === id);
  return s ? `${s.emoji} ${s.name}` : `🍽️ ${fallback(id)}`;
}

/**
 * En qué orden se muestran las comidas de un día: como pasa el día. Las que no están en la lista (ids antiguos) van por la
 * hora de su primer alimento. Antes: primero las de la lista en su orden guardado (cena antes que once) y las demás al final.
 */
export function displayOrder(slots: MealSlot[], entries: Array<{ mealType: string; loggedAt: string }>): string[] {
  const first = new Map<string, number>();
  for (const e of entries) {
    const t = Date.parse(e.loggedAt);
    const h = Number.isNaN(t) ? 23.9 : relHour(hourOf(new Date(t)));
    first.set(e.mealType, Math.min(first.get(e.mealType) ?? Infinity, h));
  }
  const key = (id: string) => {
    const s = slots.find((x) => x.id === id);
    if (s) return slotOrderKey(s);
    const k = typicalHour(id);
    return k !== null ? relHour(k) : first.get(id) ?? 23.9;
  };
  return [...first.keys()].sort((a, b) => key(a) - key(b));
}

/**
 * Agrega una comida propia. Si el nombre es una de las de siempre («Cena», «Merienda») o una propia oculta, se vuelve a
 * mostrar esa en vez de crear otra igual.
 */
export function addCustomSlot(slots: MealSlot[], name: string, hour: number, emoji: string, now = Date.now()): { slots: MealSlot[]; error?: string; note?: string } {
  const n = name.trim().slice(0, NAME_MAX);
  if (!n) return { slots, error: 'Escribe el nombre de la comida.' };
  const knownId = knownIdForName(n);
  const same = slots.find((s) => (knownId && s.id === knownId) || fold(s.name) === fold(n));
  if (same) {
    if (!same.hidden) return { slots, error: `Ya tienes «${same.name}».` };
    if (visibleSlots(slots).length >= MAX_VISIBLE) return { slots, error: `Puedes tener hasta ${MAX_VISIBLE} comidas a la vista.` };
    const next = slots.map((s) => (s === same ? { ...s, hidden: undefined, ...(isKnownSlot(s.id) ? {} : { hour: clampHour(hour) }) } : s));
    return { slots: sortSlots(next.map(clean)), note: `«${same.name}» ya existía: la volví a mostrar.` };
  }
  if (visibleSlots(slots).length >= MAX_VISIBLE) return { slots, error: `Puedes tener hasta ${MAX_VISIBLE} comidas a la vista.` };
  const slot: MealSlot = { id: `meal_${now}`, name: n, emoji, hour: clampHour(hour) };
  return { slots: sortSlots([...slots, slot]) };
}

const clean = (s: MealSlot): MealSlot => { const c = { ...s }; if (!c.hidden) delete c.hidden; if (c.hour === undefined) delete c.hour; return c; };

/**
 * Lo que quedó en el editor → la lista a guardar, o el problema que impide guardarla. Un nombre vacío vuelve al que tenía
 * (antes borraba la comida sin avisar). No puede haber dos con el mismo nombre ni quedar ninguna a la vista.
 */
export function finalizeEdit(prev: MealSlot[], edited: MealSlot[]): { slots: MealSlot[]; error?: string } {
  const out = edited.map((s) => {
    const before = prev.find((p) => p.id === s.id);
    const known = KNOWN_SLOTS.find((k) => k.id === s.id);
    const name = s.name.trim().slice(0, NAME_MAX) || before?.name || known?.name || '';
    return clean({ ...s, name, ...(typeof s.hour === 'number' ? { hour: clampHour(s.hour) } : {}) });
  }).filter((s) => s.name);
  const vis = visibleSlots(out);
  if (!vis.length) return { slots: prev, error: 'Deja al menos una comida a la vista.' };
  if (vis.length > MAX_VISIBLE) return { slots: prev, error: `Puedes tener hasta ${MAX_VISIBLE} comidas a la vista.` };
  const names = new Map<string, string>();
  for (const s of vis) {
    const k = fold(s.name);
    if (names.has(k)) return { slots: prev, error: `Hay dos comidas que se llaman «${s.name}». Cámbiale el nombre a una.` };
    names.set(k, s.id);
  }
  // Una propia que se llama como una de siempre («Once») confunde al anotar por chat: se avisa
  for (const s of vis) {
    const k = knownIdForName(s.name);
    if (k && k !== s.id) {
      const owner = out.find((x) => x.id === k);
      if (owner && !owner.hidden) return { slots: prev, error: `«${s.name}» es el nombre de otra comida de siempre. Usa otro nombre.` };
    }
  }
  // Ids repetidos (no debería pasar) fuera; las de siempre siempre presentes
  return { slots: normalizeSlots(out) };
}

/** Restablecer: las seis de siempre a la vista con su nombre; las propias quedan ocultas (lo anotado en ellas se sigue viendo). */
export function resetSlots(slots: MealSlot[]): MealSlot[] {
  const customs = slots.filter((s) => !isKnownSlot(s.id)).map((s) => ({ ...s, hidden: true as const }));
  return sortSlots([...defaultSlots(), ...customs]);
}

/** «18:30» */
export const fmtSlotHour = (h: number) => { const m = Math.round(clampHour(h) * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
/** Media hora más o menos, dando la vuelta al día. */
export const stepHour = (h: number, delta: number) => clampHour((((h + delta) % 24) + 24) % 24);

/**
 * A qué hora queda un alimento anotado en esa comida (`day`: el día de comida que se está viendo, a medianoche).
 * - Hoy, comida que ya pasó: a su hora (≤ ahora). Comida de esta hora: ahora.
 * - Hoy, comida que AÚN NO LLEGA (la cena elegida a las 11): a su hora de hoy. Pedido del usuario (2026-10-16): «que se
 *   respete como cena, porque ahí es error del usuario, no del sistema». Antes quedaba a las 11 y los cálculos la contaban
 *   como colación.
 * - Otro día: a la hora de esa comida ese día.
 * Las propias usan su hora (±45 min de tolerancia, como las de siempre).
 */
export function entryTimeFor(
  slot: MealSlot | { id: string; hour?: number }, day: Date, now: Date, opts: { isToday: boolean; wakeHour?: number | null; usualWake?: number | null },
): { at: Date; approx: boolean; when: 'now' | 'past' | 'future' | 'day' } {
  const wake = opts.isToday ? opts.wakeHour : opts.usualWake;
  if (isKnownSlot(slot.id) || slot.id === 'merienda') {
    if (!opts.isToday) return { at: typicalTimeOf(slot.id, day, { wakeHour: wake, notAfter: now }), approx: true, when: 'day' };
    if (slotIsPast(slot.id, now, wake)) return { at: typicalTimeOf(slot.id, day, { wakeHour: wake, notAfter: now }), approx: true, when: 'past' };
    if (fitsSlot(slot.id, now, wake)) return { at: now, approx: false, when: 'now' };
    return { at: typicalTimeOf(slot.id, day, { wakeHour: wake }), approx: true, when: 'future' };
  }
  if (typeof slot.hour !== 'number') {
    return opts.isToday ? { at: now, approx: false, when: 'now' } : { at: typicalTimeOf(slot.id, day, { notAfter: now }), approx: true, when: 'day' };
  }
  const at = new Date(day);
  at.setHours(0, 0, 0, 0);
  at.setMinutes(Math.round(slot.hour * 60));
  // una comida propia de madrugada (antes de que parta el día) es del día calendario siguiente
  if (slot.hour < dayStartHour(opts.usualWake)) at.setDate(at.getDate() + 1);
  at.setSeconds(now.getSeconds(), now.getMilliseconds());
  if (!opts.isToday) return { at: at.getTime() > now.getTime() ? new Date(now) : at, approx: true, when: 'day' };
  const diffH = (now.getTime() - at.getTime()) / 3_600_000;
  if (Math.abs(diffH) <= TOLERANCE_H) return { at: now, approx: false, when: 'now' };
  return diffH > 0 ? { at, approx: true, when: 'past' } : { at, approx: true, when: 'future' };
}
