# Portfolio Design Specification & Tokens (V2)

## 1. Core Concept & Layout
- **Architecture:** Single Page Application (SPA) feel. All 3 sections (Profile, Film, Gallery) exist in the DOM.
- **Navigation:** Fixed Navigation Bar.
  - *Desktop:* Fixed on the left side.
  - *Mobile/Tablet:* Responsive, moves to the top or bottom depending on screen width.
- **Page Transitions (Flashcard Effect):** Clicking a nav item does NOT reload the page. Instead, the new section slides up smoothly from the bottom (like a flashcard overlapping the previous one) with a z-index transition.

## 2. Color Palette (CSS Variables)
```css
:root {
  --bg-main: #1D3057; /* Background หลักของเว็บ */
  --banner-gradient: linear-gradient(135deg, #296BF8 0%, #FFAA00 100%);
  --bg-contact: #ECCDBC;
  --bg-card: #FFFFFF;
  --bg-card-placeholder: #D9D9D9; /* สีกล่องเทา placeholder */
  --text-dark: #1A1A1A;
  --text-light: #FFFFFF;
}
```

## 3. Effects & Styling (Figma Details)
- **Noise Effect:** Elements like the Gradient Banner and Contact Box require a Noise effect overlay. Use a CSS base64 noise background image layered over the color/gradient using `mix-blend-mode` or multiple background layers.
- **Drop Shadow:** Default shadow for cards.
  - `--shadow-default: 0 4px 20px rgba(0, 0, 0, 0.15);`
  - `--shadow-hover: 0 12px 30px rgba(0, 0, 0, 0.3);`
- **Border Radius:** Main layout cards and content boxes use rounded corners (approx `24px` to `32px`, match the design).

## 4. Animations & Interactions
- **Hover States:** All interactive elements (Nav icons, Contact icons, Cards, Buttons) must have a smooth hover effect: `transform: translateY(-5px);` and transition to `--shadow-hover`.
- **Transitions:** `transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);`
- **Pop-up / Modal:** Modals for Images and YouTube videos must fade in with a dark backdrop (`rgba(0,0,0,0.8)`). The content inside should slightly scale up (`transform: scale(0.95)` to `scale(1)`).

## 5. Section Specifics
- **Profile:** Contact icons link to external URLs. "Most Popular" grid requires 1:1 cards with text below.
- **Film:** Left/Right arrow layout. Video thumbnail is 16:9.
- **Gallery:** Grid of 1:1 images categorized by year.