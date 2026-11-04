// Inventario — los formularios (hojas). Todo pasa por las reglas del núcleo (inventoryCore): las mismas que usa el chat.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { IX, AREA_COLOR, clp, fechaCorta, diaLocal, venceTxt, venceColor } from './ix';
import { Sheet, Field, Chip, Btn, Label, AreaPicker, UnitPicker, unidadesPara } from './parts';
import {
  AREA, AREAS, agregar, consumir, ajustar, botar, editar, mover, quitar, confirmar, anotarCompra, quitarCompra, ocultarArea,
  areaPara, claveNombre, cantidadDe, historial, parseContenido, familia, diasHasta, fmtCant,
  configurarToma, quitarToma, tomasDeHorario, diasQueAlcanza, ajustarDescuentoComida,
  type AreaId, type Unidad, type InventoryState, type TipoMov,
} from '../../services/inventory/inventoryCore';
import { usePerfilMedico, historiaMedica, EVENTO, type TipoEvento } from './useMedical';
import { itemDeRemedio } from './tabs/Botiquin';
import { FechaCampo } from '../finance/Calendario';
import BarcodeScanner from '../../components/gluco/BarcodeScanner';
import { foodSearchService } from '../../services/FoodSearchService';
import { inventoryStore } from '../../services/inventory/inventoryStore';
import { listInventoryBackups, fechaHora, type InventoryBackupCopy } from '../../services/inventoryBackup';
import type { SheetState, View as InvView, Act, Seccion } from './types';

/** Atajos para un vencimiento */
const VENCE_ATAJOS: Array<[string, number]> = [['En 3 días', 3], ['En 1 semana', 7], ['En 1 mes', 30]];
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const TIPO: Record<TipoMov, string> = { nuevo: 'Agregado', compra: 'Compra', consumo: 'Usado', ajuste: 'Conteo', botado: 'Botado', movido: 'Movido' };
const VIA: Record<string, string> = { eris: 'por chat', revision: 'en la revisión', boleta: 'de la boleta', nutricion: 'por Nutrición', remedio: 'por tu horario de remedios' };

export default function InventorySheets({ sheet, onClose, open, S, V, act, irA, onTour, toast }: {
  sheet: SheetState | null; onClose: () => void; open: (s: SheetState) => void; S: InventoryState; V: InvView; act: Act;
  irA: (s: Seccion, area?: AreaId | null) => void; onTour: () => void; toast: (msg: string, ok?: boolean) => void;
}) {
  const now = V.now;
  const [f, setF] = useState<any>({});
  const set = (patch: any) => setF((x: any) => ({ ...x, ...patch }));
  const [scan, setScan] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const medico = usePerfilMedico();
  const remedios = (medico?.medications ?? []).filter((m) => m.active);

  useEffect(() => {
    if (!sheet) return;
    switch (sheet.k) {
      case 'agregar': {
        const p = sheet.preset ?? {};
        const scanNow = p.barcode === '__scan__';
        setF({ nombre: p.nombre ?? '', area: p.area ?? (p.nombre ? areaPara(p.nombre) : null), areaManual: !!p.area, cantidad: p.cantidad != null ? String(p.cantidad).replace('.', ',') : '',
          unidad: p.unidad ?? 'u', contenido: p.contenido ?? '', vence: p.vence ?? '', minimo: p.minimo != null ? String(p.minimo) : '', ubicacion: '', precio: p.precio ? String(p.precio) : '',
          marca: p.marca ?? '', barcode: scanNow ? '' : p.barcode ?? '', mas: false, compraId: p.compraId });
        if (scanNow) setScan(true);
        break;
      }
      case 'usar': case 'contar': case 'botar': {
        const it = S.items.find((i) => i.id === sheet.id);
        setF({ cantidad: sheet.k === 'contar' && it ? String(Math.round(it.cantidad * 100) / 100).replace('.', ',') : '', unidad: it?.unidad ?? 'u', motivo: 'vencido', todo: sheet.k === 'botar' });
        break;
      }
      case 'editar': {
        const it = S.items.find((i) => i.id === sheet.id);
        if (it) setF({ nombre: it.nombre, area: it.area, ubicacion: it.ubicacion ?? '', minimo: it.minimo != null ? String(it.minimo).replace('.', ',') : '', vence: it.vence ?? '',
          contenido: it.contenido ? fmtCant(it.contenido.cant, it.contenido.unidad) : '', marca: it.marca ?? '' });
        break;
      }
      case 'lista_add': setF({ nombre: '', cantidad: '', unidad: 'u' }); break;
      case 'remedio': {
        const m = sheet.medId ? remedios.find((x) => x.id === sheet.medId) : undefined;
        const it = sheet.itemId != null ? S.items.find((i) => i.id === sheet.itemId) : m ? itemDeRemedio(S.items, m) : undefined;
        setF({ cantidad: '', porToma: String(it?.toma?.porToma ?? 1).replace('.', ','), tomasDia: String(it?.toma?.tomasDia ?? tomasDeHorario(m?.schedule) ?? 1), vence: '' });
        break;
      }
      case 'historia': {
        const d = new Date();
        setF({ fecha: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, tipo: 'consulta', titulo: '', nota: '' });
        break;
      }
      default: setF({});
    }
  }, [sheet]);

  if (!sheet) return null;
  const save = async (fn: Parameters<Act>[0]) => { if (await act(fn)) onClose(); };

  switch (sheet.k) {
    case 'menu': return (
      <Sheet title="¿QUÉ QUIERES HACER?" onClose={onClose}>
        <Label>AGREGAR A TU CASA</Label>
        <Opcion icon="✍️" titulo="Agregar a mano" sub="Lo que compraste o lo que ya tienes" onPress={() => open({ k: 'agregar' })} />
        <Opcion icon="▦" titulo="Escanear el código de barras" sub="Te completo el nombre del producto" onPress={() => open({ k: 'agregar', preset: { barcode: '__scan__' } })} />
        <Label>LISTA Y REVISIÓN</Label>
        <Opcion icon="🛒" titulo="Anotar algo para comprar" sub="Va a tu lista de compras" onPress={() => open({ k: 'lista_add' })} />
        <Opcion icon="✓" titulo="Revisión rápida" sub={V.revision.length ? `${V.revision.length} cosa${V.revision.length === 1 ? '' : 's'} sin contar hace una semana` : 'Todo contado esta semana'} onPress={() => open({ k: 'revision' })} />
        <Text style={s.hint}>También se lo puedes decir a Eris: «compré 2 L de leche», «se me acabó el shampoo», «¿tengo arroz?».</Text>
      </Sheet>
    );

    case 'agregar': {
      const nombre = String(f.nombre ?? '').trim();
      // Lo mismo que hace agregar(): mismo nombre (sin plurales ni tildes) = se suma; no un parecido
      const exacto = nombre.length >= 2 ? S.items.find((i) => claveNombre(i.nombre) === claveNombre(nombre)) : undefined;
      const unidades = exacto ? unidadesPara(exacto) : undefined;
      const areaDef = f.area ? AREA[f.area as AreaId] : null;
      const onBarcode = async (code: string) => {
        setScan(false);
        const mismo = S.items.find((i) => i.barcode === code);
        if (mismo) { set({ nombre: mismo.nombre, area: mismo.area, areaManual: true, unidad: mismo.unidad, barcode: code }); return; }
        setBuscando(true);
        const r = await foodSearchService.lookupBarcode(code).catch(() => null);
        setBuscando(false);
        const n = r?.food?.name ?? r?.nameOnly?.name;
        const marca = r?.food?.brand ?? r?.nameOnly?.brand ?? '';
        if (!n) { set({ barcode: code }); toast('No encontré ese código: escribe el nombre y lo recuerdo para la próxima', false); return; }
        set({ nombre: n, marca, barcode: code, ...(f.areaManual ? {} : { area: areaPara(n) ?? (r?.food ? 'despensa' : f.area) }) });
      };
      return (
        <Sheet title="AGREGAR" onClose={onClose} saveLabel={exacto ? `Sumar a ${exacto.nombre}` : 'Agregar'}
          onSave={() => save((W, ctx) => {
            const contenido = f.contenido ? parseContenido(f.contenido) : null;
            if (f.contenido && !contenido) return { ok: false, msg: 'Lo que trae cada uno: escríbelo con su unidad, por ejemplo «1 L» o «400 g»' };
            const r = agregar(W, {
              nombre, area: exacto ? exacto.area : f.area, cantidad: f.cantidad === '' ? 1 : num(f.cantidad), unidad: f.unidad, contenido, vence: f.vence || null,
              minimo: f.minimo === '' ? null : num(f.minimo), ubicacion: f.ubicacion || null, precioTotal: f.precio ? num(f.precio) : null,
              marca: f.marca || null, barcode: f.barcode || null,
            }, ctx);
            if (r.ok && f.compraId) quitarCompra(W, f.compraId);
            return r;
          })}>
          <BarcodeScanner visible={scan} onClose={() => setScan(false)} onBarcode={onBarcode} />
          {buscando && <View style={s.row}><ActivityIndicator color={IX.teal} /><Text style={s.note}>Buscando el producto…</Text></View>}
          <Field label="QUÉ ES" value={f.nombre ?? ''} onChange={(v) => set({ nombre: v, ...(f.areaManual ? {} : { area: areaPara(v) ?? f.area }) })} placeholder="Leche, shampoo, arroz, ibuprofeno…" autoFocus={!sheet.preset?.nombre && sheet.preset?.barcode !== '__scan__'} />
          {!scan && !buscando && !f.barcode && <Btn small ghost label="▦ Escanear el código" color={IX.teal} onPress={() => setScan(true)} style={{ alignSelf: 'flex-start' }} />}
          {exacto && <Text style={[s.note, { color: IX.teal }]}>Ya tienes {exacto.nombre}: {cantidadDe(exacto)} en {AREA[exacto.area].nombre}. Lo que agregues se suma.</Text>}
          {!exacto && <AreaPicker value={f.area} onChange={(a) => set({ area: a, areaManual: true })} ocultas={S.ocultas} />}
          <View style={s.qtyRow}>
            <View style={{ flex: 1 }}><Field label="CUÁNTO" value={f.cantidad ?? ''} onChange={(v) => set({ cantidad: v })} decimal big placeholder="1" /></View>
          </View>
          <UnitPicker value={f.unidad} onChange={(u) => set({ unidad: u })} solo={unidades} />
          {familia(f.unidad as Unidad) === 'cuenta' && !exacto?.contenido && (
            <Field label="CADA UNO TRAE (OPCIONAL)" info="contenido" value={f.contenido ?? ''} onChange={(v) => set({ contenido: v })} placeholder="1 L, 400 g…" />
          )}
          {(!areaDef || areaDef.vence) && <FechaCampo label="VENCE (OPCIONAL)" modo="futuro" opcional value={f.vence ?? ''} onChange={(v) => set({ vence: v })} now={now} accent={IX.teal} atajosDias={VENCE_ATAJOS} />}
          <TouchableOpacity onPress={() => set({ mas: !f.mas })} style={s.mas} accessibilityRole="button"><Text style={s.masText}>{f.mas ? '− Menos detalles' : '+ Más detalles (precio, mínimo, dónde está)'}</Text></TouchableOpacity>
          {f.mas && (
            <>
              <Field label="LO QUE PAGASTE EN TOTAL (OPCIONAL)" value={f.precio ?? ''} onChange={(v) => set({ precio: v })} numeric placeholder="Para estimar tu lista de compras" />
              <Field label="AVÍSAME CUANDO QUEDE (MÍNIMO)" info="minimo" value={f.minimo ?? ''} onChange={(v) => set({ minimo: v })} decimal placeholder={`En ${f.unidad === 'u' ? 'unidades' : f.unidad}`} />
              <Field label="DÓNDE ESTÁ (OPCIONAL)" value={f.ubicacion ?? ''} onChange={(v) => set({ ubicacion: v })} placeholder="Refri, repisa del baño, bodega…" />
              <Field label="MARCA (OPCIONAL)" value={f.marca ?? ''} onChange={(v) => set({ marca: v })} />
            </>
          )}
        </Sheet>
      );
    }

    case 'item': {
      const it = S.items.find((i) => i.id === sheet.id);
      if (!it) return null;
      const a = AREA[it.area];
      const dias = it.vence ? diasHasta(it.vence, now) : null;
      const movs = historial(S, it.id).slice(0, 10);
      return (
        <Sheet title={`${a.icono} ${a.corto.toUpperCase()}`} onClose={onClose}>
          <Text style={s.itName}>{it.nombre}{it.marca ? <Text style={s.itMarca}>  {it.marca}</Text> : null}</Text>
          <Text style={[s.itQty, it.cantidad <= 0 && { color: IX.red }]}>{it.cantidad > 0 ? cantidadDe(it) : 'Se acabó'}</Text>
          <View style={s.facts}>
            {dias != null && <Text style={[s.fact, { color: venceColor(dias) }]}>⏳ {venceTxt(dias)} ({fechaCorta(it.vence!)})</Text>}
            {!!it.ubicacion && <Text style={s.fact}>📍 {it.ubicacion}</Text>}
            {it.minimo != null && it.minimo > 0 && <Text style={s.fact}>🔔 aviso bajo {fmtCant(it.minimo, it.unidad)}</Text>}
            {!!it.precio && <Text style={s.fact}>💲 {clp(it.precio)} c/{it.unidad === 'u' ? 'unidad' : it.unidad}</Text>}
            {it.toma && <Text style={s.fact}>🗓 {fmtCant(it.toma.porToma, it.unidad)} × {it.toma.tomasDia} al día · te alcanza ~{diasQueAlcanza(it)} días</Text>}
          </View>
          <View style={s.grid}>
            {a.consumible && it.cantidad > 0 && <Btn small label="Usé…" onPress={() => open({ k: 'usar', id: it.id })} style={s.gridBtn} />}
            <Btn small ghost label="Contar" color={IX.teal} onPress={() => open({ k: 'contar', id: it.id })} style={s.gridBtn} a11y="Contar cuánto hay de verdad" />
            <Btn small ghost label="+ Compré" color={IX.green} onPress={() => open({ k: 'agregar', preset: { nombre: it.nombre, area: it.area, unidad: it.unidad } })} style={s.gridBtn} />
            {it.cantidad > 0 && <Btn small ghost label="Boté" color={IX.red} onPress={() => open({ k: 'botar', id: it.id })} style={s.gridBtn} a11y="Lo boté: vencido o malo" />}
          </View>
          {a.consumible && (
            <Btn small ghost label={it.toma ? '🗓 Cambiar las tomas' : '🗓 Lo uso todos los días'} color={IX.teal} onPress={() => open({ k: 'remedio', itemId: it.id, ...(it.medId ? { medId: it.medId } : {}) })}
              a11y="Lo uso todos los días: que baje solo con sus tomas" />
          )}
          <View style={s.row}>
            <Btn small ghost label="Editar" color={IX.muted} onPress={() => open({ k: 'editar', id: it.id })} style={{ flex: 1 }} />
            <Btn small ghost label="Quitar" color={IX.red} style={{ flex: 1 }}
              onPress={() => Alert.alert(`Quitar ${it.nombre}`, 'Deja de seguirse (no vuelve a la lista de compras). Si fue un error, «Borrar» lo elimina con su historial.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Borrar', style: 'destructive', onPress: () => { void save((W) => quitar(W, it.id, true)); } },
                { text: 'Dejar de seguir', onPress: () => { void save((W, ctx) => quitar(W, it.id, false, ctx)); } },
              ])} />
          </View>
          {movs.length > 0 && (
            <View>
              <Label>HISTORIAL</Label>
              {movs.map((m) => (
                <View key={m.id} style={s.mov}>
                  <Text style={s.movDate}>{fechaCorta(diaLocal(m.at))}</Text>
                  <Text style={s.movTipo} numberOfLines={1}>{TIPO[m.tipo]}{m.via && VIA[m.via] ? ` ${VIA[m.via]}` : ''}{m.nota ? ` · ${m.nota}` : ''}{m.tipo === 'movido' && m.hacia ? ` → ${AREA[m.hacia].corto}` : ''}</Text>
                  {m.delta !== 0 && <Text style={[s.movDelta, { color: m.delta > 0 ? IX.green : IX.muted }]}>{m.delta > 0 ? '+' : '−'}{fmtCant(Math.abs(m.delta), it.unidad)}</Text>}
                </View>
              ))}
            </View>
          )}
        </Sheet>
      );
    }

    case 'usar': case 'contar': case 'botar': {
      const it = S.items.find((i) => i.id === sheet.id);
      if (!it) return null;
      const us = unidadesPara(it), cuenta = familia(it.unidad) === 'cuenta';
      if (sheet.k === 'usar') return (
        <Sheet title={`USÉ · ${it.nombre.toUpperCase()}`} onClose={onClose} saveLabel="Descontar"
          onSave={() => save((W, ctx) => consumir(W, it.id, f.cantidad === '' ? null : num(f.cantidad), f.unidad, ctx))}>
          <Text style={s.note}>Tienes {cantidadDe(it)}.</Text>
          {cuenta && <View style={s.chips}>{[0.5, 1, 2].filter((n) => n <= it.cantidad).map((n) => <Chip key={n} small label={fmtCant(n, it.unidad)} on={num(f.cantidad) === n && f.unidad === it.unidad} onPress={() => set({ cantidad: String(n).replace('.', ','), unidad: it.unidad })} />)}</View>}
          <Field label="CUÁNTO USASTE" value={f.cantidad ?? ''} onChange={(v) => set({ cantidad: v })} decimal big autoFocus={!cuenta} placeholder={cuenta ? '1' : '0'} />
          {us.length > 1 && <UnitPicker value={f.unidad} onChange={(u) => set({ unidad: u })} solo={us} />}
        </Sheet>
      );
      if (sheet.k === 'contar') return (
        <Sheet title={`CONTAR · ${it.nombre.toUpperCase()}`} onClose={onClose} saveLabel="Guardar el conteo"
          onSave={() => save((W, ctx) => ajustar(W, it.id, f.cantidad === '' ? NaN : num(f.cantidad), f.unidad, ctx))}>
          <Text style={s.note}>¿Cuánto hay de verdad? Lo que cambie queda anotado como conteo (así el inventario sigue fiel).</Text>
          <Field label="LO QUE HAY" value={f.cantidad ?? ''} onChange={(v) => set({ cantidad: v })} decimal big autoFocus />
          {us.length > 1 && <UnitPicker value={f.unidad} onChange={(u) => set({ unidad: u })} solo={us} />}
          <Chip small label="Se acabó (0)" color={IX.red} on={f.cantidad === '0'} onPress={() => set({ cantidad: '0' })} />
        </Sheet>
      );
      return (
        <Sheet title={`BOTÉ · ${it.nombre.toUpperCase()}`} onClose={onClose} saveLabel="Anotar" color="#b91c1c"
          onSave={() => save((W, ctx) => botar(W, it.id, f.todo ? null : num(f.cantidad), f.unidad, f.motivo, ctx))}>
          <View style={s.chips}>
            {[['vencido', 'Vencido'], ['malo', 'Se echó a perder'], ['roto', 'Se rompió'], ['otro', 'Otro']].map(([k, l]) => <Chip key={k} small label={l} on={f.motivo === k} color={IX.red} onPress={() => set({ motivo: k })} />)}
          </View>
          <View style={s.chips}>
            <Chip small label={`Todo (${cantidadDe(it)})`} on={!!f.todo} onPress={() => set({ todo: true })} />
            <Chip small label="Una parte" on={!f.todo} onPress={() => set({ todo: false })} />
          </View>
          {!f.todo && <Field label="CUÁNTO" value={f.cantidad ?? ''} onChange={(v) => set({ cantidad: v })} decimal big autoFocus />}
          {!f.todo && us.length > 1 && <UnitPicker value={f.unidad} onChange={(u) => set({ unidad: u })} solo={us} />}
          <Text style={s.note}>Lo botado queda aparte (no cuenta como consumo): así ves cuánto se pierde.</Text>
        </Sheet>
      );
    }

    case 'editar': {
      const it = S.items.find((i) => i.id === sheet.id);
      if (!it) return null;
      return (
        <Sheet title="EDITAR" onClose={onClose}
          onSave={() => save((W, ctx) => {
            const contenido = f.contenido ? parseContenido(f.contenido) : null;
            if (f.contenido && !contenido) return { ok: false, msg: 'Lo que trae cada uno: escríbelo con su unidad («1 L», «400 g»)' };
            const r = editar(W, it.id, { nombre: f.nombre, ubicacion: f.ubicacion, minimo: f.minimo === '' ? null : num(f.minimo), vence: f.vence || null, contenido, marca: f.marca });
            if (!r.ok) return r;
            return f.area !== it.area ? mover(W, it.id, f.area, undefined, ctx) : r;
          })}>
          <Field label="NOMBRE" value={f.nombre ?? ''} onChange={(v) => set({ nombre: v })} />
          <AreaPicker value={f.area} onChange={(a) => set({ area: a })} ocultas={S.ocultas} />
          <Field label="DÓNDE ESTÁ" value={f.ubicacion ?? ''} onChange={(v) => set({ ubicacion: v })} placeholder="Refri, repisa del baño, bodega…" />
          <Field label="AVÍSAME CUANDO QUEDE (MÍNIMO)" info="minimo" value={f.minimo ?? ''} onChange={(v) => set({ minimo: v })} decimal placeholder={`En ${it.unidad === 'u' ? 'unidades' : it.unidad}`} />
          {AREA[f.area as AreaId]?.vence !== false && <FechaCampo label="VENCE" modo="futuro" opcional value={f.vence ?? ''} onChange={(v) => set({ vence: v })} now={now} accent={IX.teal} atajosDias={VENCE_ATAJOS} />}
          {familia(it.unidad) === 'cuenta' && <Field label="CADA UNO TRAE" info="contenido" value={f.contenido ?? ''} onChange={(v) => set({ contenido: v })} placeholder="1 L, 400 g…" />}
          <Field label="MARCA" value={f.marca ?? ''} onChange={(v) => set({ marca: v })} />
        </Sheet>
      );
    }

    case 'lista_add': return (
      <Sheet title="ANOTAR PARA COMPRAR" onClose={onClose} saveLabel="A la lista"
        onSave={() => save((W, ctx) => anotarCompra(W, f.nombre, f.cantidad === '' ? null : num(f.cantidad), f.unidad, ctx))}>
        <Field label="QUÉ" value={f.nombre ?? ''} onChange={(v) => set({ nombre: v })} placeholder="Pilas AA, servilletas, plátanos…" autoFocus />
        <Field label="CUÁNTO (OPCIONAL)" value={f.cantidad ?? ''} onChange={(v) => set({ cantidad: v })} decimal />
        <UnitPicker value={f.unidad} onChange={(u) => set({ unidad: u })} />
        <Text style={s.note}>Lo que se acaba ya aparece solo en la lista: esto es para lo que no tienes anotado.</Text>
      </Sheet>
    );

    case 'revision': {
      const xs = V.revision;
      return (
        <Sheet title="REVISIÓN DE LA SEMANA" onClose={onClose}>
          {!xs.length && <Text style={[s.note, { color: IX.green, fontSize: 14 }]}>✓ Todo contado. Te vuelvo a preguntar en una semana.</Text>}
          {xs.length > 0 && <Text style={s.note}>¿Está lo que dice? «Está bien» si sí; si no, cuenta cuánto hay.</Text>}
          {xs.map((it) => (
            <View key={it.id} style={s.rev}>
              <View style={{ flex: 1 }}>
                <Text style={s.revName} numberOfLines={1}>{AREA[it.area].icono} {it.nombre}</Text>
                <Text style={s.revQty}>{cantidadDe(it)}{it.revisado ? ` · contado el ${fechaCorta(it.revisado)}` : ''}</Text>
              </View>
              <Btn small label="Está bien" color={IX.tealDeep} onPress={() => { void act((W, ctx) => confirmar(W, it.id, ctx)); }} />
              <Btn small ghost label="Cambiar" color={IX.amber} onPress={() => open({ k: 'contar', id: it.id })} />
            </View>
          ))}
        </Sheet>
      );
    }

    case 'remedio': {
      const m = sheet.medId ? remedios.find((x) => x.id === sheet.medId) : undefined;
      const it = sheet.itemId != null ? S.items.find((i) => i.id === sheet.itemId) : m ? itemDeRemedio(S.items, m) : undefined;
      const nombre = it?.nombre ?? m?.name ?? 'Remedio';
      const pt = num(f.porToma), td = num(f.tomasDia), hay = f.cantidad === '' ? it?.cantidad ?? 0 : num(f.cantidad);
      const alcanza = pt > 0 && td > 0 && hay >= 0 && (f.cantidad !== '' || it) ? Math.floor(hay / (pt * td)) : null;
      return (
        <Sheet title={`TODOS LOS DÍAS · ${nombre.toUpperCase()}`} onClose={onClose} saveLabel="Guardar"
          onSave={() => save((W, ctx) => {
            let id = it?.id;
            if (id == null) {
              if (f.cantidad === '') return { ok: false, msg: '¿Cuántas tienes hoy?' };
              const r = agregar(W, { nombre, area: 'botiquin', cantidad: num(f.cantidad), unidad: 'u', vence: f.vence || null }, ctx);
              if (!r.ok) return r;
              id = r.id!;
            } else if (f.cantidad !== '') {
              const r = ajustar(W, id, num(f.cantidad), null, ctx);
              if (!r.ok) return r;
            }
            return configurarToma(W, id, f.porToma, f.tomasDia, ctx, m?.id ?? it?.medId ?? null);
          })}>
          {m && (m.dose || m.schedule) && <Text style={s.note}>En tu perfil: {[m.dose, m.schedule].filter(Boolean).join(' · ')}</Text>}
          <Field label={it ? `CUÁNTAS TIENES HOY (AHORA: ${cantidadDe(it)})` : 'CUÁNTAS TIENES HOY'} value={f.cantidad ?? ''} onChange={(v) => set({ cantidad: v })} decimal big autoFocus={!it} placeholder={it ? 'Sin cambio' : '0'} />
          <View style={s.qtyRow}>
            <View style={{ flex: 1 }}><Field label="POR TOMA" value={f.porToma ?? ''} onChange={(v) => set({ porToma: v })} decimal /></View>
            <View style={{ flex: 1 }}><Field label="TOMAS AL DÍA" value={f.tomasDia ?? ''} onChange={(v) => set({ tomasDia: v })} numeric /></View>
          </View>
          {alcanza != null && <Text style={[s.note, { color: alcanza <= 7 ? IX.amber : IX.green }]}>Con eso te alcanza para ~{alcanza} día{alcanza === 1 ? '' : 's'}. Te aviso cuando quede para una semana.</Text>}
          {!it && <FechaCampo label="VENCE (OPCIONAL)" modo="futuro" opcional value={f.vence ?? ''} onChange={(v) => set({ vence: v })} now={now} accent={IX.teal} atajosDias={VENCE_ATAJOS} />}
          <Text style={s.note}>Anota lo que te indicaron: baja solo cada día con esas tomas. Eris no sugiere ni cambia dosis; eso lo ve tu médico.</Text>
          {it?.toma && <Btn small ghost label="Ya no lo uso todos los días" color={IX.muted} onPress={() => { void save((W) => quitarToma(W, it.id)); }} style={{ alignSelf: 'flex-start' }} />}
        </Sheet>
      );
    }

    case 'historia': return (
      <Sheet title="ANOTAR EN TU HISTORIAL" onClose={onClose} saveLabel="Anotar"
        onSave={async () => {
          const titulo = String(f.titulo ?? '').trim();
          if (!titulo) { toast('Escribe qué fue (por ejemplo: «Control con el diabetólogo»)', false); return; }
          const r = await historiaMedica({ add: { date: f.fecha, type: f.tipo as TipoEvento, title: titulo, ...(f.nota?.trim() ? { note: f.nota.trim() } : {}) } });
          toast(r.msg, r.ok);
          if (r.ok) onClose();
        }}>
        <View style={s.chips}>
          {(Object.keys(EVENTO) as TipoEvento[]).map((t) => <Chip key={t} small label={`${EVENTO[t].icon} ${EVENTO[t].label}`} on={f.tipo === t} onPress={() => set({ tipo: t })} />)}
        </View>
        <Field label="QUÉ FUE" value={f.titulo ?? ''} onChange={(v) => set({ titulo: v })} placeholder="Control con el diabetólogo, vacuna de la influenza…" autoFocus />
        <FechaCampo label="CUÁNDO" value={f.fecha ?? ''} onChange={(v) => set({ fecha: v })} now={now} accent={IX.teal} />
        <Field label="NOTA (OPCIONAL)" value={f.nota ?? ''} onChange={(v) => set({ nota: v })} placeholder="Lo que te dijeron, el próximo control…" />
        <Text style={s.note}>Queda en tu perfil, cifrado en el PC de Eris.</Text>
      </Sheet>
    );

    case 'guia': return <GuiaSheet onClose={onClose} open={open} irA={irA} onTour={onTour} />;
    case 'ajustes': return <AjustesSheet S={S} onClose={onClose} act={act} onTour={onTour} toast={toast} />;
    default: return null;
  }
}

function Opcion({ icon, titulo, sub, onPress }: { icon: string; titulo: string; sub?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.opcion} onPress={onPress} accessibilityRole="button" accessibilityLabel={titulo}>
      <Text style={s.opIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.opTitle}>{titulo}</Text>
        {!!sub && <Text style={s.opSub}>{sub}</Text>}
      </View>
      <Text style={s.opGo}>›</Text>
    </TouchableOpacity>
  );
}

/** ¿Cómo hago…? — cada tarea: dónde está y un botón para hacerla ahora */
function GuiaSheet({ onClose, open, irA, onTour }: { onClose: () => void; open: (s: SheetState) => void; irA: (s: Seccion, a?: AreaId | null) => void; onTour: () => void }) {
  const ir = (sec: Seccion) => () => { onClose(); irA(sec); };
  const items: Array<{ q: string; a: string; label?: string; run?: () => void }> = [
    { q: 'Agregar lo que tengo o compré', a: 'Botón + → Agregar a mano (o escanea el código). Si ya lo tienes, se suma. O dile a Eris: «compré 2 L de leche».', label: 'Agregar', run: () => open({ k: 'agregar' }) },
    { q: 'Usé algo o se acabó', a: 'Áreas → toca la cosa → «Usé…», o el − de la fila (una unidad). Si se acabó: «Contar» → 0. Por chat: «se me acabó el shampoo».', label: 'Ir a Áreas', run: ir('areas') },
    { q: 'Boté algo vencido', a: 'Toca la cosa → «Boté». Queda aparte del consumo, para ver cuánto se pierde.' },
    { q: 'Que me avise antes de que se acabe', a: 'Al agregar (o en Editar): «Avísame cuando quede» con el mínimo. Bajo eso pasa solo a la lista de compras.' },
    { q: 'La lista de compras', a: 'Compras: lo que se acabó o queda poco aparece solo, con cuánto comprar y el costo estimado. «✓ Lo compré» lo suma a tu casa.', label: 'Ver la lista', run: ir('compras') },
    { q: 'Que no se me venza nada', a: 'Pon la fecha al agregar. En Hoy ves lo que vence en 7 días, y lo vencido en rojo.', label: 'Ir a Hoy', run: ir('hoy') },
    { q: 'Que el inventario sea real', a: 'Una vez a la semana, «Revisión rápida»: un toque por cosa («está bien» o cuánto hay). Cada cambio queda en el historial de esa cosa.', label: 'Revisar', run: () => open({ k: 'revision' }) },
    { q: 'Mis remedios', a: 'Botiquín → Tus remedios (los de tu perfil) → «Anotar»: cuántas tienes y tus tomas al día. Bajan solos y te aviso cuando alcancen para una semana. Eris no sugiere dosis.', label: 'Ir a Botiquín', run: ir('botiquin') },
    { q: 'Anotar una consulta o un examen', a: 'Botiquín → Historial médico → «+ Anotar consulta o evento», con su fecha.', label: 'Anotar', run: () => open({ k: 'historia' }) },
    { q: 'Lo que como, ¿se descuenta?', a: 'Sí: lo que anotas en Nutrición sale solo de Alimentos y Despensa. En Hoy ves lo descontado; «Lo comí fuera» lo devuelve. Se apaga en ⚙.' },
    { q: 'La boleta del súper', a: 'Finanzas → + → Foto de la boleta: queda UN gasto con el total y cada producto pasa a su área de tu casa (en la revisión eliges dónde va, o que no vaya).' },
    { q: 'Un área que no uso (o Mascotas)', a: '⚙ → Áreas: escóndelas o muéstralas. Lo guardado no se borra.' },
    { q: 'Preguntarle a Eris', a: '«¿Tengo arroz?», «¿qué tengo en el refri?», «¿qué me falta comprar?», «¿qué se vence esta semana?».' },
  ];
  return (
    <Sheet title="¿CÓMO HAGO…?" onClose={onClose}>
      <View style={s.mapa}>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>🏠 Hoy</Text>  lo que se vence, lo que se acaba y la revisión</Text>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>🗂 Áreas</Text>  dónde está cada cosa (y el buscador)</Text>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>💊 Botiquín</Text>  tus remedios y tu historial médico</Text>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>🛒 Compras</Text>  la lista, sola y con lo que anotes</Text>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>＋</Text>  todo lo que agregas parte acá</Text>
      </View>
      {items.map((x) => (
        <View key={x.q} style={s.guia}>
          <Text style={s.opTitle}>{x.q}</Text>
          <Text style={s.opSub}>{x.a}</Text>
          {x.run && <Btn small ghost label={x.label ?? 'Ir'} color={IX.teal} onPress={x.run} style={{ alignSelf: 'flex-start', marginTop: 6 }} />}
        </View>
      ))}
      <Btn small ghost label="Ver el recorrido de nuevo" color={IX.muted} onPress={onTour} />
    </Sheet>
  );
}

/** ⚙: qué áreas se ven, el respaldo del PC y el recorrido */
function AjustesSheet({ S, onClose, act, onTour, toast }: { S: InventoryState; onClose: () => void; act: Act; onTour: () => void; toast: (m: string, ok?: boolean) => void }) {
  // 'nada' = aún no se piden; null = sin conexión con el PC
  const [copias, setCopias] = useState<InventoryBackupCopy[] | null | 'cargando' | 'nada'>('nada');
  const ver = async () => { setCopias('cargando'); setCopias(await listInventoryBackups()); };
  const restaurar = (c: InventoryBackupCopy) => Alert.alert('Restaurar', `Tu Inventario queda como el ${fechaHora(c.at)} (${c.stats.items} cosas). Lo de ahora se guarda aparte en el teléfono.`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Restaurar', onPress: async () => { const r = await inventoryStore.restore(c.day); toast(r.message, r.ok); if (r.ok) onClose(); } },
  ]);
  const cuenta = useMemo(() => Object.fromEntries(AREAS.map((a) => [a.id, S.items.filter((i) => i.area === a.id && !i.archivado).length])), [S]);
  return (
    <Sheet title="AJUSTES" onClose={onClose}>
      <Label>ÁREAS QUE USAS</Label>
      <View style={s.chips}>
        {AREAS.map((a) => {
          const visible = !S.ocultas.includes(a.id);
          return <Chip key={a.id} small label={`${a.icono} ${a.corto}${cuenta[a.id] ? ` (${cuenta[a.id]})` : ''}`} on={visible} color={AREA_COLOR[a.id]} onPress={() => { void act((W) => ocultarArea(W, a.id, visible)); }} />;
        })}
      </View>
      <Text style={s.note}>Toca para esconder o mostrar. Lo guardado en un área escondida no se borra.</Text>
      <Label info="comida_despensa">LO QUE COMES</Label>
      <View style={s.chips}>
        <Chip small label="Se descuenta de la despensa" on={S.ajustes?.descontarComida !== false} onPress={() => { void act((W) => ajustarDescuentoComida(W, true)); }} />
        <Chip small label="No descontar" on={S.ajustes?.descontarComida === false} onPress={() => { void act((W) => ajustarDescuentoComida(W, false)); }} />
      </View>
      <Label>RESPALDO EN EL PC</Label>
      <Text style={s.note}>Cada cambio se respalda cifrado en el PC de Eris (una copia por día, las últimas 7).</Text>
      {copias === 'nada' && <Btn small ghost label="Ver las copias del PC" color={IX.teal} onPress={() => { void ver(); }} style={{ alignSelf: 'flex-start' }} />}
      {copias === 'cargando' && <ActivityIndicator color={IX.teal} />}
      {Array.isArray(copias) && !copias.length && <Text style={s.note}>Todavía no hay copias en el PC.</Text>}
      {Array.isArray(copias) && copias.map((c) => (
        <TouchableOpacity key={c.day} style={s.opcion} onPress={() => restaurar(c)} accessibilityRole="button" accessibilityLabel={`Restaurar la copia del ${fechaHora(c.at)}`}>
          <Text style={s.opIcon}>💾</Text>
          <View style={{ flex: 1 }}><Text style={s.opTitle}>{fechaHora(c.at)}</Text><Text style={s.opSub}>{c.stats.items} cosas · {c.stats.conStock} con stock</Text></View>
          <Text style={s.opGo}>›</Text>
        </TouchableOpacity>
      ))}
      {copias === null && <Text style={s.note}>Sin conexión con el PC: abre la app con internet y vuelve a intentar.</Text>}
      <Btn small ghost label="Ver el recorrido" color={IX.muted} onPress={onTour} style={{ marginTop: 8 }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  hint: { color: IX.dim, fontSize: 12, lineHeight: 17, marginTop: 4 },
  note: { color: IX.muted, fontSize: 12.5, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  qtyRow: { flexDirection: 'row', gap: 10 },
  mas: { minHeight: 36, justifyContent: 'center' },
  masText: { color: IX.teal, fontSize: 13, fontWeight: '800' },
  itName: { color: IX.text, fontSize: 22, fontWeight: '900' },
  itMarca: { color: IX.muted, fontSize: 14, fontWeight: '600' },
  itQty: { color: IX.teal, fontFamily: IX.mono, fontSize: 28, fontWeight: '800' },
  facts: { gap: 4 },
  fact: { color: IX.muted, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridBtn: { flexBasis: '47%', flexGrow: 1 },
  mov: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34, borderTopWidth: 1, borderTopColor: IX.lineSoft },
  movDate: { color: IX.dim, fontFamily: IX.mono, fontSize: 11, width: 50 },
  movTipo: { color: IX.text, fontSize: 13, flex: 1 },
  movDelta: { fontFamily: IX.mono, fontSize: 12 },
  rev: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 56, borderTopWidth: 1, borderTopColor: IX.lineSoft },
  revName: { color: IX.text, fontSize: 14, fontWeight: '700' },
  revQty: { color: IX.muted, fontSize: 11.5, marginTop: 2, fontFamily: IX.mono },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, borderTopWidth: 1, borderTopColor: IX.lineSoft },
  opIcon: { fontSize: 20, width: 32, textAlign: 'center', color: IX.text },
  opTitle: { color: IX.text, fontSize: 14.5, fontWeight: '700' },
  opSub: { color: IX.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  opGo: { color: IX.dim, fontSize: 22 },
  mapa: { borderWidth: 1, borderColor: IX.line, borderRadius: 12, padding: 12, gap: 6, backgroundColor: IX.panelHi },
  mapaRow: { color: IX.muted, fontSize: 12.5 },
  mapaKey: { color: IX.text, fontWeight: '800' },
  guia: { borderTopWidth: 1, borderTopColor: IX.lineSoft, paddingVertical: 10 },
});
