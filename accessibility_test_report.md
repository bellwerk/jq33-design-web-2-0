# Accessibility & Responsive Layout Test Report

**Test Date:** March 10, 2026  
**Site URL:** http://localhost:5173  
**Pages Tested:** 8  
**Viewports Tested:** 3 (Mobile 360x780, Tablet 768x1024, Small Laptop 1024x768)

---

## Status Update (Mar 10, 2026)

Fixes applied since this report was generated:
- Updated cobalt text color for WCAG AA contrast on dark backgrounds.
- Strengthened mobile nav drawer binding (handles delayed DOM mount).
- Added `:focus-visible` outlines for form inputs.
- Adjusted journal project-number styling for readability.
- Updated cobalt-on-cobalt labels to white for proper contrast.

Manual device verification is still recommended to confirm the rendered output.

---

## Executive Summary

Testing revealed **4 main categories of issues** affecting all pages:

1. **Navigation links extending beyond viewport** (all pages, all viewports)
2. **Low contrast text** on specific pages
3. **Missing focus indicators** on form inputs
4. **Mobile navigation drawer not opening** (mobile viewport only)

**Forms validation:** ✅ Working correctly - both `/contact/` and `/inquiry/` properly validate required fields.

---

## Issues by Category

### 1. Text Extending Beyond Viewport (Critical)

**Affected:** All 8 pages, all 3 viewports  
**Elements:** Navigation links (Projects, Journal, Inquiry)

The navigation links labeled "A: Projects", "A: Journal", and "A: Inquiry" are extending beyond the viewport width. This suggests:
- Links may have `position: fixed` or `absolute` with incorrect positioning
- Overflow hidden may not be applied to parent container
- Text wrapping may be disabled

**Recommendation:** Inspect the navigation link positioning and ensure they're contained within the viewport bounds.

---

### 2. Low Contrast Text (WCAG AA Failure)

#### Home Page (/)
- **Element:** Link with text "01 / Start"
- **Contrast Ratio:** 2.84:1 (fails WCAG AA 4.5:1 minimum)
- **Colors:** rgb(59, 65, 227) on rgb(12, 12, 12)
- **Viewports:** All (mobile, tablet, small laptop)

#### Journal Index (/journal/)
- **Element:** Link with text "POST_001"
- **Contrast Ratio:** 2.74:1 (fails WCAG AA)
- **Colors:** rgb(59, 65, 227) on rgb(17, 17, 17)
- **Viewports:** All

#### Commercial Interior Design Page (/commercial-interior-design-montreal/)
- **Element 1:** Link "Get a free quote"
  - **Contrast Ratio:** 1.00:1 (severe failure)
  - **Colors:** rgba(255, 255, 255, 0.85) on rgba(255, 255, 255, 0.04)
  
- **Elements 2-5:** Category labels (Cafes, Salons, Clinics, Boutiques)
  - **Contrast Ratio:** 1.00:1 (severe failure)
  - **Colors:** rgba(255, 255, 255, 0.62) on rgba(255, 255, 255, 0.02)
  - **Viewports:** All

**Recommendation:** 
- Increase color contrast to meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
- The blue links (rgb(59, 65, 227)) should be lightened or the background darkened
- The commercial page has critical contrast issues with near-transparent backgrounds

---

### 3. Missing Focus Indicators (Accessibility Issue)

**Affected Pages:** `/contact/`, `/inquiry/`  
**Viewports:** All  
**Element:** Form input fields

When tabbing through the contact and inquiry forms, input fields receive focus but have no visible focus indicator (no outline or box-shadow).

**Recommendation:** Add visible focus styles to all form inputs:
```css
input:focus, textarea:focus, select:focus {
  outline: 2px solid #your-accent-color;
  outline-offset: 2px;
}
```

---

### 4. Mobile Navigation Drawer (Functional Issue)

**Affected:** All 8 pages  
**Viewport:** Mobile (360x780) only  
**Issue:** Mobile navigation button found but drawer doesn't open when clicked

The test detected a mobile menu button (likely hamburger menu) but clicking it did not open the navigation drawer. This could be:
- JavaScript not loaded or executing
- Event listener not attached
- CSS preventing drawer from showing
- Incorrect aria attributes

**Recommendation:** Verify mobile navigation JavaScript is working and drawer opens on click.

---

## Layout & Overflow

✅ **No horizontal overflow detected** on body element  
✅ **No header/footer overlap** with main content  
✅ **No cut-off content** (aside from nav links issue)

---

## Keyboard Navigation

### Home Page (/)
- ✅ Can tab through header/nav
- ❌ Navigation links extend beyond viewport
- ✅ Focus order is sensible

### Contact Page (/contact/)
- ✅ Can tab through form elements
- ❌ **Missing visible focus indicators on inputs**
- ✅ Focus order is logical (name → email → project type → message → submit)

### Inquiry Page (/inquiry/)
- ✅ Can tab through form elements
- ❌ **Missing visible focus indicators on inputs**
- ✅ Focus order is logical

---

## Form Validation

### Contact Page (/contact/)
✅ **Working correctly**
- 5 total inputs, 4 required
- Required fields: name, email, project_type, message
- Browser validation triggers on empty submit
- Validation messages display properly:
  - "Please fill out this field." (text/textarea)
  - "Please select an item in the list." (select)

### Inquiry Page (/inquiry/)
✅ **Working correctly**
- 5 total inputs, 4 required
- Required fields: name_business, email, space_type, project_goals
- Browser validation triggers on empty submit
- Validation messages display properly

---

## Responsive Behavior Summary

### Mobile (360x780)
- ❌ Nav links overflow
- ❌ Mobile drawer doesn't open
- ❌ Low contrast issues
- ✅ No horizontal scroll
- ✅ Content stacks appropriately

### Tablet (768x1024)
- ❌ Nav links overflow
- ❌ Low contrast issues
- ✅ No horizontal scroll
- ✅ Layout adapts well

### Small Laptop (1024x768)
- ❌ Nav links overflow
- ❌ Low contrast issues
- ✅ No horizontal scroll
- ✅ Desktop layout displays correctly

---

## Priority Recommendations

### High Priority (Accessibility & Usability)
1. **Fix navigation link overflow** - affects all pages and viewports
2. **Fix mobile navigation drawer** - prevents mobile users from accessing navigation
3. **Add focus indicators to form inputs** - critical for keyboard users
4. **Fix severe contrast issues on commercial page** - ratio of 1.00:1 is unusable

### Medium Priority (WCAG Compliance)
5. **Improve contrast on home page "01 / Start" link** - increase from 2.84:1 to 4.5:1
6. **Improve contrast on journal "POST_001" link** - increase from 2.74:1 to 4.5:1

---

## Testing Methodology

- **Tool:** Playwright (Python) with Chromium browser
- **Automated checks:**
  - Horizontal overflow detection
  - Element overlap detection
  - Text visibility beyond viewport
  - Color contrast calculation (WCAG 2.1 formula)
  - Keyboard navigation simulation
  - Form validation testing
  - Focus indicator detection

- **Manual verification:** Form validation tested with visual browser instance

---

## Conclusion

The site has a solid foundation with proper form validation and generally good responsive behavior. The main issues are:
1. Navigation positioning problem affecting all pages
2. Color contrast failures on 3 pages
3. Missing focus indicators on forms
4. Non-functional mobile navigation

All issues are fixable with CSS adjustments and minor JavaScript debugging. No structural HTML changes required.
