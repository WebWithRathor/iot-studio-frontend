import type { DataType, Variable, Widget, WidgetConfig, WidgetLayout, WidgetType } from '../types/models';
import { uid } from '../utils';

/**
 * Widget registry. Adding a widget = one definition here + one renderer in
 * `renderers.tsx`. The editor, library, properties panel and binding panel
 * are all driven by these definitions — no per-widget code paths elsewhere.
 */

export type WidgetCategory = 'controls' | 'displays' | 'charts' | 'other';
/** write = publishes commands, read = shows device data, none = no data source. */
export type WidgetIO = 'write' | 'read' | 'none';

export interface FieldDef {
  key: keyof WidgetConfig;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'select' | 'boolean';
  options?: { value: string; label: string }[];
  help?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  optional?: boolean;
}

export interface WidgetDefinition {
  type: WidgetType;
  name: string;
  description: string;
  category: WidgetCategory;
  icon: string;
  io: WidgetIO;
  accepts: DataType[];
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  defaultConfig: Partial<WidgetConfig>;
  fields: FieldDef[];
  /** Plain-language description of what the binding does. */
  bindingHint: string;
}

const NUMERIC: DataType[] = ['integer', 'float'];
const ALL: DataType[] = ['boolean', 'integer', 'float', 'string', 'color', 'json'];

const rangeFields: FieldDef[] = [
  { key: 'min', label: 'Minimum', kind: 'number' },
  { key: 'max', label: 'Maximum', kind: 'number' },
];
const unitPrecision: FieldDef[] = [
  { key: 'unit', label: 'Unit', kind: 'text', placeholder: 'e.g. °C, %, PWM', optional: true },
  { key: 'precision', label: 'Decimal places', kind: 'number', min: 0, max: 6, step: 1 },
];
const windowField: FieldDef = {
  key: 'timeWindow',
  label: 'Time window',
  kind: 'select',
  options: [
    { value: '30', label: 'Last 30 seconds' },
    { value: '60', label: 'Last 1 minute' },
    { value: '300', label: 'Last 5 minutes' },
    { value: '900', label: 'Last 15 minutes' },
  ],
};

export const WIDGETS: WidgetDefinition[] = [
  /* ---------------------------------------------------------- controls */
  {
    type: 'button', name: 'Button', category: 'controls', icon: 'LuMousePointerClick',
    description: 'Sends one command each time it is pressed.',
    io: 'write', accepts: ['boolean', 'integer', 'string'],
    defaultSize: { w: 3, h: 3 }, minSize: { w: 2, h: 2 },
    defaultConfig: { title: 'Button', label: 'PRESS', pressValue: 'true' },
    fields: [
      { key: 'label', label: 'Button text', kind: 'text' },
      { key: 'pressValue', label: 'Value sent on press', kind: 'text', help: 'Converted to the variable’s data type before sending.' },
    ],
    bindingHint: 'Publishes a command to the device each time it is pressed.',
  },
  {
    type: 'toggle', name: 'Toggle switch', category: 'controls', icon: 'LuToggleRight',
    description: 'On/off control that also shows the reported state.',
    io: 'write', accepts: ['boolean', 'integer'],
    defaultSize: { w: 3, h: 3 }, minSize: { w: 2, h: 2 },
    defaultConfig: { title: 'Toggle', onLabel: 'ON', offLabel: 'OFF', onValue: 'true', offValue: 'false' },
    fields: [
      { key: 'onLabel', label: 'On label', kind: 'text' },
      { key: 'offLabel', label: 'Off label', kind: 'text' },
      { key: 'onValue', label: 'Value sent for ON', kind: 'text' },
      { key: 'offValue', label: 'Value sent for OFF', kind: 'text' },
    ],
    bindingHint: 'Publishes ON/OFF commands and shows the state the device reports back.',
  },
  {
    type: 'slider', name: 'Slider', category: 'controls', icon: 'LuSlidersHorizontal',
    description: 'Linear control for a value within limits.',
    io: 'write', accepts: NUMERIC,
    defaultSize: { w: 4, h: 3 }, minSize: { w: 3, h: 2 },
    defaultConfig: { title: 'Slider', min: 0, max: 100, step: 1, defaultValue: 0, precision: 0 },
    fields: [...rangeFields, { key: 'step', label: 'Step', kind: 'number', min: 0 }, { key: 'defaultValue', label: 'Default value', kind: 'number', help: 'Shown before the device reports a value.' }, ...unitPrecision],
    bindingHint: 'Publishes the value when you release the handle, then shows the device’s reported value.',
  },
  {
    type: 'arc_slider', name: 'Arc slider', category: 'controls', icon: 'LuRotateCw',
    description: 'Circular drag control, good for brightness or speed.',
    io: 'write', accepts: NUMERIC,
    defaultSize: { w: 3, h: 4 }, minSize: { w: 2, h: 3 },
    defaultConfig: { title: 'Arc slider', min: 0, max: 100, step: 1, precision: 0 },
    fields: [...rangeFields, { key: 'step', label: 'Step', kind: 'number', min: 0 }, ...unitPrecision],
    bindingHint: 'Publishes the value on release. Arrow keys also adjust it.',
  },
  {
    type: 'color_wheel', name: 'Color wheel', category: 'controls', icon: 'LuPalette',
    description: 'Pick an RGB color for LEDs and light strips.',
    io: 'write', accepts: ['color', 'string'],
    defaultSize: { w: 3, h: 5 }, minSize: { w: 3, h: 4 },
    defaultConfig: { title: 'Color' },
    fields: [],
    bindingHint: 'Publishes a #RRGGBB color when you release the picker.',
  },
  {
    type: 'rotary', name: 'Rotary knob', category: 'controls', icon: 'LuDisc',
    description: 'Turn a knob to set a numeric value.',
    io: 'write', accepts: NUMERIC,
    defaultSize: { w: 3, h: 4 }, minSize: { w: 2, h: 3 },
    defaultConfig: { title: 'Knob', min: 0, max: 255, step: 1, precision: 0 },
    fields: [...rangeFields, { key: 'step', label: 'Step', kind: 'number', min: 0 }, ...unitPrecision],
    bindingHint: 'Publishes the value on release. Arrow keys also adjust it.',
  },
  {
    type: 'stepper', name: 'Stepper', category: 'controls', icon: 'LuListChecks',
    description: 'Plus/minus buttons for exact values.',
    io: 'write', accepts: NUMERIC,
    defaultSize: { w: 3, h: 2 }, minSize: { w: 2, h: 2 },
    defaultConfig: { title: 'Stepper', min: 0, max: 10, step: 1, defaultValue: 0, precision: 0 },
    fields: [...rangeFields, { key: 'step', label: 'Step', kind: 'number', min: 0 }, { key: 'defaultValue', label: 'Default value', kind: 'number' }, ...unitPrecision],
    bindingHint: 'Publishes the new value on every step.',
  },
  {
    type: 'mode_selector', name: 'Mode selector', category: 'controls', icon: 'LuLayoutList',
    description: 'Pick one of a few modes, e.g. fan Low / Med / High.',
    io: 'write', accepts: ['integer', 'string'],
    defaultSize: { w: 6, h: 2 }, minSize: { w: 3, h: 2 },
    defaultConfig: { title: 'Mode', choices: 'Low=1, Medium=2, High=3' },
    fields: [{ key: 'choices', label: 'Options', kind: 'text', help: 'Comma separated. Use Label=value to send a different value, e.g. Off=0, Eco=1, Boost=2 (up to 8).' }],
    bindingHint: 'Publishes the chosen option’s value and highlights the mode the device reports.',
  },
  {
    type: 'momentary', name: 'Hold button', category: 'controls', icon: 'LuHand',
    description: 'Runs while held, stops on release — motors, horns, jog.',
    io: 'write', accepts: ['boolean', 'integer', 'string'],
    defaultSize: { w: 3, h: 3 }, minSize: { w: 2, h: 2 },
    defaultConfig: { title: 'Hold to run', label: 'HOLD', onLabel: 'RUNNING', offLabel: 'STOPPED', onValue: 'true', offValue: 'false' },
    fields: [
      { key: 'label', label: 'Button text', kind: 'text' },
      { key: 'onValue', label: 'Value sent on press', kind: 'text' },
      { key: 'offValue', label: 'Value sent on release', kind: 'text' },
      { key: 'onLabel', label: 'Text while held', kind: 'text' },
      { key: 'offLabel', label: 'Off label', kind: 'text' },
    ],
    bindingHint: 'Publishes the press value when held and the release value when let go (also if the pointer leaves).',
  },
  /* ---------------------------------------------------------- displays */
  {
    type: 'numeric', name: 'Numeric value', category: 'displays', icon: 'LuHash',
    description: 'Large live number with unit.',
    io: 'read', accepts: [...NUMERIC, 'boolean'],
    defaultSize: { w: 3, h: 2 }, minSize: { w: 2, h: 2 },
    defaultConfig: { title: 'Value', precision: 1, size: 'lg' },
    fields: [...unitPrecision, { key: 'size', label: 'Text size', kind: 'select', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] }],
    bindingHint: 'Subscribes to the device’s telemetry and shows the latest value.',
  },
  {
    type: 'text', name: 'Text display', category: 'displays', icon: 'LuType',
    description: 'Shows a string or status message.',
    io: 'read', accepts: ALL,
    defaultSize: { w: 3, h: 2 }, minSize: { w: 2, h: 1 },
    defaultConfig: { title: 'Text', align: 'left' },
    fields: [{ key: 'align', label: 'Alignment', kind: 'select', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }] }],
    bindingHint: 'Shows the latest value as text.',
  },
  {
    type: 'gauge', name: 'Gauge', category: 'displays', icon: 'LuGauge',
    description: 'Dial showing a value against a range.',
    io: 'read', accepts: NUMERIC,
    defaultSize: { w: 3, h: 4 }, minSize: { w: 2, h: 3 },
    defaultConfig: { title: 'Gauge', min: 0, max: 100, precision: 1 },
    fields: [...rangeFields, ...unitPrecision],
    bindingHint: 'Subscribes to telemetry and plots it on the dial.',
  },
  {
    type: 'progress', name: 'Circular progress', category: 'displays', icon: 'LuCircleDashed',
    description: 'Ring showing a percentage of a range.',
    io: 'read', accepts: NUMERIC,
    defaultSize: { w: 3, h: 4 }, minSize: { w: 2, h: 3 },
    defaultConfig: { title: 'Progress', min: 0, max: 100, precision: 0 },
    fields: [...rangeFields, ...unitPrecision],
    bindingHint: 'Shows the value as a percentage of min–max.',
  },
  {
    type: 'status', name: 'Status indicator', category: 'displays', icon: 'LuCircleDot',
    description: 'LED-style light for on/off or thresholds.',
    io: 'read', accepts: ['boolean', 'integer', 'float', 'string'],
    defaultSize: { w: 3, h: 2 }, minSize: { w: 2, h: 1 },
    defaultConfig: { title: 'Status', onLabel: 'ON', offLabel: 'OFF' },
    fields: [
      { key: 'onLabel', label: 'On / OK label', kind: 'text' },
      { key: 'offLabel', label: 'Off label', kind: 'text' },
      { key: 'thresholdLow', label: 'Warn below', kind: 'number', optional: true, help: 'Numeric variables only.' },
      { key: 'thresholdHigh', label: 'Warn above', kind: 'number', optional: true },
    ],
    bindingHint: 'Lights up from the device’s reported state.',
  },
  {
    type: 'value_card', name: 'Sensor card', category: 'displays', icon: 'LuThermometer',
    description: 'Value with trend sparkline and min/max.',
    io: 'read', accepts: NUMERIC,
    defaultSize: { w: 3, h: 3 }, minSize: { w: 3, h: 2 },
    defaultConfig: { title: 'Sensor', precision: 1 },
    fields: [...unitPrecision],
    bindingHint: 'Subscribes to telemetry and keeps a short trend.',
  },
  {
    type: 'level_bar', name: 'Level bar', category: 'displays', icon: 'LuCylinder',
    description: 'Vertical tank / thermometer level with warning lines.',
    io: 'read', accepts: NUMERIC,
    defaultSize: { w: 2, h: 4 }, minSize: { w: 2, h: 3 },
    defaultConfig: { title: 'Level', min: 0, max: 100, precision: 0, unit: '%' },
    fields: [
      ...rangeFields,
      ...unitPrecision,
      { key: 'thresholdLow', label: 'Warn below', kind: 'number', optional: true },
      { key: 'thresholdHigh', label: 'Warn above', kind: 'number', optional: true },
    ],
    bindingHint: 'Fills to the latest reading; turns amber outside the warning lines.',
  },
  /* ------------------------------------------------------------ charts */
  {
    type: 'line_chart', name: 'Line chart', category: 'charts', icon: 'LuChartLine',
    description: 'Time-series of a telemetry variable.',
    io: 'read', accepts: NUMERIC,
    defaultSize: { w: 6, h: 5 }, minSize: { w: 4, h: 3 },
    defaultConfig: { title: 'History', timeWindow: 60, precision: 1 },
    fields: [windowField, { key: 'min', label: 'Y min', kind: 'number', optional: true, help: 'Leave empty to auto-scale.' }, { key: 'max', label: 'Y max', kind: 'number', optional: true }, ...unitPrecision],
    bindingHint: 'Plots incoming telemetry samples over time.',
  },
  {
    type: 'area_chart', name: 'Area chart', category: 'charts', icon: 'LuChartArea',
    description: 'Filled time-series, good for levels.',
    io: 'read', accepts: NUMERIC,
    defaultSize: { w: 6, h: 5 }, minSize: { w: 4, h: 3 },
    defaultConfig: { title: 'Level history', timeWindow: 300, precision: 1 },
    fields: [windowField, { key: 'min', label: 'Y min', kind: 'number', optional: true }, { key: 'max', label: 'Y max', kind: 'number', optional: true }, ...unitPrecision],
    bindingHint: 'Plots incoming telemetry samples over time.',
  },
  {
    type: 'bar_chart', name: 'Bar chart', category: 'charts', icon: 'LuChartColumn',
    description: 'Most recent readings as bars.',
    io: 'read', accepts: NUMERIC,
    defaultSize: { w: 6, h: 4 }, minSize: { w: 3, h: 3 },
    defaultConfig: { title: 'Recent readings', samples: 16, precision: 0 },
    fields: [{ key: 'samples', label: 'Number of bars', kind: 'number', min: 4, max: 60, step: 1 }, ...unitPrecision],
    bindingHint: 'Shows the last N readings of the variable.',
  },
  /* ------------------------------------------------------------- other */
  {
    type: 'table', name: 'Data table', category: 'other', icon: 'LuTable',
    description: 'Recent readings or project messages.',
    io: 'read', accepts: ALL,
    defaultSize: { w: 6, h: 4 }, minSize: { w: 3, h: 3 },
    defaultConfig: { title: 'Recent data', source: 'variable', samples: 12, precision: 2 },
    fields: [
      { key: 'source', label: 'Rows from', kind: 'select', options: [{ value: 'variable', label: 'Bound variable readings' }, { value: 'messages', label: 'All project MQTT messages' }] },
      { key: 'samples', label: 'Rows', kind: 'number', min: 3, max: 50, step: 1 },
      { key: 'precision', label: 'Decimal places', kind: 'number', min: 0, max: 6, step: 1 },
    ],
    bindingHint: 'Lists the latest samples of the bound variable.',
  },
  {
    type: 'label', name: 'Label', category: 'other', icon: 'LuHeading',
    description: 'Static heading or instructions.',
    io: 'none', accepts: [],
    defaultSize: { w: 4, h: 1 }, minSize: { w: 1, h: 1 },
    defaultConfig: { title: 'Label', text: 'Section heading', size: 'md', align: 'left', showHeader: false },
    fields: [
      { key: 'text', label: 'Text', kind: 'textarea' },
      { key: 'size', label: 'Size', kind: 'select', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large heading' }] },
      { key: 'align', label: 'Alignment', kind: 'select', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }] },
    ],
    bindingHint: '',
  },
  {
    type: 'divider', name: 'Divider', category: 'other', icon: 'LuSeparatorHorizontal',
    description: 'Separates groups of widgets.',
    io: 'none', accepts: [],
    defaultSize: { w: 12, h: 1 }, minSize: { w: 1, h: 1 },
    defaultConfig: { title: 'Divider', label: '', showHeader: false },
    fields: [{ key: 'label', label: 'Caption', kind: 'text', optional: true }],
    bindingHint: '',
  },
  {
    type: 'device_status', name: 'Device status', category: 'other', icon: 'LuCpu',
    description: 'Connection state, last seen and uptime.',
    io: 'none', accepts: [],
    defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 3 },
    defaultConfig: { title: 'Device' },
    fields: [],
    bindingHint: '',
  },
  {
    type: 'event_log', name: 'Event log', category: 'other', icon: 'LuScrollText',
    description: 'This project’s recent activity.',
    io: 'none', accepts: [],
    defaultSize: { w: 4, h: 5 }, minSize: { w: 3, h: 3 },
    defaultConfig: { title: 'Event log', samples: 20 },
    fields: [{ key: 'samples', label: 'Events shown', kind: 'number', min: 5, max: 50, step: 1 }],
    bindingHint: '',
  },
];

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  controls: 'Controls',
  displays: 'Displays',
  charts: 'Charts',
  other: 'Other',
};

const BY_TYPE = new Map(WIDGETS.map((d) => [d.type, d]));
export const getWidgetDef = (type: WidgetType): WidgetDefinition => BY_TYPE.get(type) ?? WIDGETS[0];

export function makeWidget(type: WidgetType, layout: Partial<WidgetLayout> = {}, config: Partial<WidgetConfig> = {}, variableId?: string): Widget {
  const def = getWidgetDef(type);
  return {
    id: uid('wgt'),
    type,
    layout: { x: 0, y: 0, w: def.defaultSize.w, h: def.defaultSize.h, ...layout },
    config: { showHeader: true, visible: true, ...def.defaultConfig, ...config } as WidgetConfig,
    binding: variableId ? { variableId } : null,
  };
}

/* ------------------------------------------------------- compatibility */

export interface Compat {
  level: 'ok' | 'warn' | 'error';
  reason?: string;
}

const TYPE_LABEL: Record<DataType, string> = {
  boolean: 'boolean', integer: 'integer', float: 'float', string: 'string', color: 'color', json: 'JSON',
};

export function checkCompatibility(def: WidgetDefinition, v: Variable): Compat {
  if (def.io === 'none') return { level: 'error', reason: 'This component has no data source.' };
  if (!def.accepts.includes(v.dataType)) {
    return { level: 'error', reason: `${def.name} needs ${def.accepts.map((t) => TYPE_LABEL[t]).join(' / ')}; this is ${TYPE_LABEL[v.dataType]}.` };
  }
  if (def.io === 'write' && v.direction === 'telemetry') {
    return { level: 'error', reason: 'This value only comes from the board. Pick one declared “IoT Studio → board” or “Both ways”.' };
  }
  if (def.io === 'write' && !v.commandTopic) {
    return { level: 'error', reason: 'No command topic set on this variable.' };
  }
  if (def.io === 'read' && v.direction === 'command') {
    return { level: 'warn', reason: 'Shows the last value a dashboard sent, not a reading from the board.' };
  }
  return { level: 'ok' };
}

export const dataTypeLabel = (t: DataType) => TYPE_LABEL[t];
