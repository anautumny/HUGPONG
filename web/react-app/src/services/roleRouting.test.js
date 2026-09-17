import { describe, expect, it } from 'vitest';
import { normalizeRole, roleKeyFromUser, roleLabel, workspaceGuardDestination, workspacePath, workspaceSlug } from './roleRouting';

describe('canonical React role routing', () => {
  it.each([
    ['Super Admin', 'superadmin', 'super-admin', 'Super Admin'],
    ['super-admin', 'superadmin', 'super-admin', 'Super Admin'],
    ['SRA_ADMIN', 'admin', 'sra-admin', 'SRA Admin'],
    ['Farm Manager', 'manager', 'farm-manager', 'Farm Manager'],
    ['MEMBER_FARMER', 'member', 'member', 'Member Farmer']
  ])('normalizes %s to one role and React workspace', (role, key, slug, label) => {
    expect(normalizeRole(role)).toBe(key);
    expect(roleKeyFromUser({ role })).toBe(key);
    expect(workspaceSlug(role)).toBe(slug);
    expect(workspacePath(role)).toBe(`/workspace/${slug}`);
    expect(workspacePath(role, 'overview')).toBe(`/workspace/${slug}/overview`);
    expect(roleLabel(role)).toBe(label);
  });

  it('routes Member Farmer to a guarded React route rather than a legacy page', () => {
    expect(workspacePath('Member Farmer')).toBe('/workspace/member');
  });

  it('redirects a wrong role URL once and accepts the canonical destination', () => {
    expect(workspaceGuardDestination('Super Admin', 'sra-admin')).toBe('/workspace/super-admin');
    expect(workspaceGuardDestination('Super Admin', 'super-admin')).toBeNull();
  });
});
