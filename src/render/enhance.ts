/**
 * The one script this tool serves, and the one control that needs it.
 *
 * **Why there is a script at all.** FR-24 is copy-to-clipboard *and*
 * open-in-editor. Story 2.3a shipped the second as a plain anchor; there is no
 * HTML-only way to write to the clipboard, so the first cannot be a link. The
 * script therefore *satisfies* the requirement rather than decorating a page
 * that already worked — which is the whole reason this story is separate from
 * 2.3a and the reason the Content-Security-Policy gains its first exception
 * since it was pinned.
 *
 * **One script, permitted by a hash of exactly itself.** `COPY_SCRIPT` is a
 * compile-time constant with no interpolation, and
 * `src/adapters/http/server.ts` derives `script-src 'sha256-…'` from this same
 * constant at module load. So the header and the page cannot disagree: a byte
 * changed here moves the hash, and the served response is checked against its
 * own header in `test/server.test.ts` rather than against a constant agreeing
 * with itself.
 *
 * Not `'unsafe-inline'`, and that is not a preference. `RENDER_EMBEDDED_HTML`
 * is `true` (see `./markdown.ts`), so a project's own markdown can carry a
 * `<script>` — `'unsafe-inline'` would execute it and a hash cannot. Not
 * `'self'` with an external file either: there is no static-file route, and
 * `'self'` would permit *any* same-origin script where a hash permits exactly
 * one.
 *
 * **The client code lives here as a string, deliberately.** `web/` is in
 * `SCANNED_ROOTS` and is asserted *empty* by
 * `test/architecture.test.ts`'s one-empty-scanned-root tripwire, which fails
 * the moment `web/` gains its first source file so that whoever adds it
 * confirms the AD-1 gate now covers it. A constant under `src/` needs no build
 * step for client code, no bundle, and no second entry point — so the tripwire
 * stays armed for the story that genuinely earns a `web/`. That is a placement
 * stated rather than discovered.
 *
 * **Hidden in the markup, revealed by the script.** The control is served with
 * `hidden` and the script removes it. A reader without script — disabled, or a
 * browser that refuses the hash — never sees a control that cannot work, and
 * the path is still visible, selectable text beside it, which is the fact they
 * came for. It also makes the requirement assertable from markup alone:
 * `hidden` in the served body is a check, where "the button works" is not.
 *
 * **What cannot be verified here, stated rather than implied.** There is no
 * browser and no clipboard in this suite. Assertable: this markup, the `hidden`
 * attribute, the escaped payload, and that the header's hash is the hash of the
 * script served. Not assertable: that the clipboard receives anything, or that
 * the CSP is honoured. Nothing was written to handle `writeText`'s rejection,
 * because an outcome no test can observe is not behaviour this story may claim
 * — `src/adapters/http/server.ts`'s own CSP docblock makes the same point about
 * the policy.
 */

import { markup } from './html.ts';

/**
 * The copy control's own class, and therefore the script's one selector.
 *
 * `button-ghost` supplies the appearance; this carries the geometry a
 * `<button>` needs that the two anchor variants did not, and it is the hook the
 * script queries. Held as a constant so `test/render/enhance.test.ts` can pin
 * the script's selector against it — the script is a literal with no
 * interpolation, so the correspondence is asserted rather than constructed.
 */
export const COPY_CONTROL_CLASS = 'artifact-copy';

/**
 * Where the path travels: a `data-` attribute, read as `dataset.copyPath`.
 *
 * A payload rather than an `href`, which is exactly why this control is not
 * `./components.ts`'s `buttonGhost`. See `copyControl` below.
 */
export const COPY_PAYLOAD_ATTRIBUTE = 'data-copy-path';

/**
 * The control's own text, and therefore its accessible name.
 *
 * A verb phrase naming what it does and what it acts on, on
 * `OPEN_IN_EDITOR_LABEL`'s reasoning in `./artifact.ts`: a bare `Copy` names an
 * action with no object, and a screen reader announcing it in a controls list
 * would leave the reader to guess which of the page's several strings it means.
 * No document dictates it — `EXPERIENCE.md:213` names the affordance without
 * prescribing copy — so it is a constant here, pinned by
 * `test/render/enhance.test.ts` on the same terms as every other page string.
 */
export const COPY_LABEL = 'Copy path';

/**
 * The whole of the client code, verbatim, with no value interpolated into it.
 *
 * **A literal and not a template, on purpose.** The CSP hash is over these
 * bytes; a template that happened to interpolate only constants would still be
 * a shape in which a per-request value could later be spliced, at which point
 * the header would be a hash of one script and the page would carry another.
 * `test/render/enhance.test.ts` asserts there is no interpolation, which is a
 * check on the shape rather than on today's output.
 *
 * **`navigator.clipboard` is checked before anything is revealed.** The API is
 * absent in an insecure context, and a control revealed where it cannot work is
 * the dead control the `hidden`-then-revealed arrangement exists to prevent —
 * so the guard is the same rule as the `hidden` attribute, applied at the one
 * condition markup cannot see.
 *
 * **`function` rather than an arrow, and `||` rather than `??`.** Both avoid
 * `<` and `>`; a `<` inside a `<script>` element cannot be escaped — HTML
 * entities are not decoded there — and the parser's rules for what ends the
 * element are looser than they look. `scriptable` below refuses one anyway.
 *
 * `const control` in a `for…of` is a fresh binding per iteration, so each
 * listener closes over its own control rather than over the last one.
 */
export const COPY_SCRIPT = `if (navigator.clipboard && navigator.clipboard.writeText) {
  for (const control of document.querySelectorAll('.artifact-exits .artifact-copy')) {
    if (control.closest('.artifact-content')) continue;
    control.hidden = false;
    control.addEventListener('click', function () {
      const payload = control.dataset.copyPath;
      if (!payload) return;
      navigator.clipboard.writeText(payload);
    });
  }
}`;

/**
 * Refuse to inline a script that could end the `<script>` element early.
 *
 * The exact shape of `./page.ts`'s `inlinable`, for the exact reason: inside a
 * `<script>` there is no escaping mechanism at all, so a `<` that reached this
 * string could only be handled by refusing to serve it. The check is on `<`
 * rather than on `</script` because the parser closes the element on more than
 * the obvious spelling. `COPY_SCRIPT` is a constant, so this cannot fire today
 * — which is exactly when a guard is cheap.
 */
export function scriptable(js: string): string {
  if (js.includes('<')) {
    throw new Error('the script contains "<", which cannot be escaped inside a <script> element');
  }
  return js;
}

/**
 * The `<script>` element, emitted once per artifact page.
 *
 * The element wrapper is here and not at the call site so that the bytes the
 * hash covers and the bytes the page carries are produced by one function. A
 * page that built the element itself would be free to add an attribute — a
 * `nonce`, a `type` — that the hash does not cover and the policy would then
 * refuse.
 *
 * No `type` and no `defer`: a classic script with no attributes is what a
 * `'sha256-…'` source expression permits, and the listeners it attaches need
 * the controls to exist, which is why `./artifact.ts` emits it after the
 * surface rather than in the head.
 */
export function copyScriptElement(): string {
  return `<script>${scriptable(COPY_SCRIPT)}</script>`;
}

/**
 * The copy control for one path: a `button-ghost`, `hidden`, carrying the path.
 *
 * **Built here rather than through `./components.ts`, and this is the decision
 * the Code Map asked for.** `ButtonOptions` is `{label, href}` with both
 * required and both guarded, and the guard on `href` is load-bearing: a button
 * with `href=""` re-requests the current page, so an anchor that goes nowhere
 * is refused outright. This control genuinely goes nowhere — it has a payload,
 * not a destination — so making `href` optional would remove the guard that
 * protects the two real anchors in order to admit a control that is not an
 * anchor at all. `./components.ts`'s own doc comment argues at length that an
 * `<a>` is the honest element *because* everything on these surfaces navigates;
 * widening it would make that argument false of its own type. So the control is
 * built beside them, and it carries `button-ghost` so the appearance is still
 * the one that module defines.
 *
 * **A `<button>`, which is what makes it keyboard operable.** An `<a>` without
 * an `href` is not in the tab order, and a `tabindex` bolted onto one is a
 * control that announces itself as a link and does not navigate. A `<button>`
 * is focusable natively, activates on both `Enter` and `Space`, and announces
 * as a button — so the accessible name is its own text and no ARIA is needed.
 * `type="button"` because a bare `<button>` inside a form submits it; there is
 * no form on any surface today, which is when that is cheap to get right.
 *
 * **`button-ghost`, never `button-primary`.** Story 2.3a's open-in-editor link
 * holds this surface's one primary (UX-DR11, owned by
 * `test/render/components.test.ts`), and opening the artifact where the reader
 * works is the forward action they came for. A convenience over text that is
 * already on the page is not.
 *
 * The payload goes through `markup`, so a path containing `"`, `<`, `&` or a
 * quote-escape attempt is escaped into the attribute and cannot leave it or
 * create an element. That is the existing escaping used deliberately rather
 * than a new mechanism: `./html.ts` already renders `a" onmouseover=…` as
 * `a&quot; onmouseover=…`.
 *
 * A blank payload is refused on `button()`'s own reasoning for a blank `href`:
 * a control that would put nothing on the clipboard looks like it works and
 * does nothing. No row can produce one — `WalkEntry.relative` is non-empty by
 * construction — which is when the guard costs nothing.
 */
export function copyControl(path: string): string {
  if (path.trim() === '') {
    throw new Error('the copy control needs the path it copies; it was empty');
  }
  return markup`<button type="button" class="button-ghost ${COPY_CONTROL_CLASS}" hidden ${COPY_PAYLOAD_ATTRIBUTE}="${path}">${COPY_LABEL}</button>`
    .html;
}
