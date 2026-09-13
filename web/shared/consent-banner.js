// ══════════════════════════════════════════════════════════════
// HUGPONG — Accessible Cookie & Data Storage Consent Manager
// Compliant with Republic Act No. 10173 (Data Privacy Act of 2012)
// ══════════════════════════════════════════════════════════════

(function initCookieConsent() {
  const CONSENT_KEY = 'hugpong_cookie_consent';

  // Check if consent has already been acknowledged
  if (typeof localStorage !== 'undefined' && localStorage.getItem(CONSENT_KEY)) {
    return;
  }

  function renderBanner() {
    // Avoid duplicate banners
    if (document.getElementById('hugpong-consent-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'hugpong-consent-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Data Privacy and Storage Consent Notice');
    banner.className = 'fixed bottom-4 left-4 right-4 sm:left-6 sm:right-6 md:left-auto md:right-8 md:max-w-xl bg-white/95 backdrop-blur-md rounded-2xl border border-[#E2E8DC] p-5 sm:p-6 shadow-[0_12px_40px_rgba(15,81,50,0.15)] z-50 transition-all duration-300 transform translate-y-0 text-hug-text';

    banner.innerHTML = `
      <div class="flex items-start gap-3.5">
        <div class="w-9 h-9 rounded-xl bg-[#E8F5E9] border border-[#0F5132]/20 text-[#0F5132] flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        </div>
        <div class="flex-1 space-y-2">
          <h2 class="text-xs sm:text-sm font-bold text-[#111C14] flex items-center gap-2">
            <span>Data Privacy &amp; Essential Storage Notice</span>
            <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#E8F5E9] text-[#0F5132]">RA 10173</span>
          </h2>
          <p class="text-xs text-[#4A5B45] leading-relaxed">
            HUGPONG uses strictly necessary local storage (session tokens &amp; offline field caches) to maintain agricultural operations. We do <strong>not</strong> use advertising or commercial tracking cookies.
          </p>
          <div class="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <a href="privacy-policy.html" class="font-semibold text-[#0F5132] hover:underline focus:ring-2 focus:ring-[#0F5132] focus:outline-none rounded">
              Privacy Policy
            </a>
            <span class="text-gray-300" aria-hidden="true">•</span>
            <a href="cookie-policy.html" class="font-semibold text-[#0F5132] hover:underline focus:ring-2 focus:ring-[#0F5132] focus:outline-none rounded">
              Storage Details
            </a>
          </div>
        </div>
      </div>
      <div class="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end gap-2.5">
        <button id="hugpong-consent-accept-btn" type="button" class="px-5 py-2.5 rounded-xl bg-[#0F5132] hover:bg-[#198754] text-white text-xs font-bold transition-all shadow-xs focus:ring-2 focus:ring-[#0F5132] focus:ring-offset-2 focus:outline-none cursor-pointer">
          Acknowledge &amp; Accept
        </button>
      </div>
    `;

    document.body.appendChild(banner);

    const acceptBtn = document.getElementById('hugpong-consent-accept-btn');
    if (acceptBtn) {
      acceptBtn.focus();
      acceptBtn.addEventListener('click', function () {
        try {
          localStorage.setItem(CONSENT_KEY, JSON.stringify({
            accepted: true,
            timestamp: new Date().toISOString(),
            version: '2.4'
          }));
        } catch (e) {
          console.warn('[Consent] localStorage unavailable:', e);
        }
        banner.classList.add('opacity-0', 'translate-y-4');
        setTimeout(() => banner.remove(), 300);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderBanner);
  } else {
    renderBanner();
  }
})();
