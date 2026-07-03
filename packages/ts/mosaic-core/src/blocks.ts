// The built-in block vocabulary: the §4.1 catalog, every block declared with
// the same defineBlockSchema primitive a host uses for its own blocks. General
// building blocks only, no domain templates; rich blocks carry a decompose
// recipe so a renderer that cannot draw them renders the primitive expansion
// instead (invariant 8). `defaultBlocks` is the standard collection, ordered
// by kind.

import { type MosaicNode, type PropValue, textNode } from './ast.js';
import { type BlockDefinition, type PropSpec, defineBlockSchema } from './schema.js';

function prop(node: MosaicNode, name: string): PropValue | undefined {
  return node.props?.[name];
}

function asString(v: PropValue | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function altFallback(node: MosaicNode, label: string): MosaicNode {
  const alt = asString(prop(node, 'alt'), `[${label}]`);
  return { type: 'Text', props: { tone: 'subtle' }, children: [textNode(alt)] };
}

/** Rows/columns to a plain table of Text rows (the DataTable floor). */
function tableFallback(node: MosaicNode): MosaicNode {
  const columns = prop(node, 'columns');
  const rows = prop(node, 'rows');
  const children: MosaicNode[] = [];
  if (Array.isArray(columns)) {
    children.push({
      type: 'Text',
      props: { variant: 'label' },
      children: [textNode(columns.map((c) => asString(c as PropValue, String(c))).join(' | '))],
    });
  }
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      children.push({
        type: 'Text',
        children: [textNode(row.map((c) => (typeof c === 'object' ? '' : String(c))).join(' | '))],
      });
    }
  }
  return { type: 'Stack', children };
}

function records(v: PropValue | undefined): Array<Record<string, PropValue>> {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (item): item is Record<string, PropValue> =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  );
}

/** Alt, grouped node lines, then one "a -> b" line per edge (the Diagram floor). */
function diagramFallback(node: MosaicNode): MosaicNode {
  const nodes = records(prop(node, 'nodes'));
  const groups = records(prop(node, 'groups'));
  const edges = records(prop(node, 'edges'));

  const labelOf = new Map<PropValue | undefined, string>();
  for (const g of groups) labelOf.set(g.id, asString(g.label, asString(g.id)));
  for (const n of nodes) labelOf.set(n.id, asString(n.label, asString(n.id)));

  const heading = (text: string): MosaicNode => ({
    type: 'Text',
    props: { variant: 'label' },
    children: [textNode(text)],
  });
  const line = (text: string): MosaicNode => ({ type: 'Text', children: [textNode(text)] });
  const nodeLine = (n: Record<string, PropValue>): MosaicNode => {
    const label = asString(n.label, asString(n.id));
    const kind = asString(n.kind);
    return line(kind ? `- ${label} (${kind})` : `- ${label}`);
  };

  const children: MosaicNode[] = [heading(asString(prop(node, 'alt'), '[diagram]'))];
  for (const g of groups) {
    children.push(heading(asString(g.label, asString(g.id))));
    for (const n of nodes) if (n.group === g.id) children.push(nodeLine(n));
  }
  const groupIds = new Set<PropValue | undefined>(groups.map((g) => g.id));
  const ungrouped = nodes.filter((n) => !groupIds.has(n.group));
  if (ungrouped.length > 0) {
    if (groups.length > 0) children.push(heading('Nodes'));
    for (const n of ungrouped) children.push(nodeLine(n));
  }
  for (const e of edges) {
    const from = labelOf.get(e.from) ?? asString(e.from);
    const to = labelOf.get(e.to) ?? asString(e.to);
    const label = asString(e.label);
    children.push(line(label ? `${from} -> ${to} - ${label}` : `${from} -> ${to}`));
  }
  return { type: 'Stack', children };
}

function itemsFallback(
  node: MosaicNode,
  render: (item: Record<string, PropValue>) => string,
): MosaicNode {
  const items = prop(node, 'items');
  const children: MosaicNode[] = [];
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        children.push({
          type: 'Text',
          children: [textNode(render(item as Record<string, PropValue>))],
        });
      } else {
        children.push({ type: 'Text', children: [textNode(String(item))] });
      }
    }
  }
  return { type: 'Stack', children };
}

const label = { type: 'string', doc: 'Short caption.' } as const satisfies PropSpec;
const tone = {
  type: 'enum',
  doc: 'Semantic color; the host maps it to its palette.',
  values: ['ok', 'warn', 'bad', 'primary', 'subtle'],
} as const satisfies PropSpec;
const optionsProp = { type: 'string[]', doc: 'Choice labels.' } as const satisfies PropSpec;
// Mosaic's icon standard is Lucide (lucide.dev): every icon name is a Lucide
// name in kebab-case ("wallet", "circle-check", "sunrise", "arrow-up-right").
const icon = {
  type: 'string',
  doc: 'A Lucide icon name in kebab-case (lucide.dev), e.g. "wallet", "send", "circle-check".',
} as const satisfies PropSpec;
const alt = {
  type: 'string',
  doc: 'Text description (required, invariant 7).',
  required: true,
} as const satisfies PropSpec;

export const Box = defineBlockSchema({
  name: 'Box',
  kind: 'layout',
  doc: 'A plain grouping container.',
  children: true,
  props: {},
  example: '<Box>\n  <Text>Grouped content</Text>\n</Box>',
});

export const Stack = defineBlockSchema({
  name: 'Stack',
  kind: 'layout',
  doc: 'A vertical (default) or horizontal flow of children, with alignment control.',
  children: true,
  props: {
    direction: { type: 'enum', doc: 'Flow direction.', values: ['vertical', 'horizontal'] },
    align: {
      type: 'enum',
      doc: 'Cross-axis alignment of children.',
      values: ['start', 'center', 'end', 'baseline', 'stretch'],
    },
    justify: {
      type: 'enum',
      doc: 'Main-axis distribution; "between" puts the first child left and the last right (text left, actions right).',
      values: ['start', 'center', 'end', 'between'],
    },
  },
  example:
    '<Stack direction="horizontal" justify="between" align="center">\n  <Text>Pay £340 invoice to Studio Kern</Text>\n  <Stack direction="horizontal">\n    <Button variant="primary">Approve</Button>\n    <Button variant="subtle">Skip</Button>\n  </Stack>\n</Stack>',
});

export const Grid = defineBlockSchema({
  name: 'Grid',
  kind: 'layout',
  doc: 'An equal-column grid; children split the columns.',
  children: true,
  props: {
    cols: { type: 'number', doc: 'Number of columns (children divide these).' },
  },
  example:
    '<Grid cols={3}>\n  <Stat label="A" value="1" />\n  <Stat label="B" value="2" />\n  <Stat label="C" value="3" />\n</Grid>',
});

export const Divider = defineBlockSchema({
  name: 'Divider',
  kind: 'layout',
  doc: 'A horizontal rule.',
  props: {},
  example: '<Divider />',
});

export const Card = defineBlockSchema({
  name: 'Card',
  kind: 'layout',
  doc: 'A bordered content surface; tone tints it into an inset status panel.',
  children: true,
  props: { tone },
  example:
    '<Card tone="ok">\n  <Text variant="label" tone="subtle">Handled while you slept</Text>\n  <Text>Sorted 38 emails, archived 22 newsletters</Text>\n</Card>',
});

export const Text = defineBlockSchema({
  name: 'Text',
  kind: 'content',
  doc: 'A run of text.',
  children: true,
  props: {
    tone,
    variant: {
      type: 'enum',
      doc: 'Semantic role: label is a section micro-label, caption is secondary supporting text. Use Markdown for inline emphasis.',
      values: ['body', 'label', 'caption'],
    },
  },
  example: '<Text variant="label" tone="subtle">Needs a quick yes</Text>',
});

export const Heading = defineBlockSchema({
  name: 'Heading',
  kind: 'content',
  doc: 'A section heading.',
  children: true,
  props: { level: { type: 'number', doc: 'Heading level 1-6.', example: 2 } },
  example: '<Heading level={2}>Overview</Heading>',
});

export const Markdown = defineBlockSchema({
  name: 'Markdown',
  kind: 'content',
  doc: 'A block of Markdown (rendered as prose).',
  children: true,
  props: {},
  example: '<Markdown>**Bold** and _italic_.</Markdown>',
});

export const Image = defineBlockSchema({
  name: 'Image',
  kind: 'content',
  doc: 'An image from a URL.',
  props: {
    src: { type: 'string', doc: 'Image URL.' },
    alt,
  },
  example: '<Image src="https://example.com/chart.png" alt="Revenue trend, up 12%" />',
});

export const Icon = defineBlockSchema({
  name: 'Icon',
  kind: 'content',
  doc: 'A single Lucide icon (lucide.dev). Names are kebab-case.',
  props: {
    name: { ...icon, doc: 'The Lucide icon name, kebab-case.', required: true },
    tone,
  },
  example: '<Icon name="circle-check" tone="ok" />',
});

export const Link = defineBlockSchema({
  name: 'Link',
  kind: 'content',
  doc: 'A hyperlink. The host decides whether it navigates.',
  children: true,
  props: { href: { type: 'string', doc: 'Target URL.', required: true } },
  example: '<Link href="https://example.com">Docs</Link>',
});

export const Badge = defineBlockSchema({
  name: 'Badge',
  kind: 'content',
  doc: 'A small status pill, optionally with a leading icon.',
  children: true,
  props: { tone, icon },
  example: '<Badge tone="ok" icon="circle-check">Active</Badge>',
});

export const Tag = defineBlockSchema({
  name: 'Tag',
  kind: 'content',
  doc: 'A small label pill (alias of Badge).',
  children: true,
  props: { tone, icon },
  example: '<Tag>draft</Tag>',
});

export const Avatar = defineBlockSchema({
  name: 'Avatar',
  kind: 'content',
  doc: 'A circular initials avatar.',
  props: {
    name: { type: 'string', doc: 'Full name; initials are derived.' },
    initials: { type: 'string', doc: 'Explicit initials (overrides name).' },
  },
  example: '<Avatar name="Aster Holdings" />',
});

export const AvatarGroup = defineBlockSchema({
  name: 'AvatarGroup',
  kind: 'content',
  doc: 'A compact row of overlapping avatars.',
  children: true,
  props: {},
  example:
    '<AvatarGroup>\n  <Avatar name="Ada Lovelace" />\n  <Avatar name="Grace Hopper" />\n</AvatarGroup>',
});

export const Code = defineBlockSchema({
  name: 'Code',
  kind: 'content',
  doc: 'Inline or block code.',
  children: true,
  props: { language: { type: 'string', doc: 'Language hint for highlighting.' } },
  example: '<Code language="ts">const x = 1</Code>',
});

export const Callout = defineBlockSchema({
  name: 'Callout',
  kind: 'content',
  doc: 'A highlighted note.',
  children: true,
  props: {
    tone,
    icon: { ...icon, doc: 'Override the default tone icon with a Lucide name.' },
  },
  example: '<Callout tone="warn">Above 100 seats, Enterprise wins.</Callout>',
});

export const Button = defineBlockSchema({
  name: 'Button',
  kind: 'control',
  doc: 'A button; onClick hands the host an intent.',
  children: true,
  props: {
    variant: {
      type: 'enum',
      doc: 'Intent hierarchy: one primary per view, subtle for inline row actions, danger for destructive.',
      values: ['primary', 'secondary', 'subtle', 'danger'],
    },
    icon,
  },
  example:
    '<Stack direction="horizontal">\n  <Button variant="primary" onClick={bookCar({ eta: "21:15" })}>Book it</Button>\n  <Button variant="subtle" onClick={dismiss}>No thanks</Button>\n</Stack>',
});

export const Input = defineBlockSchema({
  name: 'Input',
  kind: 'control',
  doc: 'A single-line text input.',
  props: {
    label,
    placeholder: { type: 'string', doc: 'Placeholder text.' },
    value: { type: 'string', doc: 'Initial value; value={path} two-way binds state.' },
  },
  example: '<Input label="Name" value={name} />',
});

export const Select = defineBlockSchema({
  name: 'Select',
  kind: 'control',
  doc: 'A single-choice dropdown.',
  props: { label, options: optionsProp },
  example: '<Select label="Owner" options={["all", "dana"]} value={owner} />',
});

export const MultiSelect = defineBlockSchema({
  name: 'MultiSelect',
  kind: 'control',
  doc: 'A multi-choice control (chips).',
  props: { label, options: optionsProp },
  example: '<MultiSelect label="Tags" options={["a", "b"]} value={tags} />',
});

export const Autocomplete = defineBlockSchema({
  name: 'Autocomplete',
  kind: 'control',
  doc: 'A single-choice input with type-ahead.',
  props: { label, options: optionsProp },
  example: '<Autocomplete label="City" options={["SG", "ID"]} value={city} />',
});

export const Checkbox = defineBlockSchema({
  name: 'Checkbox',
  kind: 'control',
  doc: 'A single checkbox.',
  props: { label },
  example: '<Checkbox label="Bill annually" checked={annual} />',
});

export const Radio = defineBlockSchema({
  name: 'Radio',
  kind: 'control',
  doc: 'A radio-group choice.',
  props: { label, options: optionsProp },
  example: '<Radio label="Plan" options={["free", "pro"]} value={plan} />',
});

export const Toggle = defineBlockSchema({
  name: 'Toggle',
  kind: 'control',
  doc: 'An on/off switch.',
  props: { label },
  example: '<Toggle label="Enabled" checked={on} />',
});

export const Slider = defineBlockSchema({
  name: 'Slider',
  kind: 'control',
  doc: 'A numeric range slider.',
  props: {
    label,
    min: { type: 'number', doc: 'Minimum value.' },
    max: { type: 'number', doc: 'Maximum value.' },
    step: { type: 'number', doc: 'Increment.' },
  },
  example: '<Slider label="Seats" min={1} max={200} value={seats} />',
});

export const DatePicker = defineBlockSchema({
  name: 'DatePicker',
  kind: 'control',
  doc: 'A date input.',
  props: { label },
  example: '<DatePicker label="Start" value={start} />',
});

export const ColorPicker = defineBlockSchema({
  name: 'ColorPicker',
  kind: 'control',
  doc: 'A color input.',
  props: { label },
  example: '<ColorPicker label="Accent" value={accent} />',
});

export const FilePicker = defineBlockSchema({
  name: 'FilePicker',
  kind: 'control',
  doc: 'A file selection control; the host handles the actual file.',
  props: { label },
  example: '<FilePicker label="Attachment" />',
});

export const Rating = defineBlockSchema({
  name: 'Rating',
  kind: 'control',
  doc: 'A star-rating control.',
  props: {
    label,
    max: { type: 'number', doc: 'Number of steps (default 5).' },
  },
  example: '<Rating label="Quality" max={5} value={stars} />',
});

export const TagInput = defineBlockSchema({
  name: 'TagInput',
  kind: 'control',
  doc: 'A free-form tag entry.',
  props: { label },
  example: '<TagInput label="Labels" value={labels} />',
});

export const Field = defineBlockSchema({
  name: 'Field',
  kind: 'control',
  doc: 'A labeled wrapper around one control.',
  children: true,
  props: { label },
  example: '<Field label="Seats">\n  <Slider value={seats} min={1} max={200} />\n</Field>',
});

export const Disclosure = defineBlockSchema({
  name: 'Disclosure',
  kind: 'control',
  doc: 'A collapsible section with a summary label.',
  children: true,
  props: { label },
  example: '<Disclosure label="Details">\n  <Text>Hidden until opened</Text>\n</Disclosure>',
});

export const Accordion = defineBlockSchema({
  name: 'Accordion',
  kind: 'control',
  doc: 'A stack of collapsible sections; one child panel per item.',
  children: true,
  props: {
    items: { type: 'string[]', doc: 'Section labels (one child panel per label).', required: true },
  },
  example:
    '<Accordion items={["Setup", "Usage"]}>\n  <Text>Setup panel</Text>\n  <Text>Usage panel</Text>\n</Accordion>',
});

export const Tabs = defineBlockSchema({
  name: 'Tabs',
  kind: 'structure',
  doc: 'A tab bar; one child panel per item, switched by the active tab.',
  children: true,
  props: {
    items: { type: 'string[]', doc: 'Tab labels (one child panel per label).', required: true },
    active: { type: 'string', doc: 'Default active label or index.' },
  },
  example:
    '<Tabs items={["Overview", "Docs"]} active="Overview">\n  <Text>Overview panel</Text>\n  <Text>Docs panel</Text>\n</Tabs>',
});

export const Steps = defineBlockSchema({
  name: 'Steps',
  kind: 'structure',
  doc: 'A horizontal step indicator.',
  props: {
    items: { type: 'string[]', doc: 'Step labels.', required: true },
    current: { type: 'number', doc: 'Index of the current step.' },
  },
  example: '<Steps items={["Plan", "Build", "Ship"]} current={1} />',
});

export const SegmentedControl = defineBlockSchema({
  name: 'SegmentedControl',
  kind: 'structure',
  doc: 'A single-choice segmented switch.',
  props: { options: { ...optionsProp, required: true } },
  example: '<SegmentedControl options={["SaaS", "Bank"]} value={audience} />',
});

export const Progress = defineBlockSchema({
  name: 'Progress',
  kind: 'structure',
  doc: 'A progress bar (0-100).',
  props: {
    value: { type: 'number', doc: 'Percent complete, 0-100.', required: true },
    label,
  },
  example: '<Progress value={78} label="Risk score" />',
});

export const Empty = defineBlockSchema({
  name: 'Empty',
  kind: 'structure',
  doc: 'An empty-state placeholder.',
  children: true,
  props: { label },
  example: '<Empty label="No results" />',
});

export const Video = defineBlockSchema({
  name: 'Video',
  kind: 'media',
  doc: 'A video from a URL.',
  props: {
    src: { type: 'string', doc: 'Video URL.' },
    alt,
  },
  example: '<Video src="https://example.com/demo.mp4" alt="Product walkthrough" />',
});

export const Audio = defineBlockSchema({
  name: 'Audio',
  kind: 'media',
  doc: 'An audio clip from a URL.',
  props: {
    src: { type: 'string', doc: 'Audio URL.' },
    alt: { type: 'string', doc: 'Text description.' },
  },
  example: '<Audio src="https://example.com/note.mp3" alt="Voice note" />',
});

export const Carousel = defineBlockSchema({
  name: 'Carousel',
  kind: 'media',
  doc: 'A horizontally swipeable set of children.',
  children: true,
  props: {},
  example:
    '<Carousel>\n  <Card><Text>Slide one</Text></Card>\n  <Card><Text>Slide two</Text></Card>\n</Carousel>',
});

export const DataTable = defineBlockSchema({
  name: 'DataTable',
  kind: 'data',
  rich: true,
  doc: 'A table. Columns are a string[]; rows are a string[][] (positional cells).',
  props: {
    columns: { type: 'string[]', doc: 'Column headers.', required: true },
    rows: {
      type: 'string[][]',
      doc: 'Each row is an array of cell strings, positional to columns (rows is a string[][]). NOT an array of objects.',
      required: true,
    },
  },
  example:
    '<DataTable\n  columns={["Risk", "Likelihood", "Impact"]}\n  rows={[\n    ["Drift", "med", "high"],\n    ["Rate limit", "low", "med"]\n  ]} />',
  decompose: tableFallback,
});

export const List = defineBlockSchema({
  name: 'List',
  kind: 'data',
  rich: true,
  doc: 'A vertical list. Put one child per row.',
  children: true,
  props: {},
  example: '<List>\n  <Text>First</Text>\n  <Text>Second</Text>\n</List>',
  decompose: (node) => ({ type: 'Stack', children: node.children }),
});

export const Tree = defineBlockSchema({
  name: 'Tree',
  kind: 'data',
  rich: true,
  doc: 'A nested tree; items may carry children of the same shape.',
  props: {
    items: {
      type: 'record[]',
      doc: 'Tree items.',
      required: true,
      shape: {
        label: { type: 'string', doc: 'Item label.', required: true },
        children: { type: 'record[]', doc: 'Nested items of the same shape.' },
      },
    },
  },
  example: '<Tree items={[{ label: "src", children: [{ label: "index.ts" }] }]} />',
  decompose: (node) => itemsFallback(node, (i) => asString(i.label, JSON.stringify(i))),
});

export const Board = defineBlockSchema({
  name: 'Board',
  kind: 'data',
  rich: true,
  doc: 'A kanban board: cards grouped into columns.',
  props: {
    items: {
      type: 'record[]',
      doc: 'Cards.',
      required: true,
      shape: {
        title: { type: 'string', doc: 'Card title.', required: true },
        column: { type: 'string', doc: 'Column name.' },
      },
    },
  },
  example: '<Board items={[{ title: "Fix login", column: "Doing" }]} />',
  decompose: (node) => itemsFallback(node, (i) => asString(i.title, JSON.stringify(i))),
});

export const Timeline = defineBlockSchema({
  name: 'Timeline',
  kind: 'data',
  rich: true,
  doc: 'A dated event list.',
  props: {
    items: {
      type: 'record[]',
      doc: 'Events, most recent first.',
      required: true,
      shape: {
        date: { type: 'string', doc: 'When (short).' },
        title: { type: 'string', doc: 'Event title.', required: true },
        description: { type: 'string', doc: 'Optional detail.' },
        tone,
      },
    },
  },
  example:
    '<Timeline items={[\n  { date: "Today", title: "Risk recalculated", tone: "warn" },\n  { date: "Jun 29", title: "Document expired" }\n]} />',
  decompose: (node) =>
    itemsFallback(node, (i) => {
      const head = `${asString(i.date)} - ${asString(i.title)}`.trim();
      const description = asString(i.description);
      return description ? `${head} - ${description}` : head;
    }),
});

export const Calendar = defineBlockSchema({
  name: 'Calendar',
  kind: 'data',
  rich: true,
  doc: 'A calendar of dated entries.',
  props: {
    items: {
      type: 'record[]',
      doc: 'Dated entries.',
      required: true,
      shape: {
        date: { type: 'string', doc: 'ISO date or short label.', required: true },
        title: { type: 'string', doc: 'Entry title.', required: true },
      },
    },
  },
  example: '<Calendar items={[{ date: "2026-07-03", title: "Design review" }]} />',
  decompose: (node) =>
    itemsFallback(node, (i) => `${asString(i.date)} - ${asString(i.title)}`.trim()),
});

export const Stat = defineBlockSchema({
  name: 'Stat',
  kind: 'data',
  rich: true,
  doc: 'A single headline metric.',
  props: {
    label: { type: 'string', doc: 'Metric name.', required: true },
    value: { type: 'string', doc: 'Metric value (string or expr).', required: true },
    tone,
  },
  example: '<Stat label="Open cases" value="3" tone="warn" />',
  decompose: (node) => {
    const statLabel = asString(prop(node, 'label'));
    const value = prop(node, 'value');
    const text = typeof value === 'object' && value !== null ? '' : String(value ?? '');
    return { type: 'Text', children: [textNode(`${statLabel}: ${text}`)] };
  },
});

export const Chart = defineBlockSchema({
  name: 'Chart',
  kind: 'data',
  rich: true,
  doc: 'A chart. type + alt (required); data is an array of { label, value }.',
  props: {
    alt,
    type: {
      type: 'enum',
      doc: 'Chart type.',
      values: ['bar', 'line', 'area', 'donut', 'radar', 'gauge', 'scatter'],
      required: true,
    },
    data: {
      type: 'record[]',
      doc: 'The data points, one { label, value } per bar/point.',
      required: true,
      shape: {
        label: { type: 'string', doc: 'Category label.', required: true },
        value: { type: 'number', doc: 'Numeric value.', required: true },
      },
    },
  },
  example:
    '<Chart alt="Risk by signal" type="bar" data={[\n  { label: "Screening", value: 28 },\n  { label: "Geography", value: 18 }\n]} />',
  decompose: (n) => altFallback(n, 'chart'),
});

export const VegaChart = defineBlockSchema({
  name: 'VegaChart',
  kind: 'data',
  rich: true,
  doc: 'A chart driven by a full Vega-Lite spec, for shapes Chart cannot express.',
  props: {
    alt,
    spec: { type: 'json', doc: 'A Vega-Lite spec, rendered as-is.', required: true },
  },
  example: '<VegaChart alt="Requests over time" spec={{ mark: "line" }} />',
  decompose: (n) => altFallback(n, 'chart'),
});

export const Diagram = defineBlockSchema({
  name: 'Diagram',
  kind: 'data',
  rich: true,
  doc: 'A node/edge flow diagram.',
  props: {
    alt: { type: 'string', doc: 'Text description (required).', required: true },
    direction: { type: 'enum', doc: 'Layout axis.', values: ['right', 'down'] },
    nodes: {
      type: 'record[]',
      doc: 'Nodes; each needs a unique id.',
      required: true,
      shape: {
        id: { type: 'string', doc: 'Unique id.', required: true },
        label: { type: 'string', doc: 'Node label.' },
        kind: {
          type: 'enum',
          doc: 'Node role.',
          values: ['service', 'store', 'queue', 'client', 'external', 'concept', 'code'],
        },
        tone,
      },
    },
    edges: {
      type: 'record[]',
      doc: 'Edges connecting node ids.',
      shape: {
        from: { type: 'string', doc: 'Source node id.', required: true },
        to: { type: 'string', doc: 'Target node id.', required: true },
        label: { type: 'string', doc: 'Edge label.' },
        dashed: { type: 'boolean', doc: 'Render dashed.' },
      },
    },
  },
  example:
    '<Diagram alt="Request path" direction="down"\n  nodes={[{ id: "api", label: "API", kind: "service" }, { id: "db", label: "DB", kind: "store" }]}\n  edges={[{ from: "api", to: "db" }]} />',
  decompose: diagramFallback,
});

export const Canvas = defineBlockSchema({
  name: 'Canvas',
  kind: 'data',
  rich: true,
  doc: 'A free-form drawing surface.',
  props: { alt },
  example: '<Canvas alt="Floor plan sketch" />',
  decompose: (n) => altFallback(n, 'diagram'),
});

export const Embed = defineBlockSchema({
  name: 'Embed',
  kind: 'data',
  rich: true,
  doc: 'Embedded external content; hosts commonly deny it by permission.',
  props: {
    src: { type: 'string', doc: 'Embedded content URL.' },
    alt: { type: 'string', doc: 'Text description.' },
  },
  example: '<Embed src="https://example.com/widget" alt="Pricing widget" />',
  decompose: (n) => altFallback(n, 'embedded content'),
});

/** Every built-in block, ordered by kind (layout, content, control, structure,
 *  media, data). `createRegistry(defaultBlocks)` is the full standard registry. */
export const defaultBlocks: readonly BlockDefinition[] = [
  // layout
  Box,
  Stack,
  Grid,
  Divider,
  Card,
  // content
  Text,
  Heading,
  Markdown,
  Image,
  Icon,
  Link,
  Badge,
  Tag,
  Avatar,
  AvatarGroup,
  Code,
  Callout,
  // controls
  Button,
  Input,
  Select,
  MultiSelect,
  Autocomplete,
  Checkbox,
  Radio,
  Toggle,
  Slider,
  DatePicker,
  ColorPicker,
  FilePicker,
  Rating,
  TagInput,
  Field,
  Disclosure,
  Accordion,
  // structure & status
  Tabs,
  Steps,
  SegmentedControl,
  Progress,
  Empty,
  // media
  Video,
  Audio,
  Carousel,
  // data & viz
  DataTable,
  List,
  Tree,
  Board,
  Timeline,
  Calendar,
  Stat,
  Chart,
  VegaChart,
  Diagram,
  Canvas,
  Embed,
];

const DEFAULT_BY_NAME: ReadonlyMap<string, BlockDefinition> = new Map(
  defaultBlocks.map((b) => [b.name, b]),
);

/** The built-in definition for a block name, or undefined. The compiler and
 *  walk() consult this; registry-aware call sites take a MosaicRegistry. */
export function defaultBlock(name: string): BlockDefinition | undefined {
  return DEFAULT_BY_NAME.get(name);
}
