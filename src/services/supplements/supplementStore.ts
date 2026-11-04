// ============================================================
// Eris Mobile — «Mis suplementos»: dónde viven en el teléfono (fase I5, 2026-10-23)
//
// Un solo estado (supplementCore.SupState) guardado por cuenta (AsyncStorage pasa por ScopedStorage). Todo cambio pasa por
// acá: se guarda, se avisa a las pantallas, se le manda a Eris (update_supplement_context: lo de hoy y la constancia, más el
// estado completo, que el servidor guarda cifrado y devuelve si este teléfono aparece sin nada) y se reprograman los avisos.
// «Tomado» también baja el stock del Botiquín (Inventario) si el suplemento está enlazado a una cosa de ahí.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { guardar, apartarDanado } from '../saveGuard';
import { AppState, DeviceEventEmitter } from 'react-native';
import {
  applyOp, agregarSup, destomar, diaKey, editarSup, emptySupState, extract, fmtDosis, quitarSup, tomar, tomasDe,
  type MiSup, type Persona, type SupCtx, type SupInput, type SupOpResult, type SupResult, type SupState,
} from './supplementCore';
import { PROFILE_CHANGED_EVENT } from '../ScopedStorage';
import { wsManager } from '../WebSocketManager';
import { inventoryStore } from '../inventory/inventoryStore';
import { consumir, ajustar, quitarToma } from '../inventory/inventoryCore';
import { forgeStore } from '../forge/forgeStore';
import { daySchedule } from '../daySchedule';
import { erisNotifications, SUP_PREFIX } from '../ErisNotifications';

export const SUPPLEMENT_STATE_KEY = 'eris_supplements_v1';
export const SUPPLEMENTS_CHANGED_EVENT = 'supplements_state_changed';

type Listener = (s: SupState) => void;

const normalizar = (raw: any): SupState => {
  const S = emptySupState();
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.items)) S.items = raw.items.filter((x: any) => x && typeof x.id === 'string' && typeof x.nombre === 'string');
    if (raw.log && typeof raw.log === 'object') S.log = raw.log;
  }
  return S;
};

/** El día de comida (trasnochadores: termina al dormir), como el resto de Nutrición. */
export const supDia = () => diaKey(daySchedule.todayDate());

/** Sexo y edad de Forge (para los límites superiores y el % de vitaminas). */
export const persona = (): Persona => { const f = forgeStore.get(); return { sex: f?.sex ?? null, age: f?.age ?? null }; };

class SupplementStore {
  private state: SupState | null = null;
  private loading: Promise<SupState> | null = null;
  private listeners = new Set<Listener>();
  private saving: Promise<void> = Promise.resolve();
  private ctxTimer: ReturnType<typeof setTimeout> | null = null;
  private avisoTimer: ReturnType<typeof setTimeout> | null = null;
  /** el teléfono no tenía nada guardado: si el servidor tiene tus suplementos, se recuperan */
  private fresh = false;

  constructor() {
    // Otra cuenta: los recordatorios de la anterior (con el nombre de su remedio) se cancelan (revisión D4)
    DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => {
      this.state = null; this.loading = null;
      erisNotifications.scheduleSupplements([]).catch(() => {});
    });
    wsManager.subscribeMessage((d: any) => {
      if (d?.type === 'connected') {
        if (this.state) this.pushContext(true);
        if (this.fresh) wsManager.sendMessage({ type: 'supplement_state_get' });
      }
      if (d?.type === 'supplement_state' && this.fresh && d.state) {
        const S = normalizar(d.state);
        if (S.items.length) { this.fresh = false; void this.replace(S); }
      }
    });
  }

  ctx(now = new Date()): SupCtx {
    return { now, newId: () => `sup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` };
  }

  async load(): Promise<SupState> {
    if (this.state) return this.state;
    if (!this.loading) {
      this.loading = AsyncStorage.getItem(SUPPLEMENT_STATE_KEY).then((raw) => {
        let S: SupState;
        try { S = raw ? normalizar(JSON.parse(raw)) : emptySupState(); } catch { S = emptySupState(); if (raw) void apartarDanado(SUPPLEMENT_STATE_KEY, raw); }
        this.fresh = raw == null;
        this.state = S;
        if (this.fresh && wsManager.getStatus() === 'connected') wsManager.sendMessage({ type: 'supplement_state_get' });
        return S;
      });
    }
    return this.loading;
  }

  get(): SupState | null { return this.state; }
  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { const S = this.state; if (S) for (const f of this.listeners) { try { f(S); } catch {} } DeviceEventEmitter.emit(SUPPLEMENTS_CHANGED_EVENT); }

  async replace(S: SupState): Promise<void> {
    this.state = S;
    this.fresh = false;
    this.emit();
    this.saving = this.saving.then(() => guardar(SUPPLEMENT_STATE_KEY, JSON.stringify(S), 'Suplementos')).catch(() => {});
    await this.saving;
    this.pushContext();
    this.scheduleAvisos();
  }

  private async act(fn: (W: SupState, ctx: SupCtx) => SupResult): Promise<SupResult> {
    const S = await this.load();
    const W: SupState = JSON.parse(JSON.stringify(S));
    const r = fn(W, this.ctx());
    if (r.ok) await this.replace(W);
    return r;
  }

  agregar(inp: SupInput) { return this.act((W, c) => agregarSup(W, inp, c, persona())); }
  editar(id: string, cambios: Partial<SupInput>) { return this.act((W) => editarSup(W, id, cambios, persona())); }
  quitar(id: string) { return this.act((W) => quitarSup(W, id)); }

  /** «Tomado» en un toque: suma la toma y baja el stock del Botiquín si está enlazado. */
  async tomar(id: string): Promise<SupResult> {
    const r = await this.act((W) => tomar(W, id, supDia()));
    if (r.ok) await this.stock(id, -1);
    return r;
  }
  async destomar(id: string): Promise<SupResult> {
    const r = await this.act((W) => destomar(W, id, supDia()));
    if (r.ok) await this.stock(id, +1);
    return r;
  }

  /** El stock del Botiquín: baja con cada toma y vuelve si se deshace (sin tocar si el Inventario no está). */
  private async stock(id: string, signo: -1 | 1) {
    const s = this.state?.items.find((x) => x.id === id);
    if (!s?.invId || !(s.porToma && s.porToma > 0)) return;
    try {
      await inventoryStore.act((W, ctx) => {
        const it = W.items.find((i) => i.id === s.invId);
        if (!it) return { ok: false, msg: '' } as any;
        return signo < 0
          ? consumir(W, it.id, s.porToma!, null, ctx, 'remedio')
          : ajustar(W, it.id, Math.round((it.cantidad + s.porToma!) * 1000) / 1000, null, ctx, 'remedio');
      });
    } catch {}
  }

  /**
   * Enlaza el suplemento a una cosa del Botiquín para llevar su stock. Esa cosa deja de bajar sola por día (`toma` del
   * Inventario): baja con cada «tomado», así no se descuenta dos veces.
   */
  async enlazarStock(id: string, invId: number | null, porToma: number | null): Promise<SupResult> {
    if (invId != null) await inventoryStore.act((W) => quitarToma(W, invId)).catch(() => null);
    return this.editar(id, { invId, porToma });
  }

  /** Una operación del chat (supplement_tracker) con las mismas reglas y el mismo día de comida que la app. */
  async apply(op: unknown): Promise<SupOpResult> {
    const S = await this.load();
    const o = op as any;
    const r = applyOp(S, { action: o?.action, sup: o?.sup }, this.ctx(), supDia());
    if (r.result.ok && o?.action !== 'estado') {
      await this.replace(r.state);
      for (const id of r.result.ids ?? (r.result.id ? [r.result.id] : [])) await this.stock(id, o?.action === 'tomar' ? -1 : 1);
    }
    return r.result;
  }

  extract(now = new Date()) { return this.state ? extract(this.state, now) : null; }

  /**
   * Los avisos de hoy y de mañana para cada toma (los que tienen «Avisarme»). Lo ya tomado hoy no avisa. Se recalcula con
   * cada cambio y al volver a la app, así siempre hay programados los próximos aunque no se abra en todo el día.
   */
  scheduleAvisos() {
    if (this.avisoTimer) clearTimeout(this.avisoTimer);
    this.avisoTimer = setTimeout(() => {
      this.avisoTimer = null;
      const S = this.state;
      if (!S) return;
      const dia = supDia();
      const list: Array<{ id: string; supId: string; at: Date; title: string; body: string }> = [];
      for (const sup of S.items.filter((x) => x.activo && x.aviso)) {
        const hechas = tomasDe(S, dia, sup.id);
        sup.horas.forEach((h, i) => {
          for (const offset of [0, 1]) {
            if (offset === 0 && i < hechas) continue;
            const at = new Date();
            at.setDate(at.getDate() + offset);
            at.setHours(Math.floor(h), h % 1 ? 30 : 0, 0, 0);
            const cual = sup.tomasDia > 1 ? ` (${i + 1} de ${sup.tomasDia})` : '';
            list.push({ id: `${SUP_PREFIX}${sup.id}-${i}-${offset}`, supId: sup.id, at, title: `💊 ${sup.nombre}`, body: `Tu toma de ${fmtDosis(sup.cantidad, sup.unidad)}${cual}. Toca «Tomado ✓» y queda anotada.` });
          }
        });
      }
      erisNotifications.scheduleSupplements(list).catch(() => {});
    }, 800);
  }

  /** A Eris: lo de hoy y la constancia; y el estado completo para recuperarlo en otro teléfono. */
  pushContext(now = false) {
    if (this.ctxTimer) clearTimeout(this.ctxTimer);
    const send = () => {
      this.ctxTimer = null;
      const S = this.state;
      if (!S || wsManager.getStatus() !== 'connected') return;
      const ex = extract(S, new Date());
      wsManager.sendMessage({ type: 'update_supplement_context', context: ex.context, summary: ex.summary, state: S });
    };
    if (now) send(); else this.ctxTimer = setTimeout(send, 2000);
  }
}

export const supplementStore = new SupplementStore();

let started = false;
/** Al abrir la app (con sesión): Eris sabe tus suplementos desde el primer mensaje. */
export function startSupplements() {
  if (started) return;
  started = true;
  supplementStore.load().then(() => { supplementStore.pushContext(true); supplementStore.scheduleAvisos(); }).catch(() => {});
  // Al volver a la app: la ventana de avisos (hoy y mañana) avanza
  AppState.addEventListener('change', (st) => { if (st === 'active' && supplementStore.get()) supplementStore.scheduleAvisos(); });
}

export type { MiSup, SupState };
