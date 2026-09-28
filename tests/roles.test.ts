// Staff role resolution — see src/lib/roles.ts
//
// The invariant under test: the client's notion of "admin" and the database's must not
// diverge. Before this module, AuthContext read `profiles.role` while the admin panel
// wrote `profiles.is_admin` and every RLS policy read both, so a promoted user passed
// server-side checks while the UI still treated them as a normal user.
import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import {
  deriveIsAdmin,
  deriveIsModerator,
  deriveIsStaff,
  adminRolePatch,
  moderatorRolePatch,
  type StaffRoleSource,
} from '../src/lib/roles';

/** Arbitrary profile-shaped role source, including the tri-state nulls Postgres emits. */
const roleSource = fc.record({
  is_admin: fc.oneof(fc.boolean(), fc.constant(null), fc.constant(undefined)),
  is_moderator: fc.oneof(fc.boolean(), fc.constant(null), fc.constant(undefined)),
  role: fc.oneof(
    fc.constantFrom('admin', 'moderator', 'user', ''),
    fc.string(),
    fc.constant(null),
    fc.constant(undefined)
  ),
}) as fc.Arbitrary<StaffRoleSource>;

const apply = (base: StaffRoleSource, patch: Record<string, unknown>): StaffRoleSource =>
  ({ ...base, ...patch }) as StaffRoleSource;

describe('deriveIsAdmin', () => {
  test('matches the RLS expression is_admin = true OR role = \'admin\'', () => {
    fc.assert(
      fc.property(roleSource, (source) => {
        const expected = source.is_admin === true || source.role === 'admin';
        return deriveIsAdmin(source) === expected;
      }),
      { numRuns: 300 }
    );
  });

  test('treats a missing source as not admin', () => {
    expect(deriveIsAdmin(null)).toBe(false);
    expect(deriveIsAdmin(undefined)).toBe(false);
    expect(deriveIsAdmin({})).toBe(false);
  });

  test('does not accept truthy non-true values', () => {
    // `is_admin` arrives as a real boolean or null; anything else is a schema surprise
    // and must not silently grant staff access.
    expect(deriveIsAdmin({ is_admin: 1 as unknown as boolean })).toBe(false);
    expect(deriveIsAdmin({ role: 'Admin' })).toBe(false);
    expect(deriveIsAdmin({ role: 'superadmin' })).toBe(false);
  });
});

describe('deriveIsModerator', () => {
  test('every admin is a moderator', () => {
    fc.assert(
      fc.property(roleSource, (source) => !deriveIsAdmin(source) || deriveIsModerator(source)),
      { numRuns: 300 }
    );
  });

  test('matches the RLS expression', () => {
    fc.assert(
      fc.property(roleSource, (source) => {
        const expected =
          source.is_admin === true ||
          source.role === 'admin' ||
          source.is_moderator === true ||
          source.role === 'moderator';
        return deriveIsModerator(source) === expected;
      }),
      { numRuns: 300 }
    );
  });

  test('deriveIsStaff agrees with deriveIsModerator', () => {
    fc.assert(
      fc.property(roleSource, (source) => deriveIsStaff(source) === deriveIsModerator(source)),
      { numRuns: 200 }
    );
  });
});

describe('adminRolePatch', () => {
  test('promotion always yields an admin, whatever the prior role', () => {
    fc.assert(
      fc.property(roleSource, (source) =>
        deriveIsAdmin(apply(source, adminRolePatch(true, source.role)))
      ),
      { numRuns: 300 }
    );
  });

  test('promotion writes both representations, so has_role and the client agree', () => {
    const patch = adminRolePatch(true);
    expect(patch.is_admin).toBe(true);
    expect(patch.role).toBe('admin');
  });

  test('demotion always yields a non-admin', () => {
    fc.assert(
      fc.property(roleSource, (source) =>
        !deriveIsAdmin(apply(source, adminRolePatch(false, source.role)))
      ),
      { numRuns: 300 }
    );
  });

  test('promote then demote returns to non-admin', () => {
    fc.assert(
      fc.property(roleSource, (source) => {
        const promoted = apply(source, adminRolePatch(true, source.role));
        const demoted = apply(promoted, adminRolePatch(false, promoted.role));
        return !deriveIsAdmin(demoted);
      }),
      { numRuns: 300 }
    );
  });

  test('demotion leaves an unrelated role value alone', () => {
    expect(adminRolePatch(false, 'moderator').role).toBe('moderator');
    expect(adminRolePatch(false, 'admin').role).toBe('user');
    expect(adminRolePatch(false, null).role).toBe('user');
  });
});

describe('moderatorRolePatch', () => {
  test('promotion always yields a moderator', () => {
    fc.assert(
      fc.property(roleSource, (source) =>
        deriveIsModerator(apply(source, moderatorRolePatch(true, source.role)))
      ),
      { numRuns: 300 }
    );
  });

  test('promotion never strips an existing admin', () => {
    fc.assert(
      fc.property(roleSource, (source) => {
        const patched = apply(source, moderatorRolePatch(true, source.role));
        return !deriveIsAdmin(source) || deriveIsAdmin(patched);
      }),
      { numRuns: 300 }
    );
  });

  test('demotion never strips an existing admin', () => {
    // The old implementation wrote `role: 'user'` unconditionally, which demoted an
    // admin to a plain user via the moderator toggle.
    fc.assert(
      fc.property(roleSource, (source) => {
        const patched = apply(source, moderatorRolePatch(false, source.role));
        return !deriveIsAdmin(source) || deriveIsAdmin(patched);
      }),
      { numRuns: 300 }
    );
  });

  test('demotion clears moderator status for non-admins', () => {
    fc.assert(
      fc.property(roleSource, (source) => {
        const patched = apply(source, moderatorRolePatch(false, source.role));
        return deriveIsAdmin(source) || !deriveIsModerator(patched);
      }),
      { numRuns: 300 }
    );
  });
});
