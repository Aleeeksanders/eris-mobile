export interface ModuleConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: 'available' | 'coming_soon';
  alwaysOn?: boolean;
}

export const MODULES: ModuleConfig[] = [
  {
    id: 'pulso',
    name: 'Pulso',
    icon: '◎',
    description: 'Dashboard de salud y actividad diaria',
    status: 'available',
    alwaysOn: true,
  },
  {
    id: 'metricas',
    name: 'Métricas',
    icon: '△',
    description: 'Pasos, sueño, frecuencia cardíaca y más',
    status: 'available',
    alwaysOn: true,
  },
  {
    id: 'toji',
    name: 'Forge',
    icon: '🔥',
    description: 'Acondicionamiento físico gamificado · RPG de rendimiento',
    status: 'available',
  },
  {
    id: 'glucosa',
    name: 'Glucosa',
    icon: '◈',
    description: 'Lectura de sensor Libre 2 vía NFC',
    status: 'available',
  },
  {
    id: 'nutri',
    name: 'Nutri',
    icon: '◐',
    description: 'Seguimiento nutricional y registro de comidas',
    status: 'available',
  },
  {
    id: 'finanzas',
    name: 'Finanzas',
    icon: '◇',
    description: 'Gestión inteligente de finanzas personales',
    status: 'available',
  },
  {
    id: 'mente',
    name: 'Mente',
    icon: '◉',
    description: 'Entrenamiento cognitivo y bienestar mental',
    status: 'coming_soon',
  },
];

// Tabs activos por defecto al crear un perfil nuevo
export const DEFAULT_MODULES = ['pulso', 'metricas', 'toji'];
