import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getInstructionsForRole,
  getInstructionsHref,
  INSTRUCTIONS_NAV_LABEL,
} from './instructions-content';

describe('super_admin instructions', () => {
  it('uk content covers org, users/names, roles catalog', () => {
    const content = getInstructionsForRole('super_admin', 'uk');
    assert.match(content.title, /системного адміністратора/i);
    assert.ok(content.sections.length >= 4);

    const blob = [content.intro, ...content.sections.flatMap((s) => [s.title, ...s.items])].join(
      '\n',
    );
    assert.match(blob, /Організац/i);
    assert.match(blob, /Імʼя|імʼя/i);
    assert.match(blob, /роль/i);
    assert.match(blob, /Додати роль|каталог ролей/i);
    assert.match(blob, /Деактивув/i);
    assert.match(blob, /Видалити/i);
  });

  it('ru mirrors structure of uk', () => {
    const uk = getInstructionsForRole('super_admin', 'uk');
    const ru = getInstructionsForRole('super_admin', 'ru');
    assert.match(ru.title, /системного администратора/i);
    assert.equal(ru.sections.length, uk.sections.length);
    uk.sections.forEach((s, i) => {
      assert.equal(ru.sections[i].items.length, s.items.length);
    });
  });

  it('nav label and href for admin instructions', () => {
    assert.ok(INSTRUCTIONS_NAV_LABEL.length > 0);
    assert.equal(getInstructionsHref('super_admin'), '/admin/instructions');
  });
});
