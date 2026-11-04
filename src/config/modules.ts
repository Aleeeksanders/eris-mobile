export interface ModuleConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: 'available' | 'coming_soon';
  alwaysOn?: boolean;
  /** Solo se puede activar cuando el administrador libera ese módulo (ver config/features.ts). */
  requiresFeature?: 'glucose';
}

export const MODULES: ModuleConfig[] = [
  {
    id: 'pulso',
    name: 'Inicio',
    icon: '◎',
    description: 'Tu día: qué hacer ahora y cómo vas',
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
    description: 'Lectura de sensor de glucosa y alertas',
    status: 'available',
    requiresFeature: 'glucose',
  },
  {
    id: 'nutri',
    name: 'Nutrición',
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
    id: 'inventario',
    name: 'Inventario',
    icon: '▣',
    description: 'Lo que tienes en casa: lo que se vence, lo que se acaba y tu lista de compras',
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
