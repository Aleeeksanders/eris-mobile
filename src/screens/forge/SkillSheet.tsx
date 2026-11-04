// Forge 2.0 — la hoja de una habilidad del árbol: por qué sirve, qué sube, su poder según tu rutina, cómo
// desbloquearla y sus pasos reales (marcar cada uno; «Ya la domino» si la haces hace tiempo). Igual que el HTML.
// Fase I9: también las de las disciplinas nuevas (forgeSkillsExt: golpeo, patadas, clinch, defensa, combos y tricks).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as C from '../../services/forge/forgeCore';
import { FG, FONT, dec } from './theme';
import { Icon } from './icons';
import { Bar, Btn, H, Label, P, Row, Sheet } from './ui';
import { useForgeState, useForgeAct } from './useForge';
import { useForgeUi } from './forgeUi';
import { skillStateOf } from './tabs/Hoy';
import * as Str from '../../services/forge/forgeStrength';
import * as X from '../../services/forge/forgeSkillsExt';

const L = C.L;

export default function SkillSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const S = useForgeState();
  const act = useForgeAct();
  const ui = useForgeUi();
  const sk = id ? X.skillById(id) : null;
  if (!S || !sk) return <Sheet visible={false} onClose={onClose}><View /></Sheet>;
  const stt = skillStateOf(S, sk, ui.level);
  const cat = X.catById(sk.cat);
  const cc = cat?.color || FG.red;
  const ext = !!X.EXT_SKILL_BY_ID[sk.id];
  const muscles = ext ? X.EXT_SKILL_MUSCLES[sk.id] : L.SKILL_MUSCLES[sk.id];
  const { grp } = C.groupLevels(S);
  const pw = muscles ? (ext ? X.extSkillPower(grp, sk.id) : L.skillPower(grp, sk)) : 0;
  const crit = Str.ALL_CRITERIA[sk.id];
  const stats: string[] = ext ? X.EXT_CATS.find((c) => c.id === sk.cat)?.stats ?? [] : L.CAT_STATS[sk.cat] || [];
  const isSpecial = L.SPECIALS.some((sp: any) => sp.skill === sk.id);
  const steps: boolean[] = S.skills?.[sk.id]?.steps || sk.steps.map(() => false);

  const toggle = (i: number) => {
    const was = steps.every(Boolean) && steps.length === sk.steps.length;
    const next = steps.slice(); next[i] = !next[i];
    const now = next.every(Boolean) && next.length === sk.steps.length;
    if (now && !was) ui.toast(sk.xp, `${sk.name} · ¡DOMINADA!`);
    act((s) => Str.toggleStepManual(s, sk.id, i), 'habilidad');
  };

  return (
    <Sheet visible={!!id} onClose={onClose}>
      <Row gap={12} style={{ marginBottom: 10 }}>
        <View style={[st.emoji, { borderColor: cc, backgroundColor: cc + '22' }]}><Text style={{ fontSize: 28 }}>{sk.emoji}</Text></View>
        <View style={{ flex: 1 }}>
          <H size={28}>{sk.name}</H>
          <Label size={11} color={cc}>{cat?.label} · +{sk.xp} XP</Label>
        </View>
      </Row>
      <P color={FG.text} style={{ marginBottom: 10 }}>{sk.why}</P>
      <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        <Label size={10.5} color={FG.gold}>🌳 AL DOMINARLA SUBE:</Label>
        {stats.map((x: string) => <Text key={x} style={st.tag}>+{x}</Text>)}
        <P size={11.5} color={FG.dim}>Pesa más mientras más alto su nivel ({sk.lvl}).</P>
      </Row>
      {muscles && (
        <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {Object.entries(muscles).sort((a: any, b: any) => b[1] - a[1]).map(([mid, pts]: any) => (
            <Text key={mid} style={[st.tag, { color: FG.text }]}>{L.GROUP_BY_ID[mid].emoji} {L.GROUP_BY_ID[mid].name}{pts >= 2 ? '' : ' ·'}</Text>
          ))}
        </Row>
      )}
      {muscles && (
        <View style={st.box}>
          <Row style={{ marginBottom: 6 }}><Icon name="Zap" size={14} color={FG.gold} /><Label size={11} color={FG.text} style={{ flex: 1 }}>PODER (según tu rutina)</Label><H size={18} color={FG.gold}>Nv {dec(pw)}</H></Row>
          <Bar pct={Math.min(100, (pw / 12) * 100)} color={FG.gold} height={6} />
          <P size={11.5} color={FG.dim} style={{ marginTop: 6 }}>Sube entrenando los músculos que usa; baja si dejas de entrenar.{isSpecial ? ' Al dominarla, se vuelve un ataque especial en la Arena.' : ''}</P>
        </View>
      )}
      {stt === 'locked' ? (
        <View style={st.box}>
          <Label size={11} color={FG.muted} style={{ marginBottom: 6 }}>🔒 PARA DESBLOQUEAR</Label>
          <P color={ui.level >= sk.lvl ? FG.green : FG.text}>{ui.level >= sk.lvl ? '✓' : '○'} Alcanzar nivel {sk.lvl} (estás en {ui.level})</P>
          {sk.prereq.map((p: string) => <P key={p} color={C.isMasteredAny(S, p) ? FG.green : FG.text}>{C.isMasteredAny(S, p) ? '✓' : '○'} Dominar: {X.skillById(p)?.name ?? p}</P>)}
          <P size={12} style={{ marginTop: 10 }}>¿Ya la haces hace tiempo? No tienes que volver a empezar: márcala como dominada (solo si de verdad la dominas).</P>
          <Btn title="✓ Ya la domino" kind="gold" small onPress={() => { ui.toast(sk.xp, `${sk.name} · ¡DOMINADA!`); act((s) => C.masterSkill(s, sk.id), 'habilidad'); }} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
        </View>
      ) : (
        <>
          {sk.safety ? <View style={[st.box, { borderColor: FG.orange + '55' }]}><P size={12.5} color={FG.orange}>⚠️ {sk.safety}</P></View> : null}
          <Label size={11} style={{ marginBottom: 6 }}>PROGRESIÓN REAL · marca lo que logres</Label>
          {crit ? <P size={11.5} color={FG.dim} style={{ marginBottom: 6 }}>⚡ Los pasos con rayo se marcan solos con lo que anotas en ENTRENAR (si desmarcas uno, se respeta).</P> : null}
          <View style={{ gap: 8 }}>
            {sk.steps.map((step: string, i: number) => (
              <TouchableOpacity key={i} onPress={() => toggle(i)} style={[st.step, steps[i] && { borderColor: cc, backgroundColor: cc + '18' }]} accessibilityRole="checkbox" accessibilityState={{ checked: !!steps[i] }}>
                <View style={[st.check, steps[i] && { backgroundColor: cc, borderColor: cc }]}>{steps[i] && <Icon name="Check" size={14} color="#0c0b0e" strokeWidth={3} />}</View>
                <View style={{ flex: 1 }}>
                  <P color={steps[i] ? FG.white : FG.text}>{crit?.[i] ? '⚡ ' : ''}{step}</P>
                  {crit?.[i] ? <P size={11} color={FG.dim}>{((S.skills?.[sk.id] as any)?.auto ?? []).includes(i) && steps[i] ? 'marcado solo por tus series' : Str.critText(crit[i])}</P> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  emoji: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tag: { fontFamily: FONT.bodyBold, fontSize: 12, color: FG.gold, borderWidth: 1, borderColor: FG.line2, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  box: { borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel2, borderRadius: 12, padding: 12, marginBottom: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: FG.line3, alignItems: 'center', justifyContent: 'center' },
});
