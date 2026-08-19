---
name: Muse
colors:
  surface: '#0f131f'
  surface-dim: '#0f131f'
  surface-bright: '#353946'
  surface-container-lowest: '#0a0e1a'
  surface-container-low: '#171b28'
  surface-container: '#1b1f2c'
  surface-container-high: '#262a37'
  surface-container-highest: '#313442'
  on-surface: '#dfe2f3'
  on-surface-variant: '#c7c4d8'
  inverse-surface: '#dfe2f3'
  inverse-on-surface: '#2c303d'
  outline: '#918fa1'
  outline-variant: '#464555'
  surface-tint: '#c3c0ff'
  primary: '#c3c0ff'
  on-primary: '#1d00a5'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#4d44e3'
  secondary: '#cabeff'
  on-secondary: '#31009a'
  secondary-container: '#4816cb'
  on-secondary-container: '#b9aaff'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#006e4b'
  on-tertiary-container: '#67f4b7'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#e6deff'
  secondary-fixed-dim: '#cabeff'
  on-secondary-fixed: '#1c0062'
  on-secondary-fixed-variant: '#4816cb'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0f131f'
  on-background: '#dfe2f3'
  surface-variant: '#313442'
typography:
  h1:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  h2:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.03em
  h3:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.02em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.1em
  data-tabular:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
  h1-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  container-max: 1440px
  gutter: 24px
---

## Brand & Style
The design system embodies a "Muse" aesthetic: a sophisticated, high-fidelity environment designed for deep focus and premium data visualization. It utilizes a refined **Glassmorphic** style set against a rhythmic, deep-space background. 

The emotional response is one of calm authority and technical precision. The UI feels like a high-end physical console—cool to the touch, illuminated by soft internal glows rather than harsh external lighting. Surfaces are layered using translucency and varying levels of backdrop blur to create a sense of physical depth without traditional heavy shadows. A subtle 3% grain texture is applied globally to eliminate digital banding and provide a tactile, filmic quality to the interface.

## Colors
This design system operates exclusively in a dark-mode paradigm. The foundation is a deep indigo-black (`#0A0E1A`), which serves as the "void" upon which glass layers are placed. 

**Color as Semantic Logic:**
- **Saturation = Certainty:** Highly saturated greens and indigos represent verified, high-confidence data. 
- **Desaturation = Ambiguity:** Amber and muted tones are reserved for items requiring user clarification or containing low-confidence signals.
- **Accents:** The indigo-to-violet gradient is used sparingly for primary actions and "moments of magic" within the UI.

## Typography
The typographic system creates a tension between the technical, geometric nature of **Space Grotesk** and the neutral, highly legible **Inter**. 

Headings should always use tight tracking to emphasize the font’s architectural character. For numerical data, specifically in dashboards or financial views, the use of **tabular figures** is mandatory to ensure vertical alignment across rows. For internationalization, **Hind Siliguri** is integrated for Bengali text, selected for its clean conjuncts that harmonize with the weights of Inter.

## Layout & Spacing
The design system employs a **12-column fluid grid** for desktop, transitioning to a **4-column grid** for mobile. A strict 4px baseline grid governs all internal component spacing to maintain mathematical harmony.

Layouts should favor generous whitespace ("Safe Zones") around glass containers to allow the background gradients and blurs to breathe. Elements should be grouped into logical "clusters" using the `md` (16px) spacing unit, while distinct sections are separated by `xl` (40px) or more.

## Elevation & Depth
Elevation is expressed through **translucency and blur** rather than traditional Y-axis offsets and shadows.

1.  **Level 0 (Base):** The indigo-black background with subtle grain.
2.  **Level 1 (Surface):** Glass layers with a 20px backdrop-blur and 1px border at 10% opacity.
3.  **Level 2 (Hover/Active):** Increased border opacity (20%) and a soft, colored inner glow (2-4px blur) matching the accent color.
4.  **Floating Elements:** Modals and menus receive a secondary layered shadow—a very large, soft indigo glow (`rgba(79, 70, 229, 0.15)`) with a 40px radius to simulate an ambient light source beneath the glass.

## Shapes
The shape language is sophisticated and intentional. Large layout containers (cards, panels) use a **16px radius**. Interactive controls like buttons and input fields use a **12px radius**, creating a nested visual hierarchy. Status indicators, tags, and badges utilize **999px (pill)** shapes to distinguish them from structural elements.

## Components
- **Buttons:** Primary buttons use the indigo-to-violet gradient with white text. Secondary buttons are "Ghost Glass"—transparent with a 1px border and 20px blur.
- **Input Fields:** Semi-transparent dark fills (`#0F1424` at 50%) with a subtle bottom-lit border. Focus states trigger a 1px solid indigo border and a faint inner glow.
- **Cards:** Must implement `backdrop-filter: blur(20px)`. Borders should be 1px solid `rgba(255, 255, 255, 0.10)`.
- **Chips/Badges:** Pill-shaped. If representing "Certainty," use high-saturation fills. If representing "Uncertainty," use a stroke-only style with muted amber text.
- **Lists:** Items are separated by subtle 1px glass lines. Hover states should apply a light "shine" effect across the surface using a linear-gradient overlay.
- **Texture Overlay:** Every major surface component must have a noise texture applied as a mask or pseudo-element at 3% opacity to maintain the brand's tactile feel.