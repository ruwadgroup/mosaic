'use client';

// The host's own block set: every Mosaic block drawn through this app's design
// system - the vendored t3-code UI kit (shadcn base-mira on Base UI). The
// artifact stays data; the look is entirely ours. This is the "full way to own
// the design" from proposal §3.3.
//
// Contract (see @mosaicjs/react): each block receives
// { node, props, children, value, setValue, events }. Stateful controls get
// value/setValue only when the node carries bind:state; when unbound they fall
// back to their own local state (uncontrolled defaultValue), so a mock stays a
// live mock. Named intents leave through events.<name>().

import { type MosaicBlockProps, type MosaicComponents, layoutDiagram } from '@mosaicjs/react';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
  Autocomplete as UIAutocomplete,
} from '@/components/ui/autocomplete';
import { Badge as UIBadge } from '@/components/ui/badge';
import { Button as UIButton } from '@/components/ui/button';
import { Card as UICard } from '@/components/ui/card';
import { Checkbox as UICheckbox } from '@/components/ui/checkbox';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxValue,
} from '@/components/ui/combobox';
import { Empty as UIEmpty } from '@/components/ui/empty';
import { FieldLabel, Field as UIField } from '@/components/ui/field';
import { Input as UIInput } from '@/components/ui/input';
import { Progress as UIProgress } from '@/components/ui/progress';
import { RadioGroup, Radio as UIRadio } from '@/components/ui/radio-group';
import {
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
  Select as UISelect,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider as UISlider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TabsList, TabsPanel, TabsTab, Tabs as UITabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

type PV = MosaicBlockProps['props'][string];

const str = (v: PV | undefined): string => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const num = (v: PV | undefined, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const arr = (v: PV | undefined): PV[] => (Array.isArray(v) ? v : []);
const strs = (v: PV | undefined): string[] => arr(v).map((x) => str(x));

const GAP: Record<string, string> = {
  '1': 'gap-1',
  '2': 'gap-2',
  '3': 'gap-3',
  '4': 'gap-4',
  '5': 'gap-6',
  '6': 'gap-8',
};
const gap = (v: PV | undefined) => GAP[str(v)] ?? 'gap-3';

// Small muted field-label used by composite controls that cannot own a single
// <label htmlFor>. Single-input controls associate with a real <label> instead.
const LABEL = 'font-medium text-muted-foreground text-xs';

// tone -> text color (Text, Timeline dot, Stat)
const TONE_TEXT: Record<string, string> = {
  ok: 'text-success-foreground',
  warn: 'text-warning-foreground',
  bad: 'text-destructive-foreground',
  subtle: 'text-muted-foreground',
  primary: 'text-primary',
};

// tone -> ui/badge variant (tinted ~12% background, *-foreground text)
const BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'error'> = {
  ok: 'success',
  warn: 'warning',
  bad: 'error',
  primary: 'default',
  subtle: 'secondary',
};

// tone -> ui/button variant
const BUTTON_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'ghost' | 'outline'
> = {
  primary: 'default',
  bad: 'destructive',
  destructive: 'destructive',
  secondary: 'secondary',
  subtle: 'ghost',
};

// tone -> ui/alert variant + description text color
const CALLOUT_VARIANT: Record<string, 'default' | 'error' | 'info' | 'success' | 'warning'> = {
  ok: 'success',
  warn: 'warning',
  bad: 'error',
  primary: 'info',
};
const CALLOUT_DESC: Record<string, string> = {
  success: 'text-success-foreground',
  warning: 'text-warning-foreground',
  error: 'text-destructive-foreground',
  info: 'text-foreground',
  default: 'text-foreground',
};

// --- layout ---------------------------------------------------------------------

function Stack({ props, children }: MosaicBlockProps) {
  const horizontal = props.direction === 'horizontal';
  return (
    <div
      className={cn(
        'flex min-w-0',
        horizontal ? 'flex-row flex-wrap items-center' : 'flex-col',
        gap(props.gap),
      )}
    >
      {children}
    </div>
  );
}

function Grid({ props, children }: MosaicBlockProps) {
  // Children without explicit spans divide the grid equally, so a 12-col Grid
  // with three Stats renders three real columns (never twelve thin ones).
  const count = Math.max(React.Children.count(children), 1);
  const cols = Math.min(count, num(props.cols, 12));
  return (
    <div
      className={cn('grid items-stretch', gap(props.gap))}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

function Box({ children }: MosaicBlockProps) {
  return <div className="min-w-0">{children}</div>;
}

function Card({ props, children, events }: MosaicBlockProps) {
  const clickable = Boolean(events.click);
  return (
    <UICard
      className={cn(
        'p-4',
        gap(props.gap),
        clickable && 'cursor-pointer transition-colors hover:border-ring/40',
      )}
      onClick={events.click}
      onKeyUp={clickable ? (e) => e.key === 'Enter' && events.click?.() : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {children}
    </UICard>
  );
}

function Divider() {
  return <Separator />;
}

// --- content --------------------------------------------------------------------

function Heading({ props, children }: MosaicBlockProps) {
  const level = Math.min(Math.max(num(props.level, 2), 1), 6);
  const Tag = `h${level}` as 'h2';
  const size =
    level === 1 ? 'text-xl' : level === 2 ? 'text-lg' : level === 3 ? 'text-base' : 'text-sm';
  return (
    <Tag className={cn(size, 'text-balance font-semibold text-foreground tracking-tight')}>
      {children}
    </Tag>
  );
}

function Text({ props, children }: MosaicBlockProps) {
  return (
    <p
      className={cn(
        'leading-relaxed',
        TONE_TEXT[str(props.tone)] ?? 'text-foreground',
        props.weight === 'bold' && 'font-semibold',
        props.size === 'xl' && 'text-lg',
        props.size === 'sm' && 'text-xs',
      )}
    >
      {children}
    </p>
  );
}

function Badge({ props, children }: MosaicBlockProps) {
  return (
    <UIBadge variant={BADGE_VARIANT[str(props.tone)] ?? 'secondary'} className="rounded-full">
      {children}
    </UIBadge>
  );
}

function Avatar({ props }: MosaicBlockProps) {
  const name = str(props.name) || str(props.initials);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-medium text-primary text-sm">
      {initials}
    </span>
  );
}

function Callout({ props, children }: MosaicBlockProps) {
  const variant = CALLOUT_VARIANT[str(props.tone)] ?? 'default';
  const Icon =
    variant === 'success'
      ? CircleCheck
      : variant === 'warning' || variant === 'error'
        ? TriangleAlert
        : Info;
  return (
    <Alert variant={variant}>
      <Icon />
      <AlertDescription className={cn('leading-relaxed', CALLOUT_DESC[variant])}>
        {children}
      </AlertDescription>
    </Alert>
  );
}

function Link({ props, children }: MosaicBlockProps) {
  return (
    <a
      href={str(props.href)}
      className="text-primary underline-offset-4 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {React.Children.count(children) > 0 ? children : str(props.href)}
    </a>
  );
}

// Code: a bare command / snippet block, given the ported .chat-markdown-codeblock
// treatment (which is scoped under .chat-markdown).
function Code({ props, children }: MosaicBlockProps) {
  return (
    <div className="chat-markdown">
      <div className="chat-markdown-codeblock" data-wrap="true">
        <pre>
          <code className="font-mono text-xs">
            {str(props.value)}
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
}

function Markdown({ props, children }: MosaicBlockProps) {
  const src = str(props.value);
  return (
    <div className="chat-markdown">
      {src ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{src}</ReactMarkdown> : children}
    </div>
  );
}

// --- controls ---------------------------------------------------------------------

function Button({ props, children, events }: MosaicBlockProps) {
  return (
    <UIButton
      variant={BUTTON_VARIANT[str(props.tone)] ?? 'outline'}
      size="sm"
      onClick={events.click}
    >
      {children}
    </UIButton>
  );
}

function Input({ props, value, setValue }: MosaicBlockProps) {
  const label = str(props.label);
  const id = React.useId();
  const current = str((value as PV) ?? props.value);
  const placeholder = str(props.placeholder) || undefined;

  if (props.multiline) {
    // Textarea uses Base UI Field.Control, so it must live inside a Field.
    return (
      <UIField>
        {label ? <FieldLabel>{label}</FieldLabel> : null}
        <Textarea
          placeholder={placeholder}
          {...(setValue
            ? { value: current, onChange: (e) => setValue(e.target.value) }
            : { defaultValue: current })}
        />
      </UIField>
    );
  }

  const input = (
    <UIInput
      id={id}
      type={str(props.type) || 'text'}
      size="sm"
      placeholder={placeholder}
      {...(setValue
        ? { value: current, onValueChange: (v: string) => setValue(v) }
        : { defaultValue: current })}
    />
  );
  return label ? (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {input}
    </div>
  ) : (
    input
  );
}

function Select({ props, value, setValue }: MosaicBlockProps) {
  const options = strs(props.options);
  const label = str(props.label);
  const current = str((value as PV) ?? props.value);
  const el = (
    <UISelect
      {...(setValue
        ? { value: current, onValueChange: (v: unknown) => setValue(str(v as PV)) }
        : { defaultValue: current || undefined })}
    >
      <SelectTrigger size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectPopup>
    </UISelect>
  );
  return label ? (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={LABEL}>{label}</span>
      {el}
    </div>
  ) : (
    el
  );
}

function Checkbox({ props, value, setValue }: MosaicBlockProps) {
  const id = React.useId();
  const checked = Boolean(value ?? props.checked ?? props.value);
  return (
    <div className="flex items-start gap-2.5 text-sm leading-snug">
      <UICheckbox
        id={id}
        className="mt-0.5"
        {...(setValue
          ? { checked, onCheckedChange: (c: boolean) => setValue(c) }
          : { defaultChecked: Boolean(props.checked ?? props.value) })}
      />
      <label htmlFor={id} className="cursor-pointer">
        {str(props.label)}
      </label>
    </div>
  );
}

function Radio({ props, value, setValue }: MosaicBlockProps) {
  const options = strs(props.options);
  const label = str(props.label);
  const base = React.useId();
  const current = str((value as PV) ?? props.value);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {label ? <span className={LABEL}>{label}</span> : null}
      <RadioGroup
        className="gap-2"
        {...(setValue
          ? { value: current, onValueChange: (v: unknown) => setValue(str(v as PV)) }
          : { defaultValue: current || undefined })}
      >
        {options.map((o, i) => {
          const id = `${base}-${i}`;
          return (
            <div key={o} className="flex items-center gap-2.5 text-sm">
              <UIRadio id={id} value={o} />
              <label htmlFor={id} className="cursor-pointer">
                {o}
              </label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}

function Toggle({ props, value, setValue }: MosaicBlockProps) {
  const id = React.useId();
  const on = Boolean(value ?? props.checked ?? props.value);
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Switch
        id={id}
        {...(setValue
          ? { checked: on, onCheckedChange: (c: boolean) => setValue(c) }
          : { defaultChecked: Boolean(props.checked ?? props.value) })}
      />
      <label htmlFor={id} className="cursor-pointer">
        {str(props.label)}
      </label>
    </div>
  );
}

function Slider({ props, value, setValue }: MosaicBlockProps) {
  const label = str(props.label);
  const v = num((value as PV) ?? props.value);
  const slider = (
    <UISlider
      min={num(props.min)}
      max={num(props.max, 100)}
      step={num(props.step, 1)}
      {...(setValue
        ? {
            value: v,
            onValueChange: (nv: number | readonly number[]) =>
              setValue(Array.isArray(nv) ? Number(nv[0]) : Number(nv)),
          }
        : { defaultValue: v })}
    />
  );
  return label ? (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={LABEL}>{label}</span>
      {slider}
    </div>
  ) : (
    slider
  );
}

function Field({ props, children }: MosaicBlockProps) {
  const help = str(props.help);
  const label = str(props.label);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {label ? <span className={LABEL}>{label}</span> : null}
      {children}
      {help ? <span className="text-muted-foreground text-xs">{help}</span> : null}
    </div>
  );
}

function MultiSelect({ props, value, setValue }: MosaicBlockProps) {
  const options = strs(props.options);
  const label = str(props.label);
  const selected = strs((value as PV) ?? props.value);
  const el = (
    <Combobox
      items={options}
      multiple
      {...(setValue
        ? {
            value: selected,
            onValueChange: (v: unknown) =>
              setValue((Array.isArray(v) ? v : []).map((x) => str(x as PV))),
          }
        : { defaultValue: selected })}
    >
      <ComboboxChips>
        <ComboboxValue>
          {(vals: unknown) =>
            (Array.isArray(vals) ? vals : []).map((v) => (
              <ComboboxChip key={str(v as PV)}>{str(v as PV)}</ComboboxChip>
            ))
          }
        </ComboboxValue>
        <ComboboxChipsInput placeholder={str(props.placeholder) || 'Select...'} />
      </ComboboxChips>
      <ComboboxPopup>
        <ComboboxEmpty>No options.</ComboboxEmpty>
        <ComboboxList>
          {(item: unknown) => (
            <ComboboxItem key={str(item as PV)} value={item as string}>
              {str(item as PV)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
  return label ? (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={LABEL}>{label}</span>
      {el}
    </div>
  ) : (
    el
  );
}

function Autocomplete({ props, value, setValue }: MosaicBlockProps) {
  const options = strs(props.options);
  const label = str(props.label);
  const current = str((value as PV) ?? props.value);
  const el = (
    <UIAutocomplete
      items={options}
      {...(setValue
        ? { value: current, onValueChange: (v: string) => setValue(v) }
        : { defaultValue: current })}
    >
      <AutocompleteInput size="sm" placeholder={str(props.placeholder) || undefined} />
      <AutocompletePopup>
        <AutocompleteEmpty>No matches.</AutocompleteEmpty>
        <AutocompleteList>
          {(item: unknown) => (
            <AutocompleteItem key={str(item as PV)} value={item as string}>
              {str(item as PV)}
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompletePopup>
    </UIAutocomplete>
  );
  return label ? (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={LABEL}>{label}</span>
      {el}
    </div>
  ) : (
    el
  );
}

function TagInput({ props, value, setValue }: MosaicBlockProps) {
  const label = str(props.label);
  const bound = Boolean(setValue);
  const [local, setLocal] = React.useState<string[]>(() => strs(props.value));
  const tags = bound ? strs(value as PV) : local;
  const write = React.useCallback(
    (next: string[]) => (setValue ? setValue(next) : setLocal(next)),
    [setValue],
  );
  const [draft, setDraft] = React.useState('');
  const commit = () => {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) write([...tags, tag]);
    setDraft('');
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {label ? <span className={LABEL}>{label}</span> : null}
      <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1.5 shadow-xs/5 transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/24 dark:bg-input/32">
        {tags.map((tag) => (
          <UIBadge key={tag} variant="secondary" className="gap-1 pe-1">
            {tag}
            <button
              type="button"
              aria-label={`remove ${tag}`}
              onClick={() => write(tags.filter((x) => x !== tag))}
              className="opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </UIBadge>
        ))}
        <input
          type="text"
          value={draft}
          placeholder={tags.length === 0 ? str(props.placeholder) || 'Add...' : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
              write(tags.slice(0, -1));
            }
          }}
          onBlur={commit}
          className="min-w-20 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/72"
        />
      </div>
    </div>
  );
}

function DatePicker({ props, value, setValue }: MosaicBlockProps) {
  const label = str(props.label);
  const id = React.useId();
  const current = str((value as PV) ?? props.value);
  const input = (
    <UIInput
      id={id}
      type="date"
      size="sm"
      className="w-fit"
      {...(setValue
        ? { value: current, onValueChange: (v: string) => setValue(v) }
        : { defaultValue: current })}
    />
  );
  return label ? (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {input}
    </div>
  ) : (
    input
  );
}

function ColorPicker({ props, value, setValue }: MosaicBlockProps) {
  const label = str(props.label);
  const id = React.useId();
  const current = str((value as PV) ?? props.value) || '#7c7cff';
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {label ? (
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
      ) : null}
      <div className="flex items-center gap-2.5">
        <input
          id={id}
          type="color"
          className="size-8 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
          {...(setValue
            ? { value: current, onChange: (e) => setValue(e.target.value) }
            : { defaultValue: current })}
        />
        <code className="font-mono text-muted-foreground text-xs">{current}</code>
      </div>
    </div>
  );
}

// --- structure & status ---------------------------------------------------------

function SegmentedControl({ props, value, setValue }: MosaicBlockProps) {
  const options = strs(props.options);
  const current = str((value as PV) ?? props.value);
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      className="w-fit"
      {...(setValue
        ? {
            value: [current],
            onValueChange: (v: unknown) => {
              const list = Array.isArray(v) ? v : [];
              const last = list[list.length - 1];
              if (last !== undefined) setValue(str(last as PV));
            },
          }
        : { defaultValue: current ? [current] : [] })}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o} value={o}>
          {o}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function Tabs({ props, children, value, setValue }: MosaicBlockProps) {
  const labels = strs(props.items);
  const active = props.active;
  const defaultLabel =
    typeof active === 'number' ? (labels[active] ?? labels[0]) : str(active) || labels[0];
  const panels = React.Children.toArray(children);
  return (
    <UITabs
      className="gap-3"
      {...(setValue
        ? {
            value: str(value as PV) || (defaultLabel ?? ''),
            onValueChange: (v: unknown) => setValue(str(v as PV)),
          }
        : { defaultValue: defaultLabel })}
    >
      <TabsList variant={props.variant === 'underline' ? 'underline' : 'default'}>
        {labels.map((label) => (
          <TabsTab key={label} value={label}>
            {label}
          </TabsTab>
        ))}
      </TabsList>
      {labels.map((label, i) => (
        <TabsPanel key={label} value={label}>
          {panels[i] ?? null}
        </TabsPanel>
      ))}
    </UITabs>
  );
}

function Progress({ props }: MosaicBlockProps) {
  const value = Math.min(Math.max(num(props.value), 0), 100);
  const label = str(props.label);
  return (
    <div className="flex flex-col gap-1.5">
      {label ? <span className="text-muted-foreground text-xs">{label}</span> : null}
      <UIProgress value={value} max={100} />
    </div>
  );
}

function Steps({ props }: MosaicBlockProps) {
  const items = strs(props.items);
  const current = num(props.current, -1);
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
      {items.map((item, i) => (
        <li key={item} className="flex items-center gap-1.5">
          {i > 0 ? <span className="text-muted-foreground/50">→</span> : null}
          <span
            className={cn(
              i === current
                ? 'font-medium text-foreground'
                : i < current
                  ? 'text-foreground/70'
                  : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'me-1.5 inline-flex size-5 items-center justify-center rounded-full text-xs',
                i < current
                  ? 'bg-success/15 text-success-foreground'
                  : i === current
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {i + 1}
            </span>
            {item}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Empty({ props, children }: MosaicBlockProps) {
  return (
    <UIEmpty className="gap-2 rounded-lg border border-dashed p-6 text-muted-foreground text-sm">
      {str(props.label) || (React.Children.count(children) === 0 ? 'Nothing here yet.' : null)}
      {children}
    </UIEmpty>
  );
}

// --- data & viz -------------------------------------------------------------------

function Stat({ props }: MosaicBlockProps) {
  return (
    <div className={cn('min-w-0', TONE_TEXT[str(props.tone)])}>
      <div className="whitespace-nowrap font-[650] text-[1.125rem] leading-tight tracking-[-0.02em]">
        {str(props.value)}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{str(props.label)}</div>
    </div>
  );
}

function DataTable({ props }: MosaicBlockProps) {
  const columns = strs(props.columns);
  const rows = arr(props.rows).map((r) => (Array.isArray(r) ? r.map((c) => str(c)) : [str(r)]));
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead
                key={c}
                className="text-[10.5px] text-muted-foreground uppercase tracking-wider"
              >
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, ri) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are static artifact data
            <TableRow key={ri}>
              {row.map((cell, ci) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                <TableCell key={ci} className="whitespace-normal align-top leading-snug">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Timeline({ props }: MosaicBlockProps) {
  const items = arr(props.items);
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item, i) => {
        const e = (item && typeof item === 'object' && !Array.isArray(item) ? item : {}) as Record<
          string,
          PV
        >;
        const description = str(e.description);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: timeline entries are static artifact data
          <li key={i} className="flex items-baseline gap-2.5 text-sm">
            <span
              className={cn('text-[0.6rem]', TONE_TEXT[str(e.tone)] ?? 'text-muted-foreground/60')}
            >
              ●
            </span>
            <span className="w-14 shrink-0 font-mono text-muted-foreground text-xs">
              {str(e.date)}
            </span>
            <span className="flex min-w-0 flex-col leading-snug">
              <span>{str(e.title)}</span>
              {description ? (
                <span className="text-muted-foreground text-xs">{description}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function List({ props, children }: MosaicBlockProps) {
  return <div className={cn('flex min-w-0 flex-col', gap(props.gap ?? '2'))}>{children}</div>;
}

function Chart({ props }: MosaicBlockProps) {
  const series = arr(props.series);
  const first = series[0];
  const points =
    first && typeof first === 'object' && !Array.isArray(first)
      ? arr((first as Record<string, PV>).points)
      : [];
  if (props.type !== 'bar' || points.length === 0) {
    return <p className="text-muted-foreground text-sm">{str(props.alt)}</p>;
  }
  const values = points.map((p) => (Array.isArray(p) ? num(p[1]) : num(p)));
  const labels = points.map((p, i) => (Array.isArray(p) ? str(p[0]) : String(i)));
  const max = Math.max(...values, 1);
  return (
    <div role="img" aria-label={str(props.alt)} className="flex flex-col gap-1.5">
      <div className="flex items-end gap-3 border-border border-b">
        {values.map((v, i) => (
          <div
            key={labels[i]}
            className="flex min-w-0 flex-1 flex-col justify-end gap-1.5 text-center"
          >
            <div className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
              {Number.isInteger(v) ? v : v.toFixed(2)}
            </div>
            <div
              className="rounded-t-sm bg-primary"
              style={{ height: `${Math.max(Math.round((v / max) * 120), 3)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        {labels.map((label) => (
          <div
            key={label}
            className="min-w-0 flex-1 truncate text-center font-mono text-[10px] text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// Diagram: declarative nodes/edges/groups. Geometry comes from @mosaicjs/react's
// exported layoutDiagram (deterministic, dependency-free); the paint is entirely
// this app's - token colors, ui-kit radii, DM Sans / JetBrains Mono. Selection is
// the standard contract: clicking a node writes its id to the bound path
// (setValue), the background writes null, and an authored on:event select
// escalates through events.select like any other named intent.

const DIAGRAM_TONE: Record<string, string> = {
  ok: 'var(--success)',
  warn: 'var(--warning)',
  bad: 'var(--destructive)',
  primary: 'var(--primary)',
};
const DIAGRAM_TONE_TEXT: Record<string, string> = {
  ok: 'var(--success-foreground)',
  warn: 'var(--warning-foreground)',
  bad: 'var(--destructive-foreground)',
  primary: 'var(--primary)',
};
const DIAGRAM_NODE_STROKE: Record<string, string> = {
  ok: 'stroke-success/45',
  warn: 'stroke-warning/55',
  bad: 'stroke-destructive/45',
  primary: 'stroke-primary/45',
};

const mixt = (color: string, pct: number): string =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const rec = (v: PV | undefined): Record<string, PV> =>
  v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, PV>)
    : {};

function Diagram({ props, value, setValue, events }: MosaicBlockProps) {
  const markerBase = `dg-arrow-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const layout = layoutDiagram({
    direction: props.direction,
    nodes: props.nodes,
    edges: props.edges,
    groups: props.groups,
  });

  const nodeMeta = new Map<string, Record<string, PV>>();
  for (const n of arr(props.nodes)) {
    const m = rec(n);
    const id = str(m.id);
    if (id && !nodeMeta.has(id)) nodeMeta.set(id, m);
  }
  const groupMeta = new Map<string, Record<string, PV>>();
  for (const g of arr(props.groups)) groupMeta.set(str(rec(g).id), rec(g));
  // layoutDiagram drops edges with unknown endpoints; mirror its filter so the
  // authored metadata (tone, dashed, label) zips 1:1 with layout.edges.
  const anchored = new Set([...layout.nodes, ...layout.groups].map((r) => r.id));
  const edgeMeta = arr(props.edges)
    .map(rec)
    .filter((e) => anchored.has(str(e.from)) && anchored.has(str(e.to)));

  const interactive = Boolean(setValue) || Boolean(events.select);
  const selected = value === null || value === undefined ? null : str(value as PV);
  const pick = (id: string) => {
    setValue?.(id);
    events.select?.();
  };

  // One arrowhead marker per distinct edge color, collected while edges render.
  const markerColors: string[] = [];
  const markerId = (color: string): string => {
    let i = markerColors.indexOf(color);
    if (i === -1) i = markerColors.push(color) - 1;
    return `${markerBase}-${i}`;
  };

  const hulls = layout.groups.map((r) => {
    const meta = groupMeta.get(r.id) ?? {};
    const tone = DIAGRAM_TONE[str(meta.tone)];
    return (
      <g key={`group-${r.id}`}>
        <rect
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={12}
          strokeDasharray="3 4"
          style={{
            fill: mixt(tone ?? 'var(--foreground)', 3),
            stroke: mixt(tone ?? 'var(--foreground)', 14),
          }}
        />
        <text
          x={r.x + 12}
          y={r.y + 16}
          fontSize={9.5}
          letterSpacing="0.08em"
          className="fill-muted-foreground font-medium uppercase"
          style={tone ? { fill: DIAGRAM_TONE_TEXT[str(meta.tone)] } : undefined}
        >
          {str(meta.label) || r.id}
        </text>
      </g>
    );
  });

  const edgeEls = layout.edges.map((edge, i) => {
    const meta = edgeMeta[i] ?? {};
    const tone = DIAGRAM_TONE[str(meta.tone)];
    const color = tone ? mixt(tone, 65) : mixt('var(--muted-foreground)', 50);
    const [p0, p1, p2] = edge.points;
    if (!p0 || !p1) return null;
    const d = p2
      ? `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`
      : `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
    const mid = p2
      ? { x: 0.25 * p0.x + 0.5 * p1.x + 0.25 * p2.x, y: 0.25 * p0.y + 0.5 * p1.y + 0.25 * p2.y }
      : { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const label = str(meta.label);
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: edges are static artifact data
      <g key={`edge-${i}`}>
        <path
          d={d}
          fill="none"
          strokeWidth={1.25}
          strokeDasharray={meta.dashed === true ? '5 4' : undefined}
          markerEnd={`url(#${markerId(color)})`}
          markerStart={meta.bidirectional === true ? `url(#${markerId(color)})` : undefined}
          style={{ stroke: color }}
        />
        {label ? (
          <text
            x={mid.x}
            y={mid.y - 5}
            textAnchor="middle"
            fontSize={9.5}
            className="fill-muted-foreground font-mono"
          >
            {label}
          </text>
        ) : null}
      </g>
    );
  });

  const nodeEls = layout.nodes.map((r) => {
    const meta = nodeMeta.get(r.id) ?? {};
    const toneKey = str(meta.tone);
    const tone = DIAGRAM_TONE[toneKey];
    const isSelected = selected !== null && selected === r.id;
    const label = str(meta.label) || r.id;
    const sublabel = str(meta.sublabel);
    const kind = str(meta.kind);
    const secondLine = sublabel || kind;
    const badge = str(meta.badge);
    const badgeW = Math.round(badge.length * 6.2 + 14);
    return (
      <g
        key={r.id}
        data-node-id={r.id}
        className={interactive ? 'group/node cursor-pointer' : undefined}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? label : undefined}
        onClick={
          interactive
            ? (e) => {
                e.stopPropagation();
                pick(r.id);
              }
            : undefined
        }
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  pick(r.id);
                }
              }
            : undefined
        }
      >
        {isSelected ? (
          <rect
            x={r.x - 2.5}
            y={r.y - 2.5}
            width={r.w + 5}
            height={r.h + 5}
            rx={11}
            fill="none"
            strokeWidth={3}
            style={{ stroke: mixt('var(--ring)', 24) }}
          />
        ) : null}
        <rect
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={9}
          strokeWidth={isSelected ? 1.6 : 1}
          className={cn(
            isSelected ? 'stroke-primary' : (DIAGRAM_NODE_STROKE[toneKey] ?? 'stroke-border'),
            interactive && !isSelected && 'transition-[stroke] group-hover/node:stroke-ring/60',
          )}
          style={{
            fill: tone
              ? `color-mix(in srgb, ${tone} 9%, var(--card))`
              : 'color-mix(in srgb, var(--foreground) 4%, var(--card))',
          }}
        />
        <text
          x={r.x + 13}
          y={r.y + (secondLine ? r.h / 2 - 6 : r.h / 2)}
          dominantBaseline="central"
          fontSize={12}
          className={cn('fill-foreground font-medium', kind === 'code' && 'font-mono')}
        >
          {label}
        </text>
        {sublabel ? (
          <text
            x={r.x + 13}
            y={r.y + r.h / 2 + 9}
            dominantBaseline="central"
            fontSize={10}
            className="fill-muted-foreground"
          >
            {sublabel}
          </text>
        ) : kind ? (
          <text
            x={r.x + 13}
            y={r.y + r.h / 2 + 9}
            dominantBaseline="central"
            fontSize={8}
            letterSpacing="0.08em"
            className="fill-muted-foreground uppercase"
          >
            {kind}
          </text>
        ) : null}
        {badge ? (
          <g>
            <rect
              x={r.x + r.w - badgeW - 6}
              y={r.y - 9}
              width={badgeW}
              height={17}
              rx={8.5}
              style={{
                fill: 'var(--card)',
                stroke: tone ? mixt(tone, 45) : 'var(--border)',
              }}
            />
            <text
              x={r.x + r.w - 6 - badgeW / 2}
              y={r.y - 0.5}
              textAnchor="middle"
              fontSize={9}
              className="font-mono"
              style={{ fill: DIAGRAM_TONE_TEXT[toneKey] ?? 'var(--muted-foreground)' }}
            >
              {badge}
            </text>
          </g>
        ) : null}
      </g>
    );
  });

  return (
    <svg
      role="img"
      aria-label={str(props.alt)}
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="block h-auto max-w-full"
    >
      <defs>
        {markerColors.map((color, i) => (
          <marker
            key={color}
            id={`${markerBase}-${i}`}
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={7}
            markerHeight={7}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: color }} />
          </marker>
        ))}
      </defs>
      <rect
        x={0}
        y={0}
        width={layout.width}
        height={layout.height}
        fill="transparent"
        onClick={interactive && setValue ? () => setValue(null) : undefined}
        onKeyDown={
          interactive && setValue
            ? (e) => {
                if (e.key === 'Escape') setValue(null);
              }
            : undefined
        }
      />
      {hulls}
      {edgeEls}
      {nodeEls}
    </svg>
  );
}

export const mosaicComponents: MosaicComponents = {
  Stack,
  Grid,
  Box,
  Card,
  Divider,
  Heading,
  Text,
  Badge,
  Tag: Badge,
  Avatar,
  Callout,
  Link,
  Code,
  Markdown,
  Button,
  Input,
  Select,
  MultiSelect,
  Autocomplete,
  Checkbox,
  Radio,
  Toggle,
  Slider,
  Field,
  TagInput,
  DatePicker,
  ColorPicker,
  SegmentedControl,
  Tabs,
  Progress,
  Steps,
  Empty,
  Stat,
  DataTable,
  Timeline,
  List,
  Chart,
  Diagram,
};
