## Atlas Light Mode — Visual Hierarchy Audit

This is not a color-token task. This is a visual hierarchy pass.

The objective is to make Atlas feel **calm, modern, premium, and intentional**.

Do not preserve existing color decisions simply because they already exist. Walk every visible surface and ask:

> Does this element deserve the user's attention?

If not, reduce its visual weight.

The goal is not to recolor Atlas. The goal is to remove visual competition until the interface naturally guides the eye.

---

### Visual hierarchy

**Highest attention**
1. User content
2. Atlas responses
3. Primary actions

**Medium**
4. Navigation

**Lowest**
5. Branding
6. Decorative elements
7. Structural chrome

If decorative chrome competes with content, it should be demoted.

---

### Color responsibilities

Each color has exactly one job.

**Charcoal** — Functional UI, icons, navigation, primary typography
**Gray** — Borders, dividers, secondary text, supporting status
**Bronze** — Brand, active state, primary CTA
**Purple** — AI thinking, streaming, intelligence, processing

Bronze should never be used as decoration. Purple should never be used as branding.

---

### Audit every surface

Review Header, Home, Ask Atlas, Composer, Footer, and workspace entry points. For each visible element ask:

- Does it need emphasis?
- Does it communicate interaction?
- Is it competing with the content?
- Can it be quieter?

Reduce anything unnecessary.

---

### Known examples (not the complete list)

Elements that currently violate the hierarchy include:

- Hamburger icon
- Avatar ring
- "+" affordance
- Gold thinking dots
- Bronze status labels
- Decorative composer glow
- Excessive bronze borders
- Remaining parchment gold chrome

If you find additional violations during the walk, fix them as well.

---

### Constraints

- No layout changes.
- No typography changes.
- No spacing changes.
- No dark mode changes.
- Do not replace the parchment background yet.
- Preserve the existing token system — demote through it, don't fork it.

---

### Success criteria

Open Home, Ask Atlas, and the Composer. The first thing the eye should notice is:

1. The conversation.
2. The input.
3. The current action.

The UI itself should almost disappear. Bronze should only attract attention when communicating brand or interaction.

---

### Technical approach

Work primarily through `artifacts/atlas-frontend/src/styles.css` parchment-scoped tokens so a single demotion cascades everywhere the token is consumed. Touch component files only when a hardcoded gold value bypasses the token system (audit for raw `#d4a017`, `#8b5e3c`, `rgba(212,175,55,...)` etc. in parchment context and route through tokens or charcoal/gray as the hierarchy dictates).

Ready to execute on approval.
