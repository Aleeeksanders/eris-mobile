// ============================================================
// Forge 2.0 — ARENA: tus stats de combate (salen de tus músculos, el árbol, tu trayectoria y tus hábitos), enemigos
// reales y de fantasía, y mazmorras. Las mismas peleas y fórmulas del HTML (forgeCore.attack).
// Fase I9: tus parámetros atléticos (forgeAthletic) y las clases nuevas (sus bonos ya entran a las stats).
// ============================================================
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import * as C from '../../../services/forge/forgeCore';
import { FG, FONT, dec } from '../theme';
import { Icon } from '../icons';
import { Bar, Btn, Chip, H, Label, P, Panel, Row } from '../ui';
import { useForgeState, useForgeAct } from '../useForge';
import { useForgeUi } from '../forgeUi';
import { AthleticBars } from '../AthleticRadar';
import * as A from '../../../services/forge/forgeAthletic';
import * as X from '../../../services/forge/forgeSkillsExt';

const L = C.L;

export default function Arena() {
  const S = useForgeState()!;
  const act = useForgeAct();
  const ui = useForgeUi();
  const [fight, setFight] = useState<C.Fight | null>(null);
  const [mode, setMode] = useState<'real' | 'fantasia'>('real');
  const cs = C.combatStats(S);

  const attack = (special: any | null) => {
    if (!fight) return;
    const step = C.attack(S, fight, special);
    setFight(step.fight);
    if (step.xp || step.dungeonDone) {
      act((s) => C.applyFightReward(s, step), 'arena');
      if (step.dungeonDone) { const dg = L.DUNGEONS.find((d: any) => d.id === step.dungeonDone); ui.toast(step.xp, `¡${dg?.name.toUpperCase()} CONQUISTADA!`); }
      else if (step.xp) ui.toast(step.xp, `¡Derrotaste a ${fight.enemy?.name}!`);
    }
  };

  if (fight) {
    const isEnemy = fight.mode === 'enemy';
    const dg = isEnemy ? null : L.DUNGEONS.find((d: any) => d.id === fight.dungeonId);
    const m = isEnemy ? fight.enemy : dg.monsters[fight.idx ?? 0];
    const hdrColor = isEnemy ? FG.red : dg.color;
    const hdrLabel = isEnemy ? 'COMBATE RÁPIDO' : `${dg.name.toUpperCase()} · ${(fight.idx ?? 0) + 1}/${dg.monsters.length}`;
    return (
      <View>
        <Panel tint={hdrColor}>
          <Label size={11}>{hdrLabel}</Label>
          <Row gap={12} style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 46 }}>{m.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Row style={{ justifyContent: 'space-between' }}><H size={24}>{m.name}{m.boss ? ' 👑' : ''}</H><H size={18} color={FG.pink}>{fight.enemyHp}/{fight.enemyMax}</H></Row>
              <Bar pct={(fight.enemyHp / fight.enemyMax) * 100} color={FG.red} height={10} />
            </View>
          </Row>
        </Panel>
        <Panel>
          <Row style={{ marginBottom: 6 }}><Icon name="Heart" size={16} color={FG.green} /><H size={20} style={{ flex: 1 }}>TÚ</H><H size={18} color={FG.green}>{fight.playerHp}/{fight.playerMax} HP</H></Row>
          <Bar pct={(fight.playerHp / fight.playerMax) * 100} color={FG.green} height={10} />
          <Row gap={10} style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {[`ATK ${cs.atk}`, `DEF ${cs.def}`, `EVA ${Math.round(cs.eva * 100)}%`, `Crít ${Math.round(cs.crit * 100)}%·x${cs.critDmg}`, cs.vigor > 0 ? `Vigor +${cs.vigor}` : ''].filter(Boolean).map((t) => <P key={t} size={12}>{t}</P>)}
          </Row>
        </Panel>
        <Panel>
          {fight.log.map((l, i) => <P key={i} size={13} color={i === 0 ? FG.white : FG.muted}>{l}</P>)}
        </Panel>
        {fight.over ? (
          <View style={{ gap: 10 }}>
            <View style={[st.result, { borderColor: fight.win ? FG.green + '66' : FG.red + '66' }]}><H size={30} color={fight.win ? FG.green : FG.red}>{fight.win ? '¡VICTORIA!' : 'DERROTA'}</H></View>
            <Btn title="Volver a la Arena" onPress={() => setFight(null)} />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Btn title="ATACAR" icon="Swords" onPress={() => attack(null)} />
            {cs.specials.length > 0 && (
              <View>
                <Label size={11} style={{ marginBottom: 6 }}>ATAQUES ESPECIALES (del árbol)</Label>
                <View style={{ gap: 6 }}>
                  {cs.specials.map((sp: any) => {
                    const cd = fight.cooldowns[sp.skill] || 0;
                    return (
                      <TouchableOpacity key={sp.skill} disabled={cd > 0} onPress={() => attack(sp)} style={[st.special, { opacity: cd > 0 ? 0.5 : 1, borderColor: cd > 0 ? FG.line2 : FG.gold + '55' }]}>
                        <Text style={{ fontSize: 22 }}>{sp.emoji}</Text>
                        <View style={{ flex: 1 }}><P color={FG.white} bold>{sp.name}</P><P size={11.5}>{sp.desc}</P></View>
                        <H size={18} color={cd > 0 ? FG.dim : FG.gold}>{cd > 0 ? `${cd}t` : `x${sp.mult}`}</H>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
            <Btn title="Huir" kind="ghost" onPress={() => setFight(null)} />
          </View>
        )}
      </View>
    );
  }

  const stats = [
    { l: 'ATK', v: cs.atk, c: FG.pink, src: 'músculos · árbol · exp' },
    { l: 'HP', v: cs.maxHp, c: FG.green, src: 'core · exp · hábitos' },
    { l: 'DEFENSA', v: cs.def, c: FG.blue, src: 'core · espalda · exp' },
    { l: 'CRÍTICO', v: `${Math.round(cs.crit * 100)}%`, c: FG.gold, src: 'agilidad' },
    { l: 'DAÑO CRÍT', v: `x${cs.critDmg}`, c: '#ff9f43', src: 'explosivo' },
    { l: 'EVASIÓN', v: `${Math.round(cs.eva * 100)}%`, c: '#4ec9c7', src: 'agilidad · piernas' },
    { l: 'VIGOR', v: `+${cs.vigor}`, c: '#9be37a', src: 'piernas · core' },
  ];
  const cb = cs.classBoost;
  const cbParts = [cb.atk && `+${cb.atk}% ATK`, cb.hp && `+${cb.hp}% HP`, cb.def && `+${cb.def}% DEF`, cb.eva && `+${cb.eva}% EVA`, cb.crit && `+${cb.crit}% CRÍT`, cb.critDmg && `+${cb.critDmg}% D.CRÍT`, cb.vigor && `+${cb.vigor}% VIGOR`].filter(Boolean);
  const tr = cs.tree;
  const trParts = [tr.atk && `+${tr.atk} ATK`, tr.hp && `+${tr.hp} HP`, tr.def && `+${tr.def} DEF`, tr.eva && `+${tr.eva}% EVA`, tr.crit && `+${tr.crit}% crít`, tr.critDmg && `+${tr.critDmg} daño crít`, tr.vigor && `+${tr.vigor} Vigor`].filter(Boolean);
  const list = mode === 'real' ? L.REAL_ENEMIES : L.FANTASY_ENEMIES;
  const tierIds = mode === 'real' ? L.REAL_TIERS : L.FANTASY_TIERS;

  return (
    <View>
      <Panel>
        <Row gap={10} style={{ marginBottom: 10 }}><View style={st.iconBox}><Icon name="Swords" size={20} color={FG.red} /></View><H size={22}>TUS STATS DE COMBATE</H></Row>
        <View style={st.grid}>
          {stats.map((x) => (
            <View key={x.l} style={[st.stat, { borderColor: x.c + '33' }]}>
              <Label size={9.5}>{x.l}</Label>
              <H size={24} color={x.c}>{x.v}</H>
              <P size={10} color={FG.dim}>{x.src}</P>
            </View>
          ))}
          <View style={[st.stat, { borderColor: FG.gold + '55', backgroundColor: '#1d190f' }]}>
            <Label size={9.5} color={FG.gold}>PODER</Label>
            <H size={24} color={FG.gold}>{cs.power}</H>
            <P size={10} color={FG.dim}>abre enemigos · músculo {dec(cs.avg)}</P>
          </View>
        </View>
        <P size={12} style={{ marginTop: 10 }}>Cada stat sube con los músculos que indica. <Text style={{ color: FG.white }}>DEFENSA</Text> resta daño, <Text style={{ color: FG.white }}>EVASIÓN</Text> esquiva golpes, <Text style={{ color: FG.white }}>DAÑO CRÍT</Text> multiplica tus críticos y <Text style={{ color: FG.white }}>VIGOR</Text> te cura cada ronda. Entrena variado para no quedar cojo.</P>
        <View style={st.note}><P size={12.5} color={FG.text} bold>⭐ Experiencia · nivel {cs.exp.lvl} (permanente, no decae)</P><P size={12}>Tu trayectoria te da una base fija: +{cs.exp.atk} ATK · +{cs.exp.hp} HP · +{cs.exp.def} DEF. Quien lleva semanas siempre pega más que quien lleva 2 días, aunque descanse.</P></View>
        {cs.cond.hp > 0 && <View style={st.note}><P size={12.5} color={FG.text} bold>❤️ Condición de hoy · +{cs.cond.hp} HP{cs.cond.vigor ? ` · +${cs.cond.vigor} Vigor` : ''}</P><P size={12}>≈{cs.cond.pct}% de tu HP{cs.cond.active.length ? `, por tus hábitos (${cs.cond.active.join(', ')})` : ''}{cs.cond.streakPct > 0 ? ` y racha (+${cs.cond.streakPct}%)` : ''}. Dormir y moverte te dan más vida para pelear (tope 25%).</P></View>}
        {cb.list.length > 0 && <View style={st.note}><P size={12.5} color={FG.text} bold>{cb.list.map((c: any) => `${c.emoji} ${c.name}`).join(' + ')}</P><P size={12}>{cbParts.join(' · ')}</P></View>}
        {cs.records && (cs.records.atk > 0 || cs.records.hp > 0) && <View style={st.note}><P size={12.5} color={FG.text} bold>🏆 Récords y logros</P><P size={12}>+{cs.records.atk} ATK · +{cs.records.hp} HP · +{cs.records.def} DEF ({cs.records.titles} título{cs.records.titles === 1 ? '' : 's'} · tus mejores series)</P></View>}
        {tr.mastered > 0 && <View style={st.note}><P size={12.5} color={FG.text} bold>🌳 Bono del árbol · {tr.mastered} habilidad{tr.mastered === 1 ? '' : 'es'} dominada{tr.mastered === 1 ? '' : 's'}</P><P size={12}>{trParts.join(' · ')}</P></View>}
      </Panel>

      <Panel>
        <Row style={{ marginBottom: 8 }}>
          <Icon name="Zap" size={16} color={FG.gold} />
          <H size={22} style={{ flex: 1 }}>TUS PARÁMETROS</H>
          <Label size={10.5}>{(S.classes || []).length ? 'con el bono de tus clases' : 'sin clase'}</Label>
        </Row>
        <AthleticBars data={A.athleticParams(S)} color={X.classById((S.classes || [])[0] ?? '')?.color ?? FG.red} />
        <P size={11.5} color={FG.dim} style={{ marginTop: 8 }}>Salen de lo que entrenas de verdad (series de Forge y pasos del reloj). El detalle está en PERSONAJE.</P>
      </Panel>

      <P size={12.5} style={{ marginBottom: 12 }}>Tu fuerza sale de tus músculos: entrena y subirás de nivel para pegar más fuerte. Domina habilidades del árbol para desbloquear <Text style={{ color: FG.white }}>ataques especiales</Text>. {cs.specials.length === 0 ? 'Aún no tienes especiales: domina habilidades como Muscle-Up o un mortal.' : ''}</P>

      <Row style={{ marginBottom: 8 }}><Icon name="Skull" size={16} color={FG.pink} /><H size={22} style={{ flex: 1 }}>ENEMIGOS</H><Label size={10.5}>peleas rápidas · 1 combate</Label></Row>
      <Row gap={6} style={{ marginBottom: 6 }}>
        <Chip label="🌎 REAL" on={mode === 'real'} color={FG.pink} onPress={() => setMode('real')} />
        <Chip label="🐉 FANTASÍA" on={mode === 'fantasia'} color={FG.purple} onPress={() => setMode('fantasia')} />
      </Row>
      <P size={12} style={{ marginBottom: 10 }}>{mode === 'real' ? 'Stats según masa, mordida y biomecánica reales. Hasta el perro grande son ganables entrenando. De ahí en adelante, un humano desarmado no debería ganar — y la app no te miente.' : 'Modo fantasía: aquí sí puedes darte el lujo de tumbar a un dragón. Hazte fuerte y todos caen.'}</P>
      {tierIds.map((tid: string) => {
        const t = L.ENEMY_TIERS[tid];
        const items = list.filter((e: any) => e.tier === tid);
        if (!items.length) return null;
        return (
          <View key={tid} style={{ marginBottom: 14 }}>
            <Row gap={7} style={{ marginBottom: 7, flexWrap: 'wrap' }}><View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: t.color }} /><Label size={12} color={t.color}>{t.label}</Label><P size={11} color={FG.dim}>{t.desc}</P></Row>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }} nestedScrollEnabled>
              {items.map((en: any) => {
                const tough = cs.power < en.need;
                const imp = en.impossible;
                const ring = imp ? FG.red : tough ? FG.orange : t.color;
                return (
                  <View key={en.id} style={[st.enemy, { borderColor: ring + '88' }]}>
                    <Text style={{ fontSize: 34, textAlign: 'center' }}>{en.emoji}</Text>
                    <H size={20} style={{ textAlign: 'center' }}>{en.name}</H>
                    <Row gap={8} style={{ justifyContent: 'center' }}><P size={12} color={FG.pink}>ATK {en.atk}</P><P size={12} color={FG.green}>HP {en.hp}</P></Row>
                    <P size={11} color={imp ? '#ff8a94' : FG.dim} style={{ textAlign: 'center' }}>{en.note}</P>
                    <Label size={10} color={ring} style={{ textAlign: 'center', marginVertical: 4 }}>{imp ? '⚠ LETAL' : tough ? `te superan · poder ${en.need}` : 'a tu alcance'}</Label>
                    <TouchableOpacity onPress={() => setFight(C.startEnemy(S, en))} style={[st.fightBtn, { backgroundColor: imp || tough ? ring + '1f' : ring, borderColor: ring }]}>
                      <Text style={{ fontFamily: FONT.bodyBold, color: imp || tough ? ring : '#0e0c12', fontSize: 13 }}>PELEAR</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        );
      })}

      <Row style={{ marginBottom: 8 }}><Icon name="Crown" size={16} color={FG.gold} /><H size={22} style={{ flex: 1 }}>MAZMORRAS</H><Label size={10.5}>varios enemigos seguidos + jefe</Label></Row>
      <View style={{ gap: 8 }}>
        {L.DUNGEONS.map((dg: any) => {
          const locked = cs.power < dg.need;
          const cleared = (S.dungeons || {})[dg.id];
          return (
            <View key={dg.id} style={[st.dungeon, { borderColor: (cleared ? FG.gold : dg.color) + '44' }]}>
              <View style={st.iconBox}>{locked ? <Icon name="Lock" size={20} color={FG.dim} /> : cleared ? <Icon name="Crown" size={22} color={FG.gold} /> : <Icon name="Skull" size={22} color={dg.color} />}</View>
              <View style={{ flex: 1 }}>
                <H size={21}>{dg.name}</H>
                <P size={12}>{dg.monsters.length} enemigos · {locked ? `requiere poder ${dg.need} (tienes ${cs.power})` : cleared ? 'Conquistada ✓' : 'Disponible'}</P>
              </View>
              {!locked && <Btn title={cleared ? 'Repetir' : 'Entrar'} small kind={cleared ? 'ghost' : 'primary'} onPress={() => { const f = C.startDungeon(S, dg.id); if (f) setFight(f); }} />}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  iconBox: { width: 44, height: 44, borderRadius: 11, backgroundColor: FG.line, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '31%', flexGrow: 1, backgroundColor: FG.panel2, borderWidth: 1, borderRadius: 10, padding: 8 },
  note: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: FG.panel2, borderWidth: 1, borderColor: FG.line2 },
  enemy: { width: 150, minHeight: 236, justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, padding: 10, backgroundColor: FG.panel, gap: 2 },
  fightBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 7, alignItems: 'center', marginTop: 4 },
  dungeon: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, backgroundColor: FG.panel },
  result: { alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, backgroundColor: FG.panel },
  special: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, backgroundColor: '#241f12' },
});
