// Finanzas 2.0 (F4) — lo que llega solo y espera tu visto bueno («por confirmar») y la configuración de los avisos del banco.
// Eris administra (A0, 2026-10-30): con «Que Eris anote sola», lo claro se anota solo («Anotó Eris») y acá queda lo dudoso.
// A1: también transferencias (entre tus cuentas o a otros), sueldo, «Me debe», giros y pagos de la tarjeta.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, AppState, Alert, DeviceEventEmitter, Share } from 'react-native';
import { FX, clp, fechaCorta, catOf } from './fx';
import { Panel, Label, Btn, Chip } from './parts';
import { financeInbox, INBOX_CHANGED_EVENT } from '../../services/finance/financeInbox';
import { financeAuto, FINANCE_AUTO_EVENT, type AutoEntry } from '../../services/finance/financeAuto';
import { AUTO_DEFAULT, type AutoConfig } from '../../services/finance/bankAuto';
import { FINANCE_CHANGED_EVENT } from '../../services/finance/financeStore';
import { useFeature } from '../../config/features';
import { posibleDuplicado, anonimizarAviso, type Propuesta } from '../../services/finance/bankNotif';
import { AuthStorage } from '../../services/AuthStorage';
import { BankNotifications, type SeenApp } from '../../../modules/eris-bank-notifications';
import type { FinanceState } from '../../services/finance/financeCore';
import type { SheetState } from './types';

/** Las propuestas, recogiendo los avisos nuevos al abrir, al volver a la app y cuando llega uno con la app abierta (financeAuto decide). */
export function useInbox(): Propuesta[] {
  const [items, setItems] = useState<Propuesta[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => financeInbox.list().then((x) => { if (alive) setItems(x); }).catch(() => {});
    const pull = () => { financeAuto.process().then(() => financeAuto.releer()).then(() => financeAuto.ordenarBandeja()).catch(() => null).finally(refresh); };
    pull();
    const a = DeviceEventEmitter.addListener(INBOX_CHANGED_EVENT, refresh);
    const b = BankNotifications.onNotice(pull);
    const c = AppState.addEventListener('change', (st) => { if (st === 'active') pull(); });
    return () => { alive = false; a.remove(); b.remove(); c.remove(); };
  }, []);
  return items;
}

/** Hoy → «POR CONFIRMAR»: cada aviso del banco (o gasto que falta según la cartola) con Anotar / Descartar. */
export function InboxPanel({ S, items, open, auto }: { S: FinanceState; items: Propuesta[]; open: (s: SheetState) => void; auto?: boolean }) {
  // Antes se veían solo los 8 más nuevos y el resto no tenía cómo abrirse; y lo que no cabía se perdía callado (revisión F5)
  const [todos, setTodos] = useState(false);
  const [fuera, setFuera] = useState(0);
  useEffect(() => {
    let alive = true;
    const leer = () => { financeInbox.fuera().then((n) => { if (alive) setFuera(n); }).catch(() => {}); };
    leer();
    const a = DeviceEventEmitter.addListener(INBOX_CHANGED_EVENT, leer);
    return () => { alive = false; a.remove(); };
  }, []);
  if (!items.length && !fuera) return null;
  const anotar = async (p: Propuesta) => {
    if (p.tipo !== 'compra' && p.fuente !== 'cartola') { open({ k: 'aviso', p }); return; }
    const cuenta = p.cuenta !== undefined ? p.cuenta : await financeInbox.cuentaPara(p);
    open({ k: 'gasto', preset: { monto: p.monto, desc: p.desc, cat: p.cat, fecha: p.fecha, ...(cuenta !== undefined ? { cuenta } : {}),
      notif: { clave: p.clave, pkg: p.pkg, app: p.app, fuente: p.fuente, ...(p.last4 ? { last4: p.last4 } : {}), texto: p.texto } } });
  };
  return (
    <Panel glow={FX.cyan}>
      <Label>🔔 POR CONFIRMAR · {items.length}</Label>
      {fuera > 0 && (
        <View style={s.row}>
          <Text style={[s.razon, { flex: 1 }]}>{fuera === 1 ? 'Un aviso antiguo ya no cupo' : `${fuera} avisos antiguos ya no cupieron`} en esta lista. Si falta algo en tus movimientos, la cartola de tu banco lo encuentra (＋ → Importar cartola).</Text>
          <Btn small ghost label="Entendido" color={FX.muted} onPress={() => { void financeInbox.olvidarFuera(); }} />
        </View>
      )}
      {(todos ? items : items.slice(-8)).slice().reverse().map((p) => {
        const dup = posibleDuplicado(S.tx, p);
        return (
          <View key={p.clave} style={s.row}>
            <View style={{ flex: 1 }}>
              <View style={s.line}><Text style={[s.desc, s.shrink]} numberOfLines={1}>{p.desc}</Text><Text style={[s.desc, s.amt, p.tipo === 'ingreso' && s.amtIn]}>{p.tipo === 'ingreso' ? '+' : ''}{clp(p.monto)}</Text></View>
              <Text style={s.meta} numberOfLines={1}>{[p.fuente === 'cartola' ? `cartola ${p.app}` : p.app, p.last4 ? `****${p.last4}` : null, `${fechaCorta(p.fecha)}${p.hora ? ` ${p.hora}` : ''}`].filter(Boolean).join(' · ')}</Text>
              {dup ? <Text style={s.dup}>¿Ya está? {dup.desc} por el mismo monto el {fechaCorta(dup.fecha)}.</Text>
                : p.razon ? <Text style={s.razon}>{p.razon}</Text> : null}
            </View>
            <View style={s.btns}>
              <Btn small label="Anotar" color={FX.violetDeep} onPress={() => anotar(p)} />
              <Btn small ghost label="✕" color={FX.muted} onPress={() => financeInbox.descartar(p.clave)} />
            </View>
          </View>
        );
      })}
      {items.length > 8 && <Btn small ghost label={todos ? 'Ver solo los más nuevos' : `Ver los ${items.length} (hay ${items.length - 8} más)`} color={FX.cyan} onPress={() => setTodos(!todos)} style={{ marginTop: 8, alignSelf: 'flex-start' }} />}
      <Text style={s.hint}>{auto ? 'Lo que no pude anotar sola (de tu banco o la cartola). Lo que me respondas queda en tu libro y lo aprendo para la próxima.' : 'Vienen de los avisos de tu banco o de la cartola. Nada se anota sin que lo confirmes.'}</Text>
    </Panel>
  );
}

/** La configuración de «Eris anota sola» y lo que anotó en las últimas horas (se actualiza solo). */
export function useFinanceAuto(S: FinanceState | null) {
  const [cfg, setCfg] = useState<AutoConfig>(AUTO_DEFAULT);
  const [hechos, setHechos] = useState<AutoEntry[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      financeAuto.getConfig().then((c) => { if (alive) setCfg(c); }).catch(() => {});
      financeAuto.recientes(S).then((x) => { if (alive) setHechos(x); }).catch(() => {});
    };
    refresh();
    const a = DeviceEventEmitter.addListener(FINANCE_AUTO_EVENT, refresh);
    const b = DeviceEventEmitter.addListener(FINANCE_CHANGED_EVENT, refresh);
    return () => { alive = false; a.remove(); b.remove(); };
  }, [S]);
  return { cfg, hechos, activo: cfg.on === true && cfg.allowed === true };
}

/** Hoy → «ANOTÓ ERIS»: lo que Eris anotó sola de los avisos del banco, para revisarlo, cambiarlo o deshacerlo. */
export function AutoPanel({ hechos, open }: { hechos: AutoEntry[]; open: (s: SheetState) => void }) {
  if (!hechos.length) return null;
  const deshacer = (e: AutoEntry) => Alert.alert('Deshacer', `Saco ${e.desc} (${clp(e.monto)}) de tus movimientos y lo dejo en «Por confirmar» por si era otra cosa.`, [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Deshacer', style: 'destructive', onPress: () => { financeAuto.deshacer(e.clave).catch(() => {}); } },
  ]);
  return (
    <Panel glow={FX.gold}>
      <Label color={FX.gold}>🤖 ANOTÓ ERIS · {hechos.length}</Label>
      {hechos.slice(0, 6).map((e) => (
        <View key={e.clave} style={s.row}>
          <View style={{ flex: 1 }}>
            <View style={s.line}><Text style={[s.desc, s.shrink]} numberOfLines={1}>{e.desc}</Text><Text style={[s.desc, s.amt, ENTRAN.has(String(e.como)) && s.amtIn, MUEVE.has(String(e.como)) && s.amtMov]}>{ENTRAN.has(String(e.como)) ? '+' : ''}{clp(e.monto)}</Text></View>
            <Text style={s.meta} numberOfLines={1}>{[e.hora + (e.fecha !== hoyStr() ? ` · ${fechaCorta(e.fecha)}` : ''), e.etiqueta || catOf(e.cat).label, `${e.cuentaNombre}${e.last4 ? ` ****${e.last4}` : ''}`].join(' · ')}</Text>
            {e.como === 'abono' && <Btn small ghost label="⚡ Fue un ingreso" color={FX.up} onPress={() => { financeAuto.fueIngreso(e.clave).catch(() => {}); }} style={{ alignSelf: 'flex-start', marginTop: 4 }} />}
          </View>
          <View style={s.btns}>
            <Btn small ghost label="Cambiar" color={FX.violet} onPress={() => open({ k: 'tx', id: e.txId })} />
            <Btn small ghost label="↶" color={FX.muted} onPress={() => deshacer(e)} />
          </View>
        </View>
      ))}
      {hechos.length > 6 && <Text style={s.meta}>…y {hechos.length - 6} más en Movimientos.</Text>}
      <Text style={s.hint}>De los avisos de tu banco: compras, transferencias, tu sueldo, lo que te devolvieron. Si algo no era así, cámbialo o deshazlo (↶).</Text>
    </Panel>
  );
}

/** Plata que entra (+, en verde) y movimientos entre tus cuentas (sin signo) */
const ENTRAN = new Set(['abono', 'ingreso', 'sueldo', 'cobro']);
const MUEVE = new Set(['propia', 'unir', 'giro', 'pago']);

const hoyStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const pedirAcceso = () => Alert.alert('Leer los avisos del banco',
  'Android te va a mostrar «Acceso a notificaciones»: activa Eris. Solo guardo los avisos con montos de las apps que elijas, y nada sale de tu teléfono.\n\nSi aparece «Configuración restringida»: Ajustes → Apps → Eris → ⋮ → Permitir configuración restringida, y vuelve a intentarlo.',
  [{ text: 'Cancelar', style: 'cancel' }, { text: 'Abrir Ajustes', onPress: () => BankNotifications.openAccessSettings() }]);

/** La primera vez (con visto bueno y avisos del banco disponibles): ¿que Eris anote sola? */
export function AutoOffer({ cfg }: { cfg: AutoConfig }) {
  const allowed = useFeature('finanzasAuto');
  if (!allowed || !BankNotifications.available || cfg.on !== null) return null;
  const si = () => {
    financeAuto.setConfig({ on: true, allowed: true }).catch(() => {});
    if (!BankNotifications.hasAccess()) pedirAcceso();
  };
  return (
    <Panel glow={FX.gold}>
      <Label color={FX.gold}>🤖 ¿QUE ERIS ANOTE SOLA?</Label>
      <Text style={s.body}>Cuando tu banco te avise una compra o una transferencia, la anoto con su cuenta y su categoría; reconozco lo que mueves entre tus cuentas, tu sueldo y lo que te devuelven. Te aviso en silencio por si quieres deshacerlo. Lo dudoso (una cuenta que no conozco, un monto grande la primera vez) queda en «Por confirmar».</Text>
      <View style={[s.chips, { marginTop: 12 }]}>
        <Btn small label="Sí, que anote sola" color={FX.violetDeep} onPress={si} />
        <Btn small ghost label="Prefiero confirmar" color={FX.muted} onPress={() => { financeAuto.setConfig({ on: false }).catch(() => {}); }} />
      </View>
    </Panel>
  );
}

const TOPES = [50_000, 100_000, 200_000, 0];

/**
 * «Compartir ejemplos de avisos»: los textos que ya leyó Eris (lo anotado y «Por confirmar»), sin nombres ni números, para
 * afinar los lectores de cada banco. Se abre el menú de compartir de Android: la persona elige a dónde (o nada).
 */
async function compartirEjemplos() {
  const yo = ((await AuthStorage.getDisplayName().catch(() => null)) ?? '').split(/\s+/).filter((x) => x.length >= 3);
  const ps: Propuesta[] = [...(await financeAuto.log()).map((e) => e.p), ...(await financeInbox.list()), ...(await financeInbox.descartados())];
  const vistos = new Set<string>();
  const lineas: string[] = [];
  for (const p of ps.reverse()) {
    if (!p || p.fuente !== 'banco' || !p.texto) continue;
    const t = anonimizarAviso(p.texto, [...yo, ...(p.contraparte ? [p.contraparte] : [])]);
    const k = `${p.app}|${t}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    lineas.push(`• [${p.app.replace(/\d/g, '9')}] ${t}`);
    if (lineas.length >= 15) break;
  }
  if (!lineas.length) { Alert.alert('Ejemplos de avisos', 'Todavía no he leído avisos de tu banco.'); return; }
  await Share.share({ message: `Avisos de mi banco que leyó Eris (sin nombres ni números):\n\n${lineas.join('\n')}` }).catch(() => {});
}

/** ⚙ Ajustes → «AVISOS DEL BANCO»: dar acceso (lo da la persona en Ajustes) y elegir de qué apps leer. */
export function BankSetupPanel() {
  const [acceso, setAcceso] = useState(BankNotifications.hasAccess());
  const [allowed, setAllowed] = useState<string[]>(BankNotifications.getAllowed());
  const [seen, setSeen] = useState<SeenApp[]>(BankNotifications.seenApps());
  const [mail, setMail] = useState(BankNotifications.getMail());
  const refresh = useCallback(() => { setAcceso(BankNotifications.hasAccess()); setAllowed(BankNotifications.getAllowed()); setSeen(BankNotifications.seenApps()); }, []);
  useEffect(() => {
    const c = AppState.addEventListener('change', (st) => { if (st === 'active') { BankNotifications.rebind(); refresh(); } });
    return () => c.remove();
  }, [refresh]);
  // Los hooks antes de cualquier return (revisión L1: estos dos iban después del «no disponible», contra las reglas de React)
  const allowedAuto = useFeature('finanzasAuto');
  const { cfg } = useFinanceAuto(null);
  if (!BankNotifications.available) return null;
  const toggle = (pkg: string) => {
    const next = allowed.includes(pkg) ? allowed.filter((x) => x !== pkg) : [...allowed, pkg];
    BankNotifications.setAllowed(next);
    setAllowed(next);
  };
  const pedir = pedirAcceso;
  const setAuto = (patch: Partial<AutoConfig>) => { financeAuto.setConfig({ ...patch, allowed: true }).catch(() => {}); };
  // Las elegidas aunque ya no aparezcan en «vistas» (se elige una vez)
  const apps: SeenApp[] = [...seen, ...allowed.filter((p) => !seen.some((x) => x.pkg === p)).map((pkg) => ({ pkg, app: pkg, count: 0, last: 0 }))];
  return (
    <Panel>
      <Label>🔔 AVISOS DEL BANCO</Label>
      {!acceso ? (
        <>
          <Text style={s.body}>Cuando tu banco te avisa una compra («Compra por $12.990 en LIDER»), te la dejo lista para confirmar. Sin claves del banco y sin que nada salga del teléfono.</Text>
          <Btn small label="Activar" color={FX.violetDeep} onPress={pedir} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
        </>
      ) : (
        <>
          <Text style={s.body}>{apps.length ? 'Elige las apps de tu banco. Solo de esas guardo los avisos con montos:' : 'Listo. Cuando tu banco te mande un aviso con un monto, la app aparece acá para que la elijas.'}</Text>
          <View style={s.chips}>
            {apps.map((a) => <Chip key={a.pkg} small label={`${allowed.includes(a.pkg) ? '✓ ' : ''}${a.app}`} on={allowed.includes(a.pkg)} color={FX.cyan} onPress={() => toggle(a.pkg)} />)}
          </View>
          <View style={s.chips}>
            <Chip small label={mail ? '✓ También correos y SMS del banco' : 'También correos y SMS del banco'} on={mail} color={FX.cyan}
              onPress={() => { BankNotifications.setMail(!mail); setMail(!mail); }} />
          </View>
          <Text style={s.hint}>{mail ? 'De Gmail, Outlook y Mensajes leo solo lo que manda un banco (por el remitente), y nunca la publicidad.' : 'Si tu banco te avisa por correo o SMS en vez de la app. Apagado: no leo tu correo.'}</Text>
          {allowedAuto && <Btn small ghost label="📋 Compartir ejemplos de avisos (sin nombres ni números)" color={FX.cyan} onPress={() => { void compartirEjemplos(); }} style={{ marginTop: 10, alignSelf: 'flex-start' }} />}
          <Btn small ghost label="Quitar el acceso" color={FX.muted} onPress={() => BankNotifications.openAccessSettings()} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
        </>
      )}
      {allowedAuto && (
        <View style={s.autoBox}>
          <Label color={FX.gold}>🤖 ERIS ANOTA SOLA</Label>
          <Text style={s.body}>{cfg.on ? 'Compras, transferencias, tu sueldo y lo que te devuelven se anotan solos cuando la cuenta está clara, y te aviso en silencio (con «Deshacer»). Lo dudoso queda en «Por confirmar».' : 'Cada aviso queda en «Por confirmar» hasta que lo anotes tú.'}</Text>
          <View style={s.chips}>
            <Chip small label={cfg.on ? '✓ Que anote sola' : 'Que anote sola'} on={cfg.on === true} color={FX.gold} onPress={() => setAuto({ on: true })} />
            <Chip small label={cfg.on === false ? '✓ Solo proponer' : 'Solo proponer'} on={cfg.on === false} color={FX.muted} onPress={() => setAuto({ on: false })} />
          </View>
          {cfg.on === true && (
            <>
              <Text style={[s.body, { marginTop: 10 }]}>Un comercio o una persona nueva por más de… lo confirmas tú:</Text>
              <View style={s.chips}>
                {TOPES.map((t) => <Chip key={t} small label={t ? clp(t) : 'Sin tope'} on={cfg.tope === t} color={FX.gold} onPress={() => setAuto({ tope: t })} />)}
              </View>
            </>
          )}
        </View>
      )}
    </Panel>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: FX.lineSoft },
  desc: { color: FX.text, fontSize: 14, fontWeight: '600' },
  amt: { fontFamily: FX.mono, color: FX.down },
  amtIn: { color: FX.up },
  amtMov: { color: FX.text },
  meta: { color: FX.muted, fontSize: 12, marginTop: 2 },
  dup: { color: FX.gold, fontSize: 12, marginTop: 2 },
  razon: { color: FX.violet, fontSize: 12, marginTop: 2 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  shrink: { flexShrink: 1 },
  autoBox: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: FX.lineSoft },
  btns: { flexDirection: 'row', gap: 6 },
  hint: { color: FX.dim, fontSize: 11, marginTop: 8 },
  body: { color: FX.muted, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
});
