// ============================================================
// Forge 2.0 — ÁRBOL: el mismo árbol del HTML (79 habilidades, mismas posiciones, prerrequisitos y colores por rama).
// Se arrastra para explorar, se pellizca o se usan − / + para el zoom, y cada nodo abre su hoja (SkillSheet).
// Fase I9: «Disciplinas» muestra las ramas nuevas (golpeo, patadas, clinch, defensa, combinaciones y tricks) como listas
// por nivel, primero las de tus clases. El árbol del HTML queda igual.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as C from '../../../services/forge/forgeCore';
import { FG, FONT } from '../theme';
import { Icon } from '../icons';
import { Label, P, Row } from '../ui';
import { useForgeState } from '../useForge';
import { useForgeUi } from '../forgeUi';
import { skillStateOf } from './Hoy';
import * as X from '../../../services/forge/forgeSkillsExt';

const L = C.L;
const catColor = (id: string) => (L.CATS.find((c: any) => c.id === id) || {}).color || FG.muted;

export default function Arbol() {
  const [view, setView] = useState<'arbol' | 'disciplinas'>('arbol');
  return (
    <View>
      <Row gap={6} style={{ paddingHorizontal: 16, marginBottom: 10 }}>
        <TouchableOpacity onPress={() => setView('arbol')} style={[st.seg, view === 'arbol' && st.segOn]} accessibilityRole="tab" accessibilityState={{ selected: view === 'arbol' }}><Text style={[st.segTxt, view === 'arbol' && st.segTxtOn]}>Árbol</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setView('disciplinas')} style={[st.seg, view === 'disciplinas' && st.segOn]} accessibilityRole="tab" accessibilityState={{ selected: view === 'disciplinas' }}><Text style={[st.segTxt, view === 'disciplinas' && st.segTxtOn]}>Disciplinas</Text></TouchableOpacity>
      </Row>
      {view === 'arbol' ? <Tree /> : <Disciplines onTree={() => setView('arbol')} />}
    </View>
  );
}

/** Las ramas de combate y tricks, como listas por nivel (primero las de tus clases). */
function Disciplines({ onTree }: { onTree: () => void }) {
  const S = useForgeState()!;
  const ui = useForgeUi();
  const mine = new Set(X.branchesOf(S.classes));
  const ownExt = X.EXT_CATS.filter((c) => mine.has(c.id));
  const [all, setAll] = useState(ownExt.length === 0);
  const cats = all ? X.EXT_CATS : ownExt;
  const legacyBranches = (S.classes || []).some((c) => ['parkour', 'tricking', 'calistenia'].includes(c));
  const classesOf = (cat: string) => X.ALL_CLASSES.filter((c) => (X.CLASS_BRANCHES[c.id] ?? []).includes(cat)).map((c) => c.name).join(' · ');
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <Row gap={6} style={{ marginBottom: 10 }}>
        <TouchableOpacity onPress={() => setAll(false)} disabled={!ownExt.length} style={[st.chip, !all && st.chipOn, !ownExt.length && { opacity: 0.45 }]}><Text style={[st.chipTxt, !all && st.chipTxtOn]}>Tus clases</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setAll(true)} style={[st.chip, all && st.chipOn]}><Text style={[st.chipTxt, all && st.chipTxtOn]}>Todas</Text></TouchableOpacity>
      </Row>
      {!ownExt.length && <P size={12} color={FG.dim} style={{ marginBottom: 8 }}>Elige Boxeo, Muay Thai, Karate, Taekwondo o Tricking en PERSONAJE y aquí van primero sus ramas.</P>}
      {legacyBranches && (
        <TouchableOpacity onPress={onTree} style={st.hint} activeOpacity={0.85}>
          <P size={12} color={FG.text} style={{ flex: 1 }}>Fuerza, parkour y acrobacia están en el Árbol.</P>
          <Icon name="ChevronRight" size={15} color={FG.dim} />
        </TouchableOpacity>
      )}
      {cats.map((cat) => {
        const list = X.EXT_SKILLS.filter((sk) => sk.cat === cat.id).sort((a, b) => a.lvl - b.lvl);
        const done = list.filter((sk) => C.isMasteredAny(S, sk.id)).length;
        return (
          <View key={cat.id} style={[st.branch, { borderColor: cat.color + '44' }]}>
            <Row style={{ marginBottom: 2 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: cat.color }} />
              <Text style={[st.branchName, { color: cat.color }]}>{cat.label}</Text>
              <Label size={11}>{done}/{list.length}</Label>
            </Row>
            <P size={11} color={FG.dim} style={{ marginBottom: 6 }}>{classesOf(cat.id)} · al dominar sube {cat.stats.join(' y ')}</P>
            {list.map((sk) => {
              const stt = skillStateOf(S, sk, ui.level);
              const steps = S.skills?.[sk.id]?.steps || [];
              const dc = steps.filter(Boolean).length;
              const ring = stt === 'mastered' ? FG.gold : stt === 'locked' ? FG.line3 : cat.color;
              const missing = stt === 'locked' ? [ui.level < sk.lvl ? `nivel ${sk.lvl}` : null, ...sk.prereq.filter((p: string) => !C.isMasteredAny(S, p)).map((p: string) => X.skillById(p)?.name)].filter(Boolean).join(', ') : '';
              return (
                <TouchableOpacity key={sk.id} onPress={() => ui.openSkill(sk.id)} activeOpacity={0.8} style={st.row} accessibilityLabel={`${sk.name}, nivel ${sk.lvl}${stt === 'locked' ? ', bloqueada' : stt === 'mastered' ? ', dominada' : ''}`}>
                  <View style={[st.dot, { borderColor: ring, backgroundColor: stt === 'mastered' ? '#2a2310' : stt === 'locked' ? '#141019' : cat.color + '22', opacity: stt === 'locked' ? 0.7 : 1 }]}>
                    <Text style={{ fontSize: 18 }}>{sk.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.rowName, stt === 'locked' && { color: FG.dim }]}>{sk.name}</Text>
                    <Text style={st.rowSub}>{stt === 'locked' ? `Requiere: ${missing}` : stt === 'mastered' ? `Dominada · +${sk.xp} XP` : `${dc}/${sk.steps.length} pasos · +${sk.xp} XP`}</Text>
                  </View>
                  <Text style={st.rowLv}>Lv{sk.lvl}</Text>
                  {stt === 'locked' ? <Icon name="Lock" size={13} color={FG.dim} /> : stt === 'mastered' ? <Icon name="Check" size={14} color={FG.gold} strokeWidth={3} /> : <Icon name="ChevronRight" size={14} color={FG.dim} />}
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
      <P size={11.5} color={FG.dim} style={{ marginBottom: 12 }}>⚡ Los rounds que anotas en ENTRENAR (sombra, saco, patadas, rodillazos, escalera, comba) marcan solos sus pasos. Lo de técnica con compañero se marca a mano.</P>
    </View>
  );
}

/** El árbol del HTML (79 habilidades, mismas posiciones). */
function Tree() {
  const S = useForgeState()!;
  const ui = useForgeUi();
  const { width } = useWindowDimensions();
  const [zoom, setZoom] = useState(0.85);
  const hRef = useRef<ScrollView>(null);
  const pinch = useRef({ dist: 0, zoom: 1 });
  const W = L.LAYOUT.width * zoom, Hh = L.LAYOUT.height * zoom, N = L.NODE * zoom;

  // Al abrir: centrado (como el HTML)
  useEffect(() => { const t = setTimeout(() => hRef.current?.scrollTo({ x: Math.max(0, (W - width) / 2), animated: false }), 50); return () => clearTimeout(t); }, []);

  const onTouchStart = (e: any) => {
    const t = e.nativeEvent.touches;
    if (t.length === 2) pinch.current = { dist: Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY), zoom };
  };
  const onTouchMove = (e: any) => {
    const t = e.nativeEvent.touches;
    if (t.length === 2 && pinch.current.dist > 0) {
      const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
      setZoom(+Math.min(1.6, Math.max(0.4, pinch.current.zoom * (d / pinch.current.dist))).toFixed(2));
    }
  };
  const onTouchEnd = (e: any) => { if (e.nativeEvent.touches.length < 2) pinch.current.dist = 0; };

  return (
    <View>
      <Row gap={10} style={{ flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 8 }}>
        {L.CATS.map((c: any) => (
          <Row key={c.id} gap={5}><View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c.color }} /><Label size={10} color={FG.muted}>{c.label}</Label></Row>
        ))}
      </Row>
      <P size={12} color={FG.dim} style={{ paddingHorizontal: 16, marginBottom: 8 }}>Arrastra para explorar · pellizca o usa − / + para el zoom · toca un nodo</P>
      <View style={st.viewport}>
        <ScrollView ref={hRef} horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
          <View style={{ width: W, height: Hh }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            <Svg width={W} height={Hh} viewBox={`0 0 ${L.LAYOUT.width} ${L.LAYOUT.height}`} style={StyleSheet.absoluteFill}>
              {L.SKILLS.flatMap((sk: any) => sk.prereq.map((p: string) => {
                const a = L.center(p), b = L.center(sk.id);
                const active = L.isMastered(S, p);
                const dy = (b.cy - a.cy) * 0.45;
                return <Path key={p + sk.id} d={`M ${a.cx} ${a.cy} C ${a.cx} ${a.cy + dy}, ${b.cx} ${b.cy - dy}, ${b.cx} ${b.cy}`} stroke={active ? catColor(sk.cat) : '#2a2630'} strokeWidth={active ? 2.5 : 1.6} strokeOpacity={active ? 0.85 : 1} fill="none" />;
              }))}
            </Svg>
            {L.SKILLS.map((sk: any) => {
              const { x, y } = L.LAYOUT.coord[sk.id];
              const stt = skillStateOf(S, sk, ui.level);
              const cc = catColor(sk.cat);
              const ring = stt === 'mastered' ? FG.gold : stt === 'locked' ? FG.line3 : cc;
              const steps = S.skills?.[sk.id]?.steps || [];
              const dc = steps.filter(Boolean).length;
              return (
                <View key={sk.id} style={{ position: 'absolute', left: x * zoom - 20 * zoom, top: y * zoom, width: N + 40 * zoom, alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => ui.openSkill(sk.id)} activeOpacity={0.8}
                    style={[st.node, { width: N, height: N, borderRadius: N / 2, borderColor: ring, backgroundColor: stt === 'mastered' ? '#2a2310' : stt === 'locked' ? '#141019' : cc + '26', opacity: stt === 'locked' ? 0.75 : 1 }]}>
                    <Text style={{ fontSize: 22 * zoom }}>{sk.emoji}</Text>
                    {stt === 'locked' && <View style={[st.badge, { right: -2 * zoom, bottom: -2 * zoom }]}><Icon name="Lock" size={11} color={FG.dim} /></View>}
                    {stt === 'mastered' && <View style={[st.badge, { right: -2 * zoom, bottom: -2 * zoom, borderColor: FG.gold }]}><Icon name="Check" size={11} color={FG.gold} strokeWidth={3} /></View>}
                    {stt === 'progress' && <View style={[st.prog, { borderColor: cc }]}><Text style={[st.progT, { color: cc }]}>{dc}/{sk.steps.length}</Text></View>}
                  </TouchableOpacity>
                  <Text numberOfLines={2} style={[st.name, { fontSize: Math.max(8.5, 10.5 * zoom), color: stt === 'locked' ? FG.dim : FG.text }]}>{sk.name}</Text>
                  <Text style={[st.lv, { fontSize: Math.max(8, 9.5 * zoom) }]}>Lv{sk.lvl}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
        <View style={st.zoomBar}>
          <TouchableOpacity style={st.zoomBtn} onPress={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))} accessibilityLabel="Alejar"><Icon name="Minus" size={18} color={FG.text} /></TouchableOpacity>
          <Text style={st.zoomTxt}>{Math.round(zoom * 100)}%</Text>
          <TouchableOpacity style={st.zoomBtn} onPress={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))} accessibilityLabel="Acercar"><Icon name="Plus" size={18} color={FG.text} /></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  seg: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel },
  segOn: { borderColor: FG.red, backgroundColor: FG.red + '1f' },
  segTxt: { fontFamily: FONT.bodyBold, fontSize: 13, color: FG.muted },
  segTxtOn: { color: FG.white },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: FG.line2 },
  chipOn: { borderColor: FG.gold, backgroundColor: FG.gold + '1a' },
  chipTxt: { fontFamily: FONT.bodyBold, fontSize: 12, color: FG.muted },
  chipTxtOn: { color: FG.gold },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel, marginBottom: 10 },
  branch: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12, backgroundColor: FG.panel },
  branchName: { fontFamily: FONT.display, fontSize: 20, flex: 1, marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: FG.line },
  dot: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontFamily: FONT.bodyBold, fontSize: 14, color: FG.text },
  rowSub: { fontFamily: FONT.body, fontSize: 11.5, color: FG.dim },
  rowLv: { fontFamily: FONT.body, fontSize: 11, color: FG.dim, marginRight: 4 },
  viewport: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: FG.line, backgroundColor: '#100e14' },
  node: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: FG.bg, borderWidth: 1, borderColor: FG.line3, alignItems: 'center', justifyContent: 'center' },
  prog: { position: 'absolute', top: -6, right: -10, backgroundColor: FG.bg, borderWidth: 1, borderRadius: 8, paddingHorizontal: 4 },
  progT: { fontFamily: FONT.bodyBold, fontSize: 9.5 },
  name: { fontFamily: FONT.bodyBold, textAlign: 'center', marginTop: 3, lineHeight: 12 },
  lv: { fontFamily: FONT.body, color: FG.dim },
  zoomBar: { position: 'absolute', right: 14, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(21,19,26,0.98)', borderWidth: 1, borderColor: FG.line2, borderRadius: 12, padding: 4 },
  zoomBtn: { width: 38, height: 38, borderRadius: 9, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.line, alignItems: 'center', justifyContent: 'center' },
  zoomTxt: { fontFamily: FONT.bodyBold, color: FG.muted, fontSize: 12, minWidth: 40, textAlign: 'center' },
});
