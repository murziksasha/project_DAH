import { UserRole, VoteWeightMode } from '../../prisma/client';
import { MEETING_VOTER_ROLES, apartmentVoteWeight } from './meetings.service';

describe('meeting vote weight (H3)', () => {
  it('one vote per apartment unless by_area', () => {
    expect(apartmentVoteWeight(VoteWeightMode.one_per_apartment, 80)).toBe(1);
    expect(apartmentVoteWeight(VoteWeightMode.by_area, 80.5)).toBe(80.5);
    expect(apartmentVoteWeight(VoteWeightMode.by_area, null)).toBe(0);
  });

  it('only owners / board members may vote', () => {
    expect(MEETING_VOTER_ROLES.has(UserRole.resident)).toBe(true);
    expect(MEETING_VOTER_ROLES.has(UserRole.accountant)).toBe(false);
    expect(MEETING_VOTER_ROLES.has(UserRole.super_admin)).toBe(false);
  });
});
