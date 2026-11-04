// Inventario → Botiquín: el perfil médico (remedios, condiciones, alergias, exámenes e historial), en una sola fuente: el
// perfil del servidor. Se lee lo último que llegó y se actualiza cuando cambia (Perfil, el chat o el propio Botiquín).
import { useEffect, useState } from 'react';
import { wsManager } from '../../services/WebSocketManager';

export interface Remedio { id: string; name: string; dose?: string; schedule?: string; active: boolean }
export interface Examen { test: string; value: number; unit: string; date?: string }
export type TipoEvento = 'consulta' | 'examen' | 'vacuna' | 'procedimiento' | 'urgencia' | 'evento';
export interface EventoMedico { id: string; date: string; type: TipoEvento; title: string; note?: string }
export interface PerfilMedico {
  conditions?: Array<{ id: string; diagnosedDate?: string; notes?: string }>;
  medications?: Remedio[];
  bloodType?: string;
  allergies?: string;
  labs?: Examen[];
  history?: EventoMedico[];
}

// Lo último que se sabe del perfil, aunque el Botiquín no esté abierto: si cambias un remedio en Perfil y después abres el
// Botiquín, ya está (el 'connected' del inicio quedaba viejo)
let ultimo: PerfilMedico | null | undefined;
const oyentes = new Set<(m: PerfilMedico | null) => void>();
let instalado = false;
function instalar() {
  if (instalado) return;
  instalado = true;
  wsManager.subscribeMessage((d: any) => {
    const m = (d?.type === 'connected' || d?.type === 'about_me') && d.userProfile ? d.userProfile.medical ?? null
      : d?.type === 'profile_saved' && d.profile ? d.profile.medical ?? null : undefined;
    if (m === undefined) return;
    ultimo = m;
    oyentes.forEach((f) => { try { f(m); } catch {} });
  });
}
instalar();

export function usePerfilMedico(): PerfilMedico | null {
  const [med, setMed] = useState<PerfilMedico | null>(() => (ultimo !== undefined ? ultimo : wsManager.getLastConnectedPayload?.()?.userProfile?.medical ?? null));
  useEffect(() => { oyentes.add(setMed); return () => { oyentes.delete(setMed); }; }, []);
  return med;
}

/** Anotar o borrar un evento del historial médico (lo guarda el servidor, en el perfil cifrado). */
export function historiaMedica(op: { add?: Omit<EventoMedico, 'id'>; borrar?: string }): Promise<{ ok: boolean; msg: string }> {
  if (wsManager.getStatus() !== 'connected') return Promise.resolve({ ok: false, msg: 'Sin conexión con el servidor de Eris: inténtalo de nuevo con internet' });
  return new Promise((resolve) => {
    const requestId = `mh_${Date.now()}`;
    const timer = setTimeout(() => { unsub(); resolve({ ok: false, msg: 'El servidor no respondió' }); }, 8000);
    const unsub = wsManager.subscribeMessage((d: any) => {
      if (d?.type !== 'medical_history_saved' || d.requestId !== requestId) return;
      clearTimeout(timer); unsub();
      resolve(d.ok ? { ok: true, msg: op.add ? 'Anotado en tu historial' : 'Borrado del historial' } : { ok: false, msg: d.msg || 'No se pudo guardar' });
    });
    wsManager.sendMessage(op.add ? { type: 'medical_history_add', requestId, entry: op.add } : { type: 'medical_history_delete', requestId, id: op.borrar });
  });
}

export const CONDICION: Record<string, string> = {
  diabetes_t1: 'Diabetes tipo 1', diabetes_t2: 'Diabetes tipo 2', prediabetes: 'Prediabetes', hypertension: 'Hipertensión', hypotension: 'Hipotensión',
  hypothyroidism: 'Hipotiroidismo', hyperthyroidism: 'Hipertiroidismo', obesity: 'Obesidad', dyslipidemia: 'Dislipidemia', asthma: 'Asma', copd: 'EPOC',
  ckd: 'Enfermedad renal crónica', heart_failure: 'Insuficiencia cardíaca', celiac: 'Celiaquía', ibs: 'Colon irritable', depression: 'Depresión',
  anxiety: 'Ansiedad', other: 'Otra',
};
export const EXAMEN: Record<string, string> = {
  hba1c: 'HbA1c', glucosa_ayunas: 'Glucosa en ayunas', colesterol_total: 'Colesterol total', ldl: 'LDL', hdl: 'HDL', trigliceridos: 'Triglicéridos', creatinina: 'Creatinina',
};
export const EVENTO: Record<TipoEvento, { label: string; icon: string }> = {
  consulta: { label: 'Consulta', icon: '🩺' }, examen: { label: 'Examen', icon: '🧪' }, vacuna: { label: 'Vacuna', icon: '💉' },
  procedimiento: { label: 'Procedimiento', icon: '🏥' }, urgencia: { label: 'Urgencia', icon: '🚑' }, evento: { label: 'Otro', icon: '📝' },
};
