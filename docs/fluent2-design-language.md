# Fluent 2 visual language for IntuneCooker

IntuneCooker should feel like a Windows-adjacent control center: calm, light, and operational rather than decorative. The product compares sensitive tenant configuration, so the interface should communicate trust through clean geometry, measured depth, and familiar Microsoft-style blue accents.

## Principles

- **System-like, not themed:** use Fluent-style surfaces, typography, icons, and spacing so the app feels compatible with Windows 11 and Microsoft 365 without copying a native shell outright.
- **Acrylic hierarchy:** page backgrounds stay soft and pale; work areas float in semi-transparent acrylic cards with blur, subtle saturation, highlight edges, and restrained shadows.
- **Disciplined geometry:** rounded corners should be consistent: small controls around 8px, cards around 16px, and hero panels around 20-24px.
- **Blue-led state language:** primary actions and focus states use Fluent blue; success, warning, and destructive colors stay muted and functional.
- **Gentle motion:** hover and state changes should lift cards 1-2px, deepen shadows slightly, or fade colors over roughly 150-300ms. Avoid bounce, glitch, neon, or arcade-like animation.

## Materials

- **Backgrounds:** light blue-white gradients with minimal texture.
- **Cards:** translucent white fills, `backdrop-filter: blur(...) saturate(...)`, thin white highlight edges, and a faint blue gradient stroke.
- **Controls:** white or blue fills, soft borders, readable contrast, and subtle shadow; no high-chroma multicolor gradients.
- **Code/evidence blocks:** dark neutral surfaces are allowed for JSON evidence because they improve scanability, but they should remain neutral rather than neon.

## Interaction behavior

- Cards and selectable rows can lift slightly on hover.
- Buttons should darken or brighten gently and add a small shadow change.
- Focus rings should be visible Fluent blue and accessible.
- Reduced-motion users should receive near-instant transitions.

## Product fit

This language supports IntuneCooker as a practical assessment companion: users should feel they are working inside a polished Microsoft ecosystem tool, not a cyberpunk dashboard or marketing landing page.
