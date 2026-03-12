## JQ33 DESIGN – Production Launch Tasks

### Phase 1 — Route Structure & File Architecture (Launch Foundation)

- [x] **Create clean route folders**
  - [x] Create `/index.html` (migrate from `home-page.html`)
  - [x] Create `/projects/index.html` (migrate from `projects-page`)
  - [x] Create `/projects/bruton-place-iv/index.html` (migrate from `projects-project-page`)
  - [x] Create `/journal/index.html` (migrate from `jornal-page`, fix naming)
  - [x] Create `/journal/reduction-as-creation/index.html` (migrate from `jornal-post-page`)
  - [x] Create `/contact/index.html` (migrate from `contact-page`)
  - [x] Create `/inquiry/index.html` (migrate from `inquiry-page`)

- [x] **Fix global navigation connectivity**
  - [x] Replace all `href="#"` placeholders with real route links
  - [x] Update all `index.html` references to point to actual home route
  - [x] Ensure bidirectional navigation (every page can reach every other page)
  - [x] Remove orphaned pages and broken link targets

### Phase 2 — Shared Design System & Global Shell

- [x] **Extract shared design tokens**
  - [x] Create `/assets/css/site.css` with unified color tokens (`--cobalt`, `--text`, etc.)
  - [x] Standardize typography scale (h1, h2, body, labels) across all pages
  - [x] Create consistent spacing scale (`--space-xs` through `--space-2xl`)
  - [x] Define motion/transition tokens for consistent animations

- [x] **Build reusable footer component**
  - [x] Include contact info, social links, legal links (privacy, terms)
  - [x] Add secondary navigation and copyright
  - [x] Apply identical footer to all pages

### Phase 3 — Brand & Content Alignment

- [x] **Replace SKELETAL STRUCTURES branding**
  - [x] Update all brand marks to "JQ33 DESIGN" consistently
  - [x] Replace ALL contact details with official JQ33 information:
    - [x] Address: `2727 Saint-Patrick St., Montreal, Quebec H3K 0A8`
    - [x] Email: `hello@jq33.design`
    - [x] Phone: `+1 514 473 0075`
  - [x] Update all copy to reflect commercial interior design focus
  - [x] Remove references to "structural reductionism" and industrial design language


### Phase 3.5 — Conversion Plumbing (Calendly + Forms)

- [x] **Calendly integration (Consultation CTA)**
  - [x] Implement Calendly popup modal for the consultation CTA(s) with a no-JS link fallback
  - [x] Add a single `CALENDLY_URL` constant and reuse across all “Book / Schedule” CTAs
  - [x] Ensure CTA works on mobile (popup or fallback to open Calendly link)

- [ ] **Forms: make all forms functional (Formspree)**
  - [ ] Create Formspree forms (recommended: separate endpoints for Inquiry vs Contact)
  - [x] Make `/contact/index.html` submit to Formspree (action/method/field names/submit + success UX)
  - [x] Make `/inquiry/index.html` submit to Formspree (action/method/field names/submit + success UX)
  - [x] Add required fields + proper labels (accessibility) + basic validation
  - [x] Add spam protection baseline (honeypot field and/or Formspree settings)

### Phase 3.6 — Projects at Scale (projects.json + Static Generator)

- [x] **Adopt a data-driven portfolio**
  - [x] Create `data/projects.json` as the source of truth for all projects (aim: 40+)
  - [x] Define image conventions: `assets/projects/<slug>/hero.webp`, `preview.webp`, `g1.webp`...
  - [x] Avoid hotlinking (move Unsplash images to local optimized assets for production)

- [x] **Create project template + generator**
  - [x] Create `projects/_project-template.html` based on the current project detail layout (from `/projects/bruton-place-iv/index.html`)
  - [x] Create `scripts/generate-projects.mjs` (Node) to generate:
    - [x] `/projects/index.html` (projects list page)
    - [x] `/projects/<slug>/index.html` (one detail page per project)
    - [x] Prev/Next project links automatically
  - [x] Migrate the existing “Bruton Place IV” project into `data/projects.json` and have it generated
  - [x] Update the projects list page to link to generated detail pages
  - [x] Ensure each generated project page has unique `<title>`, meta description, canonical, and Open Graph image

- [x] **(Optional) Journal parity**
  - [x] (Optional) Create `data/posts.json` + generator for `/journal/<slug>/index.html` posts and `/journal/index.html` listing

### Phase 4 — SEO & Accessibility Hardening

- [x] **Head meta for all pages**
  - [x] Home: "JQ33 DESIGN | Commercial Interior Design Studio in Montreal"
  - [x] Projects: "Our Work | JQ33 DESIGN Commercial Interior Projects"
  - [x] Journal: "Design Insights | JQ33 DESIGN Blog"
  - [x] Contact: "Contact JQ33 DESIGN | Montreal Interior Design Studio"
  - [x] Add unique `meta name="description"` for each page (150-160 chars)
  - [x] Add `link rel="canonical"` for each page
  - [x] Add Open Graph tags (`og:title`, `og:description`, `og:url`, `og:image`, `og:type`)
  - [x] Add Twitter tags (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`)
  - [x] Add favicon and `apple-touch-icon` links to all pages

- [ ] **Semantic HTML & accessibility**
- [x] Ensure exactly one `<h1>` per page with logical hierarchy
- [x] Add semantic landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`)
- [x] Add proper `<label for="id">` associations for all form fields
- [x] Ensure all images have descriptive `alt` attributes
- [x] Add visible focus states for keyboard navigation
- [ ] Test with screen reader for basic accessibility

- [ ] **Performance optimization**
- [x] Add `loading="lazy"` for below-the-fold images
- [x] Set explicit `width` and `height` attributes for images
  - [x] Optimize/compress heavy background images (WebP/AVIF where possible)
  - [x] Remove unused CSS and JavaScript
  - [x] Test Core Web Vitals (LCP, FID, CLS)

### Phase 5 — Schema & Technical SEO

- [ ] **JSON-LD schema markup**
- [x] Add `Organization` schema for JQ33 DESIGN with Montreal address
- [x] Add `ProfessionalService` schema for commercial interior design
- [x] Add `WebSite` schema with site search potential action
- [x] Add `FAQPage` schema for FAQ sections
- [x] Add `Article` schema for journal posts

- [ ] **Technical infrastructure**
- [x] Create `robots.txt` allowing crawling and pointing to sitemap
- [x] Create `sitemap.xml` with all production routes
  - [x] Set up Google Analytics/GA4 tracking
  - [ ] Verify domain in Google Search Console
  - [ ] Submit sitemap to Search Console

---

### Phase 6 — Pre-Launch QA & Release Gate

- [ ] **Cross-page consistency check**
  - [x] Verify identical header/nav on all pages
  - [x] Verify identical footer on all pages
  - [x] Test all navigation links work correctly
  - [x] Confirm brand consistency (no SKELETAL references remain)
  - [x] Verify contact details are consistent across all pages

- [ ] **Responsive & accessibility testing**
  - [ ] Mobile sweep (320px to 768px)
    - [ ] Home (`/`)
    - [ ] Projects index (`/projects/`)
    - [ ] Project detail (sample: `/projects/bruton-place-iv/`)
    - [ ] Journal index (`/journal/`)
    - [ ] Journal post (sample: `/journal/reduction-as-creation/`)
    - [ ] Inquiry (`/inquiry/`)
    - [ ] Contact (`/contact/`)
    - [ ] Commercial interior landing (`/commercial-interior-design-montreal/`)
    - [ ] Privacy + Terms (`/privacy/`, `/terms/`)
  - [ ] Tablet sweep (768px to 1024px)
    - [ ] Home (`/`)
    - [ ] Projects index (`/projects/`)
    - [ ] Project detail (sample: `/projects/bruton-place-iv/`)
    - [ ] Journal index (`/journal/`)
    - [ ] Journal post (sample: `/journal/reduction-as-creation/`)
    - [ ] Inquiry (`/inquiry/`)
    - [ ] Contact (`/contact/`)
    - [ ] Commercial interior landing (`/commercial-interior-design-montreal/`)
    - [ ] Privacy + Terms (`/privacy/`, `/terms/`)
  - [ ] Keyboard navigation (tab + shift+tab + escape)
    - [ ] Header: logo, primary links, nav toggle open/close
    - [ ] Nav drawer: all links, CTAs, overlay click, escape closes
    - [ ] Forms: inquiry + contact inputs, selects, submit, Calendly CTA
    - [ ] Footer: nav links + social icons
  - [ ] Form validation + submission
    - [ ] Contact: required fields, success message, error state
    - [ ] Inquiry: required fields, success message, error state
    - [ ] Honeypot hidden from tab order
  - [ ] Color contrast (WCAG AA)
    - [ ] Cobalt text on dark backgrounds
    - [ ] Cobalt text on light backgrounds
    - [ ] Placeholder text on inputs
  - Notes: Focus-visible styles added for forms, nav drawer binding hardened, and cobalt text contrast adjusted; manual device sweep still pending.

- [ ] **Performance & technical validation**
  - [ ] Run Lighthouse audit on all pages (aim for 90+ scores)
  - [ ] Validate HTML markup with W3C validator
  - [ ] Test page load speeds and optimize if needed
  - [x] Verify all images have proper alt text
  - [x] Check that all external links open in new tabs

- [ ] **Content & SEO final review**
  - [ ] Proofread all copy for typos and brand voice consistency
  - [ ] Verify all meta descriptions are unique and compelling
  - [ ] Check that all pages have unique, descriptive titles
  - [ ] Ensure JSON-LD schema validates without errors
  - [ ] Test social media sharing (Open Graph/Twitter cards)

---

### Future Phases (Post-Launch)

#### Phase 7 — Dedicated Service Landing Page
- [x] Create `/commercial-interior-design-montreal/index.html`
- [x] Use SEO-optimized copy targeting "commercial interior design Montreal"
- [x] Add location-specific case studies and testimonials
- [x] Implement local business schema markup

#### Phase 8 — Vertical Service Pages
- [ ] `/cafe-interior-design-montreal/` - Coffee shop interiors
- [ ] `/salon-interior-design-montreal/` - Beauty salon interiors  
- [ ] `/clinic-interior-design-montreal/` - Medical/wellness interiors
- [ ] `/retail-interior-design-montreal/` - Boutique/retail interiors
- [ ] `/office-interior-design-montreal/` - Corporate office interiors

#### Phase 9 — Content & Marketing
- [ ] Add more case studies to projects section
- [ ] Create regular journal/blog content
- [ ] Set up email capture and newsletter
- [ ] Implement contact form with proper backend processing
- [ ] Add client testimonials and reviews

---

## Launch Criteria (Must Pass Before Going Live)

### P0 - Critical (Must Fix)
- [ ] All navigation links work (no 404s or placeholder links)
- [ ] All pages have proper meta tags and titles
- [ ] All pages have consistent header and footer
- [ ] Brand is consistently JQ33 DESIGN (no SKELETAL references)
- [ ] Contact information is accurate and consistent
- [ ] Site is mobile-responsive on all pages
- [ ] Forms have proper labels and validation

### P1 - Important (Should Fix)
- [ ] All images have alt text
- [ ] Page load speeds are acceptable (< 3 seconds)
- [ ] Social media sharing works correctly
- [ ] Analytics tracking is implemented
- [ ] Search Console is set up and sitemap submitted

### P2 - Nice to Have (Can Fix Post-Launch)
- [ ] Perfect Lighthouse scores
- [ ] Advanced schema markup
- [ ] Image optimization (WebP/AVIF)
- [ ] Advanced performance optimizations