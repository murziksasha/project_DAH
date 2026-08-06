/** Document / print template kinds for housing (ОСББ / УК). */
export type DocTemplateKind = 'receipt' | 'board_report' | 'custom';

export type DocLayoutTextAlign = 'left' | 'center' | 'right';
export type DocLayoutTextWeight = 'light' | 'normal' | 'bold';

export type DocLayoutField = {
  label: string;
  value: string;
};

export type DocLayoutTableColumn = {
  id: string;
  label: string;
};

export type DocLayoutTableRow = {
  id: string;
  cells: Record<string, string>;
};

/**
 * Dynamic data tables filled at render time from backend context.
 * Static `customTable` holds editor-defined rows; these are live data.
 */
export type DocDataTableKind =
  | 'fund_balances'
  | 'expenses_by_category'
  | 'debtors'
  | 'payment_lines';

export type DocLayoutBlock =
  | {
      id: string;
      type: 'heading';
      text: string;
      level: 1 | 2 | 3;
      align?: DocLayoutTextAlign;
      weight?: DocLayoutTextWeight;
    }
  | {
      id: string;
      type: 'paragraph';
      text: string;
      level: 1 | 2 | 3;
      align?: DocLayoutTextAlign;
      weight?: DocLayoutTextWeight;
    }
  | {
      id: string;
      type: 'fieldRow';
      fields: DocLayoutField[];
    }
  | {
      id: string;
      type: 'fieldGrid';
      fields: DocLayoutField[];
      columns?: 2 | 3 | 4;
    }
  | {
      id: string;
      type: 'customTable';
      columns: DocLayoutTableColumn[];
      rows: DocLayoutTableRow[];
    }
  | {
      id: string;
      type: 'dataTable';
      kind: DocDataTableKind;
      title?: string;
    }
  | {
      id: string;
      type: 'signatures';
      left: string;
      right: string;
    }
  | {
      id: string;
      type: 'divider';
    }
  | {
      id: string;
      type: 'spacer';
      size: 'small' | 'medium' | 'large';
    }
  | {
      id: string;
      type: 'columns';
      columns: Array<{
        id: string;
        blocks: DocLayoutBlock[];
      }>;
    };

export type DocTemplate = {
  id: string;
  title: string;
  kind: DocTemplateKind;
  /** Layout v1 block tree (source of truth). */
  layoutVersion: 1;
  layoutBlocks: DocLayoutBlock[];
  pageSize: 'A4';
  orientation: 'portrait' | 'landscape';
  isActive: boolean;
  sortOrder: number;
  /** Generated HTML shell for browser preview (optional cache). */
  content?: string;
};

/** Excel / tabular export column constructor. */
export type ExportFieldDef = {
  key: string;
  label: string;
  enabled: boolean;
};

export type ExportProfileKind = 'debtors' | 'cash_flow' | 'expenses' | 'statement' | 'export_pack';

export type ExportProfile = {
  id: string;
  title: string;
  kind: ExportProfileKind;
  fields: ExportFieldDef[];
  isActive: boolean;
  sortOrder: number;
};

/** Stored under Building.settings.documentTemplates */
export type DocumentTemplatesConfig = {
  forms: DocTemplate[];
  exports: ExportProfile[];
};

export type DocTemplateData = Record<string, string | undefined>;

/** Optional HTML fragments for special data tables (preview / PDF bridge). */
export type DocTemplateTableHtml = Partial<Record<DocDataTableKind, string>>;
