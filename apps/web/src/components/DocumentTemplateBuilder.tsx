'use client';

import { useMemo, useState } from 'react';
import {
  applyDocTemplateData,
  blockTypeLabels,
  createDocLayoutBlock,
  createDocTemplate,
  dataTableKindLabels,
  renderDocLayout,
  sampleBoardReportData,
  sampleBoardTableHtml,
  sampleReceiptData,
  variableGroupsForKind,
  withGeneratedDocContent,
  type DocDataTableKind,
  type DocLayoutBlock,
  type DocLayoutField,
  type DocTemplate,
  type DocTemplateKind,
  type DocumentTemplatesConfig,
  type ExportProfile,
} from '@dah/shared';

type Props = {
  config: DocumentTemplatesConfig;
  onChange: (next: DocumentTemplatesConfig) => void;
};

const kindLabels: Record<DocTemplateKind, string> = {
  receipt: 'Квитанція',
  board_report: 'Звіт правління',
  custom: 'Довільний',
};

const blockInsertOptions: DocLayoutBlock['type'][] = [
  'heading',
  'paragraph',
  'fieldRow',
  'fieldGrid',
  'customTable',
  'dataTable',
  'signatures',
  'divider',
  'spacer',
  'columns',
];

const dataTableKinds: DocDataTableKind[] = [
  'fund_balances',
  'expenses_by_category',
  'debtors',
  'payment_lines',
];

function cloneBlock(block: DocLayoutBlock): DocLayoutBlock {
  return JSON.parse(JSON.stringify(block)) as DocLayoutBlock;
}

function regenerate(form: DocTemplate, blocks: DocLayoutBlock[]): DocTemplate {
  return withGeneratedDocContent({ ...form, layoutBlocks: blocks });
}

function previewDataFor(kind: DocTemplateKind) {
  if (kind === 'board_report') return sampleBoardReportData;
  return sampleReceiptData;
}

function previewTablesFor(kind: DocTemplateKind) {
  if (kind === 'board_report') return sampleBoardTableHtml;
  return undefined;
}

function VariablePicker({
  kind,
  onInsert,
}: {
  kind: DocTemplateKind;
  onInsert: (token: string) => void;
}) {
  const groups = variableGroupsForKind(kind);
  return (
    <div className="doc-var-catalog">
      <strong className="doc-var-title">Змінні (клік — вставити)</strong>
      <div className="doc-var-grid">
        {groups.map((group) => (
          <div key={group.title} className="doc-var-group">
            <div className="doc-var-group-title">{group.title}</div>
            {group.variables.map((v) => (
              <button
                key={v.key}
                type="button"
                className="doc-var-row"
                onClick={() => onInsert(`{{${v.key}}}`)}
                title={v.label}
              >
                <code>{`{{${v.key}}}`}</code>
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldListEditor({
  fields,
  onChange,
}: {
  fields: DocLayoutField[];
  onChange: (fields: DocLayoutField[]) => void;
}) {
  return (
    <div className="doc-field-list">
      {fields.map((field, index) => (
        <div key={index} className="doc-field-row">
          <input
            aria-label={`Мітка ${index + 1}`}
            value={field.label}
            placeholder="Мітка"
            onChange={(e) => {
              const next = fields.map((f, i) =>
                i === index ? { ...f, label: e.target.value } : f,
              );
              onChange(next);
            }}
          />
          <input
            aria-label={`Значення ${index + 1}`}
            value={field.value}
            placeholder="{{balance}}"
            onChange={(e) => {
              const next = fields.map((f, i) =>
                i === index ? { ...f, value: e.target.value } : f,
              );
              onChange(next);
            }}
          />
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => onChange(fields.filter((_, i) => i !== index))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() =>
          onChange([...fields, { label: 'Поле', value: '{{buildingName}}' }])
        }
      >
        + Поле
      </button>
    </div>
  );
}

function BlockEditor({
  block,
  kind,
  onChange,
}: {
  block: DocLayoutBlock;
  kind: DocTemplateKind;
  onChange: (block: DocLayoutBlock) => void;
}) {
  const appendText = (token: string) => {
    if (block.type === 'heading' || block.type === 'paragraph') {
      onChange({ ...block, text: `${block.text}${token}` });
    }
  };

  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return (
        <div className="doc-block-fields">
          {block.type === 'paragraph' ? (
            <textarea
              rows={3}
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          ) : (
            <input
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          )}
          <div className="doc-block-options">
            <label>
              Рівень
              <select
                value={block.level}
                onChange={(e) =>
                  onChange({
                    ...block,
                    level: Number(e.target.value) as 1 | 2 | 3,
                  })
                }
              >
                <option value={1}>H1</option>
                <option value={2}>H2</option>
                <option value={3}>H3</option>
              </select>
            </label>
            <label>
              Вирівн.
              <select
                value={block.align ?? 'left'}
                onChange={(e) =>
                  onChange({
                    ...block,
                    align: e.target.value as 'left' | 'center' | 'right',
                  })
                }
              >
                <option value="left">Ліворуч</option>
                <option value="center">Центр</option>
                <option value="right">Праворуч</option>
              </select>
            </label>
            <label>
              Товщина
              <select
                value={block.weight ?? 'normal'}
                onChange={(e) =>
                  onChange({
                    ...block,
                    weight: e.target.value as 'light' | 'normal' | 'bold',
                  })
                }
              >
                <option value="light">Тонкий</option>
                <option value="normal">Звичайний</option>
                <option value="bold">Жирний</option>
              </select>
            </label>
          </div>
          <VariablePicker kind={kind} onInsert={appendText} />
        </div>
      );
    case 'fieldRow':
    case 'fieldGrid':
      return (
        <div className="doc-block-fields">
          {block.type === 'fieldGrid' && (
            <label>
              Колонок
              <select
                value={block.columns ?? 2}
                onChange={(e) =>
                  onChange({
                    ...block,
                    columns: Number(e.target.value) as 2 | 3 | 4,
                  })
                }
              >
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>
          )}
          <FieldListEditor
            fields={block.fields}
            onChange={(fields) => onChange({ ...block, fields })}
          />
          <VariablePicker
            kind={kind}
            onInsert={(token) =>
              onChange({
                ...block,
                fields: [...block.fields, { label: 'Поле', value: token }],
              })
            }
          />
        </div>
      );
    case 'dataTable':
      return (
        <div className="doc-block-fields">
          <label>
            Заголовок таблиці
            <input
              value={block.title ?? ''}
              onChange={(e) => onChange({ ...block, title: e.target.value })}
            />
          </label>
          <label>
            Джерело даних
            <select
              value={block.kind}
              onChange={(e) =>
                onChange({
                  ...block,
                  kind: e.target.value as DocDataTableKind,
                })
              }
            >
              {dataTableKinds.map((k) => (
                <option key={k} value={k}>
                  {dataTableKindLabels[k] ?? k}
                </option>
              ))}
            </select>
          </label>
          <p className="doc-hint">
            Таблиця заповнюється автоматично під час генерації PDF (фонди, витрати, боржники).
          </p>
        </div>
      );
    case 'customTable':
      return (
        <div className="doc-block-fields">
          <p className="doc-hint">Власна таблиця з фіксованими рядками / змінними.</p>
          {block.columns.map((col, ci) => (
            <input
              key={col.id}
              value={col.label}
              onChange={(e) => {
                const columns = block.columns.map((c, i) =>
                  i === ci ? { ...c, label: e.target.value } : c,
                );
                onChange({ ...block, columns });
              }}
              placeholder={`Колонка ${ci + 1}`}
            />
          ))}
          {block.rows.map((row, ri) => (
            <div key={row.id} className="doc-field-row">
              {block.columns.map((col) => (
                <input
                  key={col.id}
                  value={row.cells[col.id] ?? ''}
                  onChange={(e) => {
                    const rows = block.rows.map((r, i) =>
                      i === ri
                        ? {
                            ...r,
                            cells: { ...r.cells, [col.id]: e.target.value },
                          }
                        : r,
                    );
                    onChange({ ...block, rows });
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      );
    case 'signatures':
      return (
        <div className="doc-block-fields">
          <label>
            Ліворуч
            <input
              value={block.left}
              onChange={(e) => onChange({ ...block, left: e.target.value })}
            />
          </label>
          <label>
            Праворуч
            <input
              value={block.right}
              onChange={(e) => onChange({ ...block, right: e.target.value })}
            />
          </label>
        </div>
      );
    case 'spacer':
      return (
        <label>
          Розмір відступу
          <select
            value={block.size}
            onChange={(e) =>
              onChange({
                ...block,
                size: e.target.value as 'small' | 'medium' | 'large',
              })
            }
          >
            <option value="small">Малий</option>
            <option value="medium">Середній</option>
            <option value="large">Великий</option>
          </select>
        </label>
      );
    case 'divider':
      return <p className="doc-hint">Горизонтальна лінія-розділювач.</p>;
    case 'columns':
      return (
        <p className="doc-hint">
          Дві колонки (у PDF рендеряться послідовно для стабільності кирилиці).
        </p>
      );
    default:
      return null;
  }
}

function FormsTab({ config, onChange }: Props) {
  const [selectedId, setSelectedId] = useState(config.forms[0]?.id ?? '');
  const [insertType, setInsertType] = useState<DocLayoutBlock['type']>('paragraph');
  const selected =
    config.forms.find((f) => f.id === selectedId) ?? config.forms[0] ?? null;

  const previewHtml = useMemo(() => {
    if (!selected) return '';
    const raw = renderDocLayout(
      selected.layoutBlocks,
      previewTablesFor(selected.kind),
    );
    return applyDocTemplateData(raw, previewDataFor(selected.kind));
  }, [selected]);

  function updateForm(formId: string, patch: Partial<DocTemplate>) {
    onChange({
      ...config,
      forms: config.forms.map((f) =>
        f.id === formId
          ? withGeneratedDocContent({ ...f, ...patch })
          : f,
      ),
    });
  }

  function updateBlocks(blocks: DocLayoutBlock[]) {
    if (!selected) return;
    updateForm(selected.id, regenerate(selected, blocks));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    if (!selected) return;
    const blocks = [...selected.layoutBlocks];
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    updateBlocks(blocks);
  }

  function addForm() {
    const form = createDocTemplate({
      kind: 'custom',
      title: 'Новий шаблон',
      sortOrder: (config.forms.at(-1)?.sortOrder ?? 0) + 10,
    });
    onChange({ ...config, forms: [...config.forms, form] });
    setSelectedId(form.id);
  }

  function deleteForm() {
    if (!selected) return;
    if (selected.id === 'receipt' || selected.id === 'board_report') {
      if (
        !window.confirm(
          'Це системний шаблон. Краще вимкнути (isActive) або скинути блоки. Все одно видалити?',
        )
      ) {
        return;
      }
    }
    const next = config.forms.filter((f) => f.id !== selected.id);
    onChange({ ...config, forms: next });
    setSelectedId(next[0]?.id ?? '');
  }

  if (!selected) {
    return (
      <div className="card">
        <p>Немає шаблонів.</p>
        <button type="button" className="btn" onClick={addForm}>
          Створити шаблон
        </button>
      </div>
    );
  }

  return (
    <div className="doc-builder-grid">
      <aside className="doc-builder-list card">
        <div className="doc-builder-list-head">
          <h2>Шаблони PDF</h2>
          <button type="button" className="btn btn-sm" onClick={addForm}>
            +
          </button>
        </div>
        <ul className="doc-form-list">
          {config.forms.map((form) => (
            <li key={form.id}>
              <button
                type="button"
                className={
                  form.id === selected.id
                    ? 'doc-form-item doc-form-item-active'
                    : 'doc-form-item'
                }
                onClick={() => setSelectedId(form.id)}
              >
                <strong>{form.title}</strong>
                <small>
                  {kindLabels[form.kind]}
                  {!form.isActive ? ' · вимкнено' : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="doc-builder-editor card">
        <div className="doc-builder-meta">
          <label>
            Назва
            <input
              value={selected.title}
              onChange={(e) => updateForm(selected.id, { title: e.target.value })}
            />
          </label>
          <label>
            Тип
            <select
              value={selected.kind}
              onChange={(e) =>
                updateForm(selected.id, {
                  kind: e.target.value as DocTemplateKind,
                })
              }
            >
              {(Object.keys(kindLabels) as DocTemplateKind[]).map((k) => (
                <option key={k} value={k}>
                  {kindLabels[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="doc-check">
            <input
              type="checkbox"
              checked={selected.isActive}
              onChange={(e) =>
                updateForm(selected.id, { isActive: e.target.checked })
              }
            />
            Активний (використовується при генерації)
          </label>
          <button type="button" className="btn btn-sm btn-ghost" onClick={deleteForm}>
            Видалити
          </button>
        </div>

        <div className="doc-insert-row">
          <select
            value={insertType}
            onChange={(e) =>
              setInsertType(e.target.value as DocLayoutBlock['type'])
            }
          >
            {blockInsertOptions.map((t) => (
              <option key={t} value={t}>
                {blockTypeLabels[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const block = createDocLayoutBlock(insertType);
              updateBlocks([...selected.layoutBlocks, block]);
            }}
          >
            Додати блок
          </button>
        </div>

        <div className="doc-blocks">
          {selected.layoutBlocks.map((block, index) => (
            <div key={block.id} className="doc-block-card">
              <div className="doc-block-toolbar">
                <strong>{blockTypeLabels[block.type]}</strong>
                <div className="doc-block-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => moveBlock(index, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => moveBlock(index, 1)}
                    disabled={index === selected.layoutBlocks.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      const copy = cloneBlock(block);
                      copy.id = `${block.type}-${Date.now()}`;
                      const blocks = [...selected.layoutBlocks];
                      blocks.splice(index + 1, 0, copy);
                      updateBlocks(blocks);
                    }}
                  >
                    Дубль
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() =>
                      updateBlocks(
                        selected.layoutBlocks.filter((_, i) => i !== index),
                      )
                    }
                  >
                    ✕
                  </button>
                </div>
              </div>
              <BlockEditor
                block={block}
                kind={selected.kind}
                onChange={(next) => {
                  const blocks = selected.layoutBlocks.map((b, i) =>
                    i === index ? next : b,
                  );
                  updateBlocks(blocks);
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="doc-builder-preview card">
        <h2>Попередній перегляд</h2>
        <p className="doc-hint">
          Демо-дані. Реальні PDF генеруються на сервері з даних нарахування / звіту.
        </p>
        <div
          className="doc-preview-page"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </section>
    </div>
  );
}

function ExportsTab({ config, onChange }: Props) {
  const [selectedId, setSelectedId] = useState(config.exports[0]?.id ?? '');
  const selected =
    config.exports.find((e) => e.id === selectedId) ?? config.exports[0] ?? null;

  function updateExport(id: string, patch: Partial<ExportProfile>) {
    onChange({
      ...config,
      exports: config.exports.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  }

  if (!selected) {
    return <div className="card">Немає профілів експорту.</div>;
  }

  return (
    <div className="doc-export-grid">
      <aside className="card">
        <h2>Excel / вигрузки</h2>
        <ul className="doc-form-list">
          {config.exports.map((profile) => (
            <li key={profile.id}>
              <button
                type="button"
                className={
                  profile.id === selected.id
                    ? 'doc-form-item doc-form-item-active'
                    : 'doc-form-item'
                }
                onClick={() => setSelectedId(profile.id)}
              >
                <strong>{profile.title}</strong>
                <small>{profile.kind}</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="card">
        <label>
          Назва профілю
          <input
            value={selected.title}
            onChange={(e) => updateExport(selected.id, { title: e.target.value })}
          />
        </label>
        <label className="doc-check">
          <input
            type="checkbox"
            checked={selected.isActive}
            onChange={(e) =>
              updateExport(selected.id, { isActive: e.target.checked })
            }
          />
          Активний
        </label>
        <h3 style={{ marginTop: '1rem', fontSize: '0.95rem' }}>
          Поля / колонки (увімкніть потрібні)
        </h3>
        <p className="doc-hint">
          Для пакету ZIP — що включати у вигрузку. Для таблиць — які колонки показувати в Excel.
        </p>
        <ul className="doc-export-fields">
          {selected.fields.map((field, index) => (
            <li key={field.key}>
              <label className="doc-check">
                <input
                  type="checkbox"
                  checked={field.enabled}
                  onChange={(e) => {
                    const fields = selected.fields.map((f, i) =>
                      i === index ? { ...f, enabled: e.target.checked } : f,
                    );
                    updateExport(selected.id, { fields });
                  }}
                />
                <span>
                  <strong>{field.label}</strong>
                  <code style={{ marginLeft: 8, opacity: 0.7 }}>{field.key}</code>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function DocumentTemplateBuilder({ config, onChange }: Props) {
  const [tab, setTab] = useState<'forms' | 'exports'>('forms');

  return (
    <div className="doc-builder">
      <div className="doc-builder-tabs">
        <button
          type="button"
          className={tab === 'forms' ? 'btn btn-sm' : 'btn btn-sm btn-ghost'}
          onClick={() => setTab('forms')}
        >
          PDF-документи
        </button>
        <button
          type="button"
          className={tab === 'exports' ? 'btn btn-sm' : 'btn btn-sm btn-ghost'}
          onClick={() => setTab('exports')}
        >
          Excel / звіти
        </button>
      </div>
      {tab === 'forms' ? (
        <FormsTab config={config} onChange={onChange} />
      ) : (
        <ExportsTab config={config} onChange={onChange} />
      )}
    </div>
  );
}
