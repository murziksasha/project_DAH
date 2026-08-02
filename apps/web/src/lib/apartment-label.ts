/** Shared shapes returned by GET /building/apartments (users + residents). */

export interface ApartmentPerson {
  firstName: string;
  lastName: string;
}

export interface ApartmentUserLink extends ApartmentPerson {
  id?: string;
  email?: string;
  status?: string;
  isPrimary?: boolean;
}

export interface ApartmentResident extends ApartmentPerson {
  isOwner?: boolean;
}

export interface ApartmentLabelSource {
  number: string;
  users?: ApartmentUserLink[] | null;
  residents?: ApartmentResident[] | null;
}

function personName(p: ApartmentPerson): string {
  return `${p.lastName} ${p.firstName}`.trim();
}

/**
 * Pick display name for apartment owner / registered resident:
 * 1) active linked user (primary first)
 * 2) any linked user
 * 3) resident (owner first)
 */
export function apartmentOwnerName(a: ApartmentLabelSource): string | null {
  const users = a.users ?? [];
  if (users.length) {
    const sorted = [...users].sort((x, y) => {
      const ap = x.isPrimary ? 0 : 1;
      const bp = y.isPrimary ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const aa = x.status === 'active' ? 0 : 1;
      const ba = y.status === 'active' ? 0 : 1;
      return aa - ba;
    });
    const active = sorted.find((u) => u.status === 'active');
    const pick = active ?? sorted[0];
    if (pick) {
      const n = personName(pick);
      if (n) return n;
    }
  }

  const residents = a.residents ?? [];
  if (residents.length) {
    const owner = residents.find((r) => r.isOwner) ?? residents[0];
    const n = personName(owner);
    if (n) return n;
  }

  return null;
}

/** e.g. `кв. 107 · Петренко Іван` or `кв. 107` */
export function formatApartmentOption(a: ApartmentLabelSource, aptPrefix = 'кв.'): string {
  const name = apartmentOwnerName(a);
  const base = `${aptPrefix} ${a.number}`;
  return name ? `${base} · ${name}` : base;
}
