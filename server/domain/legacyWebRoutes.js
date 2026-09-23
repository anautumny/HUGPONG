'use strict';

const LEGACY_ROLE_DASHBOARD_REDIRECTS = Object.freeze({
  '/roles/farm-manager/dashboard.html': '/dashboard',
  '/roles/sra-admin/dashboard.html': '/dashboard',
  '/roles/super-admin/dashboard.html': '/dashboard'
});

const LEGACY_LEGAL_PAGE_REDIRECTS = Object.freeze({
  '/cookie-policy.html': '/cookies',
  '/privacy-policy.html': '/privacy',
  '/terms-and-conditions.html': '/terms'
});

module.exports = {
  LEGACY_ROLE_DASHBOARD_REDIRECTS,
  LEGACY_LEGAL_PAGE_REDIRECTS
};
