import type {
  DocDataTableKind,
  DocLayoutBlock,
  DocLayoutField,
  DocLayoutTableColumn,
  DocLayoutTableRow,
  DocTemplate,
  DocTemplateData,
  DocTemplateTableHtml,
} from './types';
import { dataTableKindLabels } from './variables';

const makeBlockId = (prefix: string, index: number) => `${prefix}-${index}`;

export const clampTextLevel = (level: unknown): 1 | 2 | 3 =>
  level === 1 || level === 2 || level === 3 ? level : 3;

export const clampTextWeight = (
  weight: unknown,
): 'light' | 'normal' | 'bold' | undefined =>
  weight === 'light' || weight === 'normal' || weight === 'bold' ? weight : undefined;

export const normalizeDocLayoutBlock = (block: DocLayoutBlock): DocLayoutBlock => {
  switch (block.type) {
    case 'heading': {
      const weight = clampTextWeight(block.weight);
      return {
        id: block.id,
        type: 'heading',
        text: String(block.text ?? ''),
        level: clampTextLevel(block.level),
        align: block.align === 'center' || block.align === 'right' ? block.align : 'left',
        ...(weight ? { weight } : {}),
      };
    }
    case 'paragraph': {
      const weight = clampTextWeight(block.weight);
      return {
        id: block.id,
        type: 'paragraph',
        text: String(block.text ?? ''),
        level: clampTextLevel(block.level),
        align: block.align === 'center' || block.align === 'right' ? block.align : 'left',
        ...(weight ? { weight } : {}),
      };
    }
    case 'columns':
      return {
        ...block,
        columns: (block.columns ?? []).map((column) => ({
          ...column,
          blocks: (column.blocks ?? []).map(normalizeDocLayoutBlock),
        })),
      };
    case 'fieldRow':
    case 'fieldGrid':
      return {
        ...block,
        fields: (block.fields ?? []).map((f) => ({
          label: String(f.label ?? ''),
          value: String(f.value ?? ''),
        })),
      };
    case 'customTable':
      return {
        ...block,
        columns: block.columns ?? [],
        rows: block.rows ?? [],
      };
    case 'dataTable':
      return {
        ...block,
        kind: block.kind,
        title: block.title,
      };
    default:
      return block;
  }
};

export const normalizeDocLayoutBlocks = (blocks: DocLayoutBlock[]) =>
  blocks.map(normalizeDocLayoutBlock);

export const createDocLayoutBlock = (
  type: DocLayoutBlock['type'],
  index = Date.now(),
): DocLayoutBlock => {
  const id = makeBlockId(type, index);
  switch (type) {
    case 'heading':
      return { id, type, level: 1, text: 'Новий заголовок', align: 'left', weight: 'bold' };
    case 'paragraph':
      return {
        id,
        type,
        level: 3,
        text: 'Текст {{buildingName}}',
        align: 'left',
        weight: 'normal',
      };
    case 'fieldRow':
      return {
        id,
        type,
        fields: [
          { label: 'Квартира', value: '{{apartmentNumber}}' },
          { label: 'Період', value: '{{period}}' },
        ],
      };
    case 'fieldGrid':
      return {
        id,
        type,
        columns: 2,
        fields: [
          { label: 'Квартира', value: '{{apartmentNumber}}' },
          { label: 'Період', value: '{{period}}' },
          { label: 'Нараховано', value: '{{amount}}' },
          { label: 'До сплати', value: '{{balance}}' },
        ],
      };
    case 'customTable':
      return {
        id,
        type,
        columns: [
          { id: 'name', label: 'Назва' },
          { id: 'value', label: 'Значення' },
        ],
        rows: [
          {
            id: `${id}-row-1`,
            cells: { name: 'Рядок', value: '{{amount}}' },
          },
        ],
      };
    case 'dataTable':
      return { id, type, kind: 'fund_balances', title: 'Баланс фондів' };
    case 'signatures':
      return {
        id,
        type,
        left: 'Бухгалтер: __________________',
        right: 'Мешканець: __________________',
      };
    case 'divider':
      return { id, type };
    case 'spacer':
      return { id, type, size: 'medium' };
    case 'columns':
      return {
        id,
        type,
        columns: [
          { id: `${id}-left`, blocks: [createDocLayoutBlock('paragraph', index + 1)] },
          { id: `${id}-right`, blocks: [createDocLayoutBlock('paragraph', index + 2)] },
        ],
      };
    default:
      return { id, type: 'paragraph', level: 3, text: 'Текст', align: 'left', weight: 'normal' };
  }
};

export const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const alignClass = (align: 'left' | 'center' | 'right' | undefined) =>
  align && align !== 'left' ? ` doc-align-${align}` : '';

const weightClass = (weight: 'light' | 'normal' | 'bold' | undefined) =>
  weight ? ` doc-block-weight-${weight}` : '';

const renderInlineTemplate = (value: string) =>
  escapeHtml(value).replace(/\r?\n/g, '<br>');

const renderFieldLabel = (label: string) =>
  label.trim() ? `<td class="doc-field-label">${renderInlineTemplate(label)}</td>` : '<td></td>';

const renderFieldValue = (value: string) =>
  `<td class="doc-field-value"><strong>${renderInlineTemplate(value)}</strong></td>`;

const renderFieldRows = (fields: DocLayoutField[], columns: number) => {
  const safeColumns = Math.max(1, Math.min(columns, 4));
  const rows: DocLayoutField[][] = [];
  for (let index = 0; index < fields.length; index += safeColumns) {
    rows.push(fields.slice(index, index + safeColumns));
  }
  return rows
    .map((row) => {
      const cells = Array.from({ length: safeColumns }).flatMap((_, index) => {
        const field = row[index] ?? { label: '', value: '' };
        return [renderFieldLabel(field.label), renderFieldValue(field.value)];
      });
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');
};

const renderCustomTable = (
  columns: DocLayoutTableColumn[],
  rows: DocLayoutTableRow[],
) => {
  const safeColumns =
    columns.length > 0 ? columns : [{ id: 'name', label: 'Назва' }];
  const header = safeColumns
    .map((column) => `<th>${renderInlineTemplate(column.label)}</th>`)
    .join('');
  const bodyRows = (
    rows.length > 0
      ? rows
      : [
          {
            id: 'row-1',
            cells: Object.fromEntries(safeColumns.map((c) => [c.id, ''])),
          },
        ]
  )
    .map(
      (row) =>
        `<tr>${safeColumns
          .map(
            (column) =>
              `<td>${renderInlineTemplate(row.cells[column.id] ?? '')}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return `<table class="doc-line-table"><thead><tr>${header}</tr></thead><tbody>${bodyRows}</tbody></table>`;
};

const renderDataTablePlaceholder = (
  kind: DocDataTableKind,
  title: string | undefined,
  tables?: DocTemplateTableHtml,
) => {
  const heading = title
    ? `<h3>${renderInlineTemplate(title)}</h3>`
    : '';
  if (tables?.[kind]) {
    return `${heading}${tables[kind]}`;
  }
  return `${heading}<div class="doc-data-table-placeholder">{{${kind}_table}}</div>`;
};

export const renderDocLayoutBlocks = (
  blocks: DocLayoutBlock[],
  tables?: DocTemplateTableHtml,
): string =>
  blocks
    .map((block) => {
      switch (block.type) {
        case 'heading': {
          const level = clampTextLevel(block.level);
          const weight = clampTextWeight(block.weight);
          return `<h${level} class="doc-block-heading${alignClass(block.align)}${weightClass(weight)}">${renderInlineTemplate(block.text)}</h${level}>`;
        }
        case 'paragraph': {
          const level = clampTextLevel(block.level);
          const weight = clampTextWeight(block.weight);
          return `<p class="doc-block-paragraph doc-block-paragraph-level-${level}${alignClass(block.align)}${weightClass(weight)}">${renderInlineTemplate(block.text)}</p>`;
        }
        case 'fieldRow':
          return `<table class="doc-details-table"><tbody>${renderFieldRows(block.fields, 1)}</tbody></table>`;
        case 'fieldGrid':
          return `<table class="doc-details-table"><tbody>${renderFieldRows(block.fields, block.columns ?? 2)}</tbody></table>`;
        case 'customTable':
          return renderCustomTable(block.columns, block.rows);
        case 'dataTable':
          return renderDataTablePlaceholder(block.kind, block.title, tables);
        case 'signatures':
          return `<div class="doc-signatures"><span>${renderInlineTemplate(block.left)}</span><span>${renderInlineTemplate(block.right)}</span></div>`;
        case 'divider':
          return '<hr class="doc-divider" />';
        case 'spacer':
          return `<div class="doc-spacer doc-spacer-${block.size}"></div>`;
        case 'columns':
          return `<div class="doc-columns">${block.columns
            .map((column) => `<div>${renderDocLayoutBlocks(column.blocks, tables)}</div>`)
            .join('')}</div>`;
        default:
          return '';
      }
    })
    .join('');

export const renderDocLayout = (
  blocks: DocLayoutBlock[],
  tables?: DocTemplateTableHtml,
) => `<div class="doc-document">${renderDocLayoutBlocks(blocks, tables)}</div>`;

/** Replace `{{var}}` tokens in HTML/string with data values. */
export const applyDocTemplateData = (
  content: string,
  data: DocTemplateData,
): string =>
  content.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => {
    const value = data[key];
    return value !== undefined && value !== null ? escapeHtml(String(value)) : '';
  });

export const withGeneratedDocContent = (form: DocTemplate): DocTemplate => ({
  ...form,
  layoutVersion: 1,
  layoutBlocks: normalizeDocLayoutBlocks(form.layoutBlocks ?? []),
  content: renderDocLayout(normalizeDocLayoutBlocks(form.layoutBlocks ?? [])),
});

export const blockTypeLabels: Record<DocLayoutBlock['type'], string> = {
  heading: 'Заголовок',
  paragraph: 'Текст',
  fieldRow: 'Поля (ряд)',
  fieldGrid: 'Поля (сітка)',
  customTable: 'Власна таблиця',
  dataTable: 'Дані (таблиця)',
  signatures: 'Підписи',
  divider: 'Лінія',
  spacer: 'Відступ',
  columns: 'Колонки',
};

export { dataTableKindLabels };
