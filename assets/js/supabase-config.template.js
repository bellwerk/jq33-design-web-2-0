(() => {
  window.JQ33 = window.JQ33 || {};

  window.JQ33.SUPABASE_URL = __SUPABASE_URL__;
  window.JQ33.SUPABASE_ANON_KEY = __SUPABASE_ANON_KEY__;

  // Optional override for the lead intake function URL.
  window.JQ33.LEAD_FUNCTION_URL = __LEAD_FUNCTION_URL__;

  // Optional override for the admin upload function URL.
  window.JQ33.ADMIN_UPLOAD_FUNCTION_URL = __ADMIN_UPLOAD_FUNCTION_URL__;

  // Optional Formspree endpoints (one per form).
  window.JQ33.FORMSPREE_CONTACT_URL = __FORMSPREE_CONTACT_URL__;
  window.JQ33.FORMSPREE_INQUIRY_URL = __FORMSPREE_INQUIRY_URL__;
  window.JQ33.FORM_FALLBACK_ENABLED = __FORM_FALLBACK_ENABLED__;

  // Optional Google Analytics 4 measurement ID (e.g., G-XXXXXXXXXX).
  window.JQ33.GA_MEASUREMENT_ID = __GA_MEASUREMENT_ID__;
})();
