import {
  applyDocTemplateData,
  createDocTemplate,
  getActiveDocTemplate,
  normalizeDocumentTemplatesConfig,
  renderDocLayout,
} from '@dah/shared';
import { applyDocTokens } from './document-template-pdf';

describe('document template constructor (shared + pdf tokens)', () => {
  it('normalizes defaults with receipt and board report', () => {
    const config = normalizeDocumentTemplatesConfig(undefined);
    expect(getActiveDocTemplate(config, 'receipt').kind).toBe('receipt');
    expect(getActiveDocTemplate(config, 'board_report').kind).toBe('board_report');
    expect(config.exports.some((e) => e.kind === 'debtors')).toBe(true);
  });

  it('applies tokens for PDF plain text', () => {
    expect(applyDocTokens('Кв. {{apartmentNumber}}', { apartmentNumber: '7' })).toBe(
      'Кв. 7',
    );
  });

  it('escapes HTML in preview apply', () => {
    const html = applyDocTemplateData('{{x}}', { x: '<b>1</b>' });
    expect(html).toContain('&lt;b&gt;');
  });

  it('custom template preserves layout blocks', () => {
    const form = createDocTemplate({
      id: 'custom-1',
      kind: 'custom',
      title: 'Test',
    });
    const html = renderDocLayout(form.layoutBlocks);
    expect(html).toContain('doc-document');
    expect(form.layoutBlocks.length).toBeGreaterThan(0);
  });
});
