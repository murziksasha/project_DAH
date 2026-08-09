import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getNavGroups, getNavItems } from './nav-config';
import { INSTRUCTIONS_NAV_LABEL, getInstructionsHref } from './instructions-content';

describe('super_admin nav', () => {
  it('includes tenants, organization, instructions; setup only when not initialized', () => {
    const unfinished = getNavGroups('super_admin', false);
    assert.equal(unfinished.length, 1);
    assert.equal(unfinished[0].id, 'setup');
    const hrefs = unfinished[0].items.map((i) => i.href);
    assert.ok(hrefs.includes('/admin/setup'));
    assert.ok(hrefs.includes('/admin/tenants'));
    assert.ok(hrefs.includes('/admin/organization'));
    assert.ok(hrefs.includes(getInstructionsHref('super_admin')));
    assert.ok(unfinished[0].items.some((i) => i.label === INSTRUCTIONS_NAV_LABEL));
  });

  it('hides setup wizard when organization is initialized', () => {
    const items = getNavItems('super_admin', true);
    assert.equal(
      items.some((i) => i.href === '/admin/setup'),
      false,
    );
    const hrefs = items.map((i) => i.href);
    assert.ok(hrefs.includes('/admin/tenants'));
    assert.ok(hrefs.includes('/admin/organization'));
    assert.ok(hrefs.includes('/admin/instructions'));
  });

  it('does not expose finance routes for super_admin', () => {
    const hrefs = getNavItems('super_admin', true).map((i) => i.href);
    assert.equal(
      hrefs.some((h) => h.includes('expenses') || h.includes('accruals') || h.includes('payments')),
      false,
    );
  });
});
