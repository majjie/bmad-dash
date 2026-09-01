/**
 * Fidelity: `src/render/tokens.ts` against DESIGN.md's frontmatter.
 *
 * DESIGN.md claims its frontmatter is the contract. Until this file existed
 * that claim was prose about prose — nothing read the frontmatter, so a value
 * typed straight into a stylesheet made the document fiction without anything
 * going red. This is the test that turns the claim into a gate, and it is
 * deliberately symmetric: a changed value, a token DESIGN.md gained, and a
 * token DESIGN.md lost all fail, because a one-directional check passes happily
 * while the module accumulates tokens nobody designed.
 *
 * Two properties matter as much as the comparison itself:
 *
 *   - **It cannot pass vacuously.** A missing file, frontmatter without
 *     delimiters, a frontmatter that parsed to nothing and a frontmatter
 *     missing a whole token group are each a loud failure naming which, rather
 *     than an empty map compared against an empty map.
 *   - **Both sides are reduced by the same code.** `flattenTokens` from the
 *     module under test flattens the parsed YAML too, so a difference can only
 *     be a real difference in the data and not an artefact of comparing two
 *     shapes two ways.
 *
 * The YAML subset parser lives here rather than in `src/`. The runtime
 * dependency count is zero and a YAML library is not being added for a test,
 * and `src/` must not gain a parser for a file the shipped tool never reads:
 * DESIGN.md is a planning artifact, absent from the published package.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOKEN_GROUPS, colors, typography, components, flattenTokens, flatTokens } from '../../src/render/tokens.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The normative side. Read-only: never edited to match the code. */
const DESIGN_PATH = join(
  REPO_ROOT,
  '_bmad-output',
  'planning-artifacts',
  'ux-designs',
  'ux-bmad-2026-08-28',
  'DESIGN.md',
);

// ---------------------------------------------------------------------------
// A YAML subset, parsed strictly
// ---------------------------------------------------------------------------

type Container = Record<string, unknown> | unknown[];

interface Frame {
  readonly keyIndent: number;
  readonly value: Container;
}

/**
 * Strip surrounding quotes, and nothing else.
 *
 * Both quote styles appear in DESIGN.md, and which one is used is not
 * meaningful: `fontFamily` is double-quoted only because its value contains
 * single quotes. No escape processing is performed because the file uses none,
 * and inventing some would let this parser disagree with a real YAML reader.
 */
function unquote(raw: string): string {
  const trimmed = raw.trim();
  for (const quote of ["'", '"']) {
    if (trimmed.length >= 2 && trimmed.startsWith(quote) && trimmed.endsWith(quote)) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

const KEY_LINE = /^(.+?):(?:\s+(.*))?$/;

/**
 * Parse the block-mapping subset DESIGN.md's frontmatter uses.
 *
 * Strict on purpose. Anything it does not understand throws with the line
 * number, because a lenient parser's failure mode is a partial map — which
 * looks exactly like a token that was removed upstream, and would send a reader
 * hunting for a design change that never happened.
 */
export function parseYamlSubset(text: string, lineOffset = 0): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Frame[] = [{ keyIndent: 0, value: root }];
  let pending: { readonly container: Record<string, unknown>; readonly key: string } | null = null;

  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const at = (): string => `line ${String(index + 1 + lineOffset)}: ${JSON.stringify(line)}`;

    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    const top = stack[stack.length - 1];
    if (top === undefined) throw new Error(`unparseable frontmatter, stack exhausted at ${at()}`);

    if (pending !== null) {
      if (indent > top.keyIndent) {
        const container: Container = content.startsWith('- ') ? [] : {};
        pending.container[pending.key] = container;
        stack.push({ keyIndent: indent, value: container });
        pending = null;
      } else {
        // A key with no children and no inline value. Recorded as null rather
        // than skipped, so it shows up as a difference instead of an absence.
        pending.container[pending.key] = null;
        pending = null;
      }
    }

    while (stack.length > 1 && indent < (stack[stack.length - 1]?.keyIndent ?? 0)) stack.pop();
    const frame = stack[stack.length - 1];
    if (frame === undefined) throw new Error(`unparseable frontmatter, stack exhausted at ${at()}`);
    if (indent !== frame.keyIndent) {
      throw new Error(
        `unparseable frontmatter: indentation of ${String(indent)} matches no open block ` +
          `(expected ${String(frame.keyIndent)}) at ${at()}`,
      );
    }

    if (content.startsWith('- ')) {
      if (!Array.isArray(frame.value)) {
        throw new Error(`unparseable frontmatter: sequence item outside a sequence at ${at()}`);
      }
      frame.value.push(unquote(content.slice(2)));
      continue;
    }

    if (Array.isArray(frame.value)) {
      throw new Error(`unparseable frontmatter: mapping key inside a sequence at ${at()}`);
    }

    const parsed = KEY_LINE.exec(content);
    if (parsed === null) {
      throw new Error(`unparseable frontmatter: not a key or a sequence item at ${at()}`);
    }
    const key = unquote(parsed[1] ?? '');
    const value = parsed[2];
    if (key === '') throw new Error(`unparseable frontmatter: empty key at ${at()}`);

    if (value === undefined || value.trim() === '') {
      pending = { container: frame.value, key };
      continue;
    }
    frame.value[key] = unquote(value);
  }

  if (pending !== null) pending.container[pending.key] = null;
  return root;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Read DESIGN.md's frontmatter and flatten the six token groups.
 *
 * Every failure mode throws and names itself. The one outcome this function
 * must never produce is an empty map returned as success: an empty map compares
 * equal to nothing and would turn the whole gate green the moment the file
 * moved.
 */
export async function loadDesignTokens(path: string): Promise<Map<string, string>> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error: unknown) {
    throw new Error(
      `DESIGN.md is the normative token contract and could not be read at ${path}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const matched = FRONTMATTER.exec(text);
  if (matched === null || matched[1] === undefined) {
    throw new Error(`no YAML frontmatter delimited by --- was found in ${path}`);
  }

  // Offset by one: the captured body starts on the file's second line, and a
  // line number that does not match the file a reader opens is worse than none.
  const document = parseYamlSubset(matched[1], 1);
  const groups: Record<string, unknown> = {};
  for (const group of TOKEN_GROUPS) {
    const value = document[group];
    if (value === undefined || value === null) {
      throw new Error(`${path} frontmatter declares no ${group} token group`);
    }
    groups[group] = value;
  }

  const flat = flattenTokens(groups);
  if (flat.size === 0) throw new Error(`${path} frontmatter parsed to no tokens at all`);
  return flat;
}

// ---------------------------------------------------------------------------
// Comparison, in both directions
// ---------------------------------------------------------------------------

export interface Finding {
  readonly token: string;
  readonly kind: 'drift' | 'missing' | 'stale';
  readonly message: string;
}

/**
 * Every way the module and DESIGN.md can disagree, each naming the token.
 *
 * Both directions, because the asymmetric version — "every token in DESIGN.md
 * is in the module" — passes while the module grows values nobody designed, and
 * those are the values that end up in a stylesheet.
 */
export function compareTokens(
  module: ReadonlyMap<string, string>,
  design: ReadonlyMap<string, string>,
): readonly Finding[] {
  const findings: Finding[] = [];

  for (const [token, expected] of design) {
    const actual = module.get(token);
    if (actual === undefined) {
      findings.push({
        token,
        kind: 'missing',
        message:
          `${token}: DESIGN.md declares ${JSON.stringify(expected)}, ` +
          'and src/render/tokens.ts has no such token. Transcribe it.',
      });
      continue;
    }
    if (actual !== expected) {
      findings.push({
        token,
        kind: 'drift',
        message:
          `${token}: DESIGN.md says ${JSON.stringify(expected)}, ` +
          `src/render/tokens.ts says ${JSON.stringify(actual)}. ` +
          'DESIGN.md is normative — change the module, not the document.',
      });
    }
  }

  for (const [token, actual] of module) {
    if (design.has(token)) continue;
    findings.push({
      token,
      kind: 'stale',
      message:
        `${token}: src/render/tokens.ts holds ${JSON.stringify(actual)}, ` +
        'and DESIGN.md declares no such token. Remove it.',
    });
  }

  return findings.sort((a, b) => a.token.localeCompare(b.token));
}

export function describeFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'no findings';
  return `${String(findings.length)} token(s) disagree with DESIGN.md:\n${findings
    .map((finding) => `  [${finding.kind}] ${finding.message}`)
    .join('\n')}`;
}

async function scratch(t: { after: (fn: () => unknown) => void }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-tokens-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

/** A frontmatter file with the six groups present and one value under each. */
function minimalDesign(body: string): string {
  return `---\n${body}\n---\n\n# not the contract\n`;
}

// ---------------------------------------------------------------------------
// The real comparison
// ---------------------------------------------------------------------------

test('the token module and DESIGN.md agree, in both directions', async () => {
  const design = await loadDesignTokens(DESIGN_PATH);
  const findings = compareTokens(flatTokens(), design);
  assert.deepEqual(findings, [], describeFindings(findings));
});

test('DESIGN.md still carries the 53 scalar tokens and 10 component sets the module transcribes', async () => {
  // A count floor for the parse, for the same reason the suite has one: a
  // parser that quietly stopped seeing half the file would make the comparison
  // above agree about less and less while staying green.
  const text = await readFile(DESIGN_PATH, 'utf8');
  const matched = FRONTMATTER.exec(text);
  assert.ok(matched?.[1] !== undefined, 'DESIGN.md must open with YAML frontmatter');
  const document = parseYamlSubset(matched[1] ?? '') as Record<string, Record<string, unknown>>;

  const counted = {
    colors: Object.keys(document.colors ?? {}).length,
    typography: Object.keys(document.typography ?? {}).length,
    motion: Object.keys(document.motion ?? {}).length,
    rounded: Object.keys(document.rounded ?? {}).length,
    spacing: Object.keys(document.spacing ?? {}).length,
  };
  assert.deepEqual(counted, { colors: 24, typography: 8, motion: 4, rounded: 5, spacing: 12 });
  assert.equal(
    Object.values(counted).reduce((sum, n) => sum + n, 0),
    53,
    'the scalar token count is 53',
  );
  assert.equal(Object.keys(document.components ?? {}).length, 10, '10 component token sets');
});

test('the module carries exactly the six token groups DESIGN.md declares', async () => {
  const text = await readFile(DESIGN_PATH, 'utf8');
  const document = parseYamlSubset(FRONTMATTER.exec(text)?.[1] ?? '');
  for (const group of TOKEN_GROUPS) {
    assert.ok(group in document, `DESIGN.md must declare the ${group} group`);
  }
  const prefixes = new Set([...flatTokens().keys()].map((token) => token.split('.')[0]));
  assert.deepEqual([...prefixes].sort(), [...TOKEN_GROUPS].sort());
});

// ---------------------------------------------------------------------------
// The gate must fail, not merely pass
// ---------------------------------------------------------------------------

test('a changed value is reported naming the token and both values', () => {
  const design = new Map([['colors.surface', '#121617']]);
  const drifted = new Map([['colors.surface', '#000000']]);

  const findings = compareTokens(drifted, design);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.kind, 'drift');
  assert.equal(findings[0]?.token, 'colors.surface');
  assert.match(describeFindings(findings), /colors\.surface/);
  assert.match(describeFindings(findings), /#121617/);
  assert.match(describeFindings(findings), /#000000/);
});

test('a token DESIGN.md gained and the module lacks is reported by name', () => {
  const findings = compareTokens(
    new Map(),
    new Map([['colors.signal-deferred', '#ABCDEF']]),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.kind, 'missing');
  assert.match(describeFindings(findings), /colors\.signal-deferred/);
  assert.match(describeFindings(findings), /has no such token/);
});

test('a token the module holds and DESIGN.md no longer has is reported by name', () => {
  const findings = compareTokens(
    new Map([['rounded.xl', '24px']]),
    new Map(),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.kind, 'stale');
  assert.match(describeFindings(findings), /rounded\.xl/);
  assert.match(describeFindings(findings), /declares no such token/);
});

test('drift in the real module is caught, not just in a fixture', () => {
  // Mutating one real value proves the comparison is wired to the real map
  // rather than to a hand-built one that happens to agree with itself.
  const module = flatTokens();
  module.set('colors.primary', '#FF0000');
  const design = flattenTokens({ colors: { primary: '#6FD3C6' } });
  const findings = compareTokens(module, design).filter((f) => f.kind === 'drift');
  assert.deepEqual(findings.map((f) => f.token), ['colors.primary']);
});

test('agreement is reported as no findings, and the description says so', () => {
  const same = new Map([['spacing.1', '4px']]);
  assert.deepEqual(compareTokens(same, new Map(same)), []);
  assert.equal(describeFindings([]), 'no findings');
});

// ---------------------------------------------------------------------------
// Never vacuous
// ---------------------------------------------------------------------------

test('a missing DESIGN.md fails loudly, naming the path', async (t) => {
  const root = await scratch(t);
  await assert.rejects(
    () => loadDesignTokens(join(root, 'DESIGN.md')),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /could not be read/);
      assert.match(error.message, /DESIGN\.md/);
      return true;
    },
  );
});

test('a DESIGN.md with no frontmatter delimiters fails naming the file', async (t) => {
  const root = await scratch(t);
  const path = join(root, 'DESIGN.md');
  await writeFile(path, '# bmad-dash\n\nNo frontmatter at all.\n');
  await assert.rejects(
    () => loadDesignTokens(path),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /no YAML frontmatter/);
      assert.ok(error.message.includes(path));
      return true;
    },
  );
});

test('a frontmatter missing a whole token group fails naming that group', async (t) => {
  const root = await scratch(t);
  const path = join(root, 'DESIGN.md');
  // Every group but `spacing`.
  await writeFile(
    path,
    minimalDesign(
      [
        'colors:',
        "  surface: '#121617'",
        'typography:',
        '  body:',
        "    fontSize: '0.875rem'",
        'motion:',
        "  duration-focus: '0ms'",
        'rounded:',
        "  sm: '3px'",
        'components:',
        '  focus-ring:',
        "    width: '2px'",
      ].join('\n'),
    ),
  );
  await assert.rejects(
    () => loadDesignTokens(path),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /declares no spacing token group/);
      return true;
    },
  );
});

test('an unparseable indentation fails rather than yielding a partial map', async (t) => {
  const root = await scratch(t);
  const path = join(root, 'DESIGN.md');
  await writeFile(
    path,
    minimalDesign(['colors:', "  surface: '#121617'", "   on-surface: '#E5EAEA'"].join('\n')),
  );
  await assert.rejects(
    () => loadDesignTokens(path),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /unparseable frontmatter/);
      assert.match(error.message, /line 4/);
      return true;
    },
  );
});

test('a frontmatter that parses to nothing is a failure, not an empty agreement', async (t) => {
  const root = await scratch(t);
  const path = join(root, 'DESIGN.md');
  await writeFile(path, '---\n\n---\n\n# empty\n');
  await assert.rejects(() => loadDesignTokens(path), /declares no colors token group/);
});

// ---------------------------------------------------------------------------
// The parser itself
// ---------------------------------------------------------------------------

test('the parser reads both quote styles, bare scalars and numbers identically', () => {
  const document = parseYamlSubset(
    [
      "single: '#121617'",
      'double: "\'IBM Plex Sans\', sans-serif"',
      'bare: Dark, dashboard-dense. Material 3 token roles.',
      'number: 600',
      "quoted-key:",
      "  '1': '4px'",
    ].join('\n'),
  );
  assert.deepEqual(document, {
    single: '#121617',
    double: "'IBM Plex Sans', sans-serif",
    bare: 'Dark, dashboard-dense. Material 3 token roles.',
    number: '600',
    'quoted-key': { '1': '4px' },
  });
});

test('the parser reads a sequence, and a key with no value at all', () => {
  const document = parseYamlSubset(['sources:', '  - ../a.md', '  - ../b.md', 'empty:'].join('\n'));
  assert.deepEqual(document, { sources: ['../a.md', '../b.md'], empty: null });
});

test('the parser reads three levels of nesting, as signal-pill needs', () => {
  const document = parseYamlSubset(
    ['components:', '  signal-pill:', '    present:', "      color: '#9BD98F'"].join('\n'),
  );
  assert.deepEqual(document, { components: { 'signal-pill': { present: { color: '#9BD98F' } } } });
});

test('flattenTokens reduces both sides by the same rules', () => {
  assert.deepEqual(
    [...flattenTokens({ a: { b: 'x', c: 1 }, d: ['p', 'q'] })],
    [
      ['a.b', 'x'],
      ['a.c', '1'],
      ['d', '[p, q]'],
    ],
  );
});

// ---------------------------------------------------------------------------
// Transcription sanity, independent of the comparison
// ---------------------------------------------------------------------------

test('every colour token is a six-digit hex', () => {
  for (const [name, value] of Object.entries(colors)) {
    assert.match(value, /^#[0-9A-F]{6}$/, `${name} is not a six-digit uppercase hex: ${value}`);
  }
});

test('the four signal colours and their containers are a closed set of eight', () => {
  const signals = Object.keys(colors).filter((name) => name.startsWith('signal-'));
  assert.deepEqual(signals.sort(), [
    'signal-absent',
    'signal-absent-container',
    'signal-present',
    'signal-present-container',
    'signal-unchecked',
    'signal-unchecked-container',
    'signal-unreadable',
    'signal-unreadable-container',
  ]);
  // Separate from primary, so the accent never encodes state.
  const primaries = new Set<string>([colors.primary, colors['primary-container']]);
  for (const signal of signals) {
    const value = colors[signal as keyof typeof colors];
    assert.ok(!primaries.has(value), `${signal} reuses a primary colour: ${value}`);
  }
});

test('no token value is empty, and every component reference names a real token', () => {
  const flat = flatTokens();
  for (const [token, value] of flat) {
    assert.notEqual(value.trim(), '', `${token} has an empty value`);
  }
  for (const [token, value] of flat) {
    const reference = /^\{([^}]+)\}$/.exec(value);
    if (reference === null) continue;
    const target = reference[1] ?? '';
    const resolvable = flat.has(target) || [...flat.keys()].some((key) => key.startsWith(`${target}.`));
    assert.ok(resolvable, `${token} references ${target}, which is not a token`);
  }
});

test('every component set DESIGN.md declares is transcribed, unresolved', () => {
  assert.deepEqual(Object.keys(components).sort(), [
    'activity-row',
    'button-ghost',
    'button-primary',
    'core-artifact-card',
    'evidence-badge',
    'focus-ring',
    'refresh-progress',
    'signal-pill',
    'tile',
    'tile-raised',
  ]);
  // Unresolved is the point: a pre-resolved reference would no longer match
  // DESIGN.md character for character.
  assert.equal(components.tile.background, '{colors.surface-container-low}');
  assert.equal(typography['body-dense'].fontSize, '0.8125rem');
});
