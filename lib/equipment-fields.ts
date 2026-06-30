// Definições centralizadas dos campos extras de Equipamento (Filtros, Componentes, Dimensões)
// Reutilizado pelo formulário (criação/edição), API e tela de detalhes.

export type FieldDef = { key: string; label: string };
export type SectionDef = { title: string; fields: FieldDef[] };

export const FILTER_FIELDS: FieldDef[] = [
  { key: "airFilter1", label: "Filtro de Ar 1" },
  { key: "airFilter2", label: "Filtro de Ar 2" },
  { key: "fuelFilter1", label: "Filtro de Combustível 1" },
  { key: "fuelFilter2", label: "Filtro de Combustível 2" },
  { key: "fuelFilter3", label: "Filtro de Combustível 3" },
  { key: "fuelFilter4", label: "Filtro de Combustível 4" },
  { key: "lubeFilter1", label: "Filtro de Lubrificante 1" },
  { key: "lubeFilter2", label: "Filtro de Lubrificante 2" },
  { key: "lubeFilter3", label: "Filtro de Lubrificante 3" },
  { key: "lubeFilter4", label: "Filtro de Lubrificante 4" },
  { key: "waterFilter", label: "Filtro de Água" },
];

export const COMPONENT_FIELDS: FieldDef[] = [
  { key: "controller", label: "Controlador" },
  { key: "tank", label: "Tanque" },
  { key: "crankcase", label: "Cárter" },
  { key: "battery", label: "Bateria" },
  { key: "belt1", label: "Correia 1" },
  { key: "belt2", label: "Correia 2" },
  { key: "belt3", label: "Correia 3" },
  { key: "belt4", label: "Correia 4" },
];

export const DIMENSION_FIELDS: FieldDef[] = [
  { key: "height", label: "Altura" },
  { key: "width", label: "Largura" },
  { key: "depth", label: "Profundidade" },
];

export const EQUIPMENT_SECTIONS: SectionDef[] = [
  { title: "Filtros", fields: FILTER_FIELDS },
  { title: "Componentes", fields: COMPONENT_FIELDS },
  { title: "Dimensões", fields: DIMENSION_FIELDS },
];

// Todas as chaves dos campos extras (String opcionais)
export const EXTRA_FIELD_KEYS: string[] = [
  ...FILTER_FIELDS,
  ...COMPONENT_FIELDS,
  ...DIMENSION_FIELDS,
].map((f) => f.key);
