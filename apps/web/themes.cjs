/**
 * Fonte única dos temas do site. O tailwind.config.js lê este arquivo para
 * gerar as variáveis CSS (`html[data-theme='...']`), e o app lê a lista de
 * temas (id/nome/amostra) em src/lib/temas.ts, que espelha `THEME_META`.
 *
 * Como funciona: as escalas de cor do Tailwind (slate, blue, red, ...) e o
 * `white` de fundo apontam para variáveis `--c-<cor>-<tom>`; cada tema só
 * redefine essas variáveis. Nada precisa mudar nas classes das páginas.
 */
const colors = require('tailwindcss/colors');

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const CHROMA = [
  'red',
  'orange',
  'amber',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
];

/** '#rrggbb' -> '17 28 47' (canais para `rgb(var(--x) / <alpha-value>)`). */
function canais(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
}

/** Tons originais do Tailwind (tema claro). */
function claro(cor) {
  return Object.fromEntries(SHADES.map((s) => [s, colors[cor][s]]));
}

/**
 * Escalas cromáticas para fundo escuro: os tons claros (50-300, usados como
 * fundo/borda de alertas e chips) viram tons escuros, e os escuros (700-900,
 * usados como texto) viram tons claros. 500/600 seguem vivos para botões
 * sólidos e ícones.
 */
const MAPA_ESCURO = {
  50: 950,
  100: 900,
  200: 800,
  300: 700,
  400: 400,
  500: 500,
  600: 500,
  700: 300,
  800: 200,
  900: 100,
  950: 50,
};
function escuro(base) {
  return Object.fromEntries(SHADES.map((s) => [s, base[MAPA_ESCURO[s]]]));
}

/** Escala neutra (slate) explícita: 50..950 + fundo da página e dos cards. */
function neutra(canvas, surface, tons) {
  return {
    canvas,
    surface,
    slate: Object.fromEntries(SHADES.map((s, i) => [s, tons[i]])),
  };
}

const NEUTRAS = {
  claro: {
    canvas: '#f8fafc',
    surface: '#ffffff',
    slate: claro('slate'),
  },
  suave: neutra('#e9edf2', '#f7f8fa', [
    '#eef1f5', '#e4e9f0', '#d3dae4', '#bcc6d4', '#8f9db2', '#5f6d82',
    '#4a566a', '#384355', '#263041', '#141b28', '#0a0f18',
  ]),
  escuro: neutra('#0b1120', '#131c2f', [
    '#182338', '#1e2b45', '#2a3a58', '#3b4d6e', '#6b7d99', '#93a4bd',
    '#b0bdd0', '#ccd5e2', '#e2e8f0', '#f1f5f9', '#f8fafc',
  ]),
  meianoite: neutra('#060a18', '#0c1330', [
    '#111a3c', '#172350', '#22326a', '#31447f', '#6173a8', '#8c9dc9',
    '#abb8db', '#c8d1e8', '#dfe5f3', '#edf0fa', '#f6f8fd',
  ]),
  grafite: neutra('#111113', '#1b1b1e', [
    '#232326', '#2b2b2f', '#38383d', '#4a4a50', '#76767d', '#9e9ea6',
    '#b8b8bf', '#d2d2d7', '#e6e6ea', '#f3f3f5', '#fafafa',
  ]),
  floresta: neutra('#07110c', '#0e1c15', [
    '#13261c', '#193025', '#254235', '#375a49', '#5f8372', '#8fb1a1',
    '#abc6b9', '#c8dcd2', '#e0ede6', '#eff7f2', '#f8fbf9',
  ]),
};

/** Metadados de exibição (o app usa id, nome, escuro e amostra). */
const THEME_META = [
  { id: 'claro', nome: 'Claro', escuro: false, amostra: ['#f8fafc', '#ffffff', '#2563eb'] },
  { id: 'suave', nome: 'Suave', escuro: false, amostra: ['#e9edf2', '#f7f8fa', '#2563eb'] },
  { id: 'escuro', nome: 'Escuro', escuro: true, amostra: ['#0b1120', '#131c2f', '#3b82f6'] },
  { id: 'meianoite', nome: 'Meia-noite', escuro: true, amostra: ['#060a18', '#0c1330', '#3b82f6'] },
  { id: 'grafite', nome: 'Grafite', escuro: true, amostra: ['#111113', '#1b1b1e', '#3b82f6'] },
  { id: 'floresta', nome: 'Floresta', escuro: true, amostra: ['#07110c', '#0e1c15', '#16a34a'] },
];

function escalasDoTema(id) {
  const meta = THEME_META.find((t) => t.id === id);
  const neutraTema = NEUTRAS[id];
  const esc = meta.escuro;
  const out = { slate: neutraTema.slate };
  for (const cor of CHROMA) {
    out[cor] = esc ? escuro(colors[cor]) : claro(cor);
  }
  // Floresta: o "azul" de destaque vira verde da marca.
  if (id === 'floresta') {
    out.blue = { ...escuro(colors.green), 600: colors.green[600] };
  }
  return out;
}

/** CSS `html[data-theme='id'] { --c-...: ... }` para todos os temas. */
function cssDosTemas() {
  const blocos = {};
  for (const meta of THEME_META) {
    const t = NEUTRAS[meta.id];
    const linhas = [
      `--canvas: ${canais(t.canvas)};`,
      `--surface: ${canais(t.surface)};`,
      `color-scheme: ${meta.escuro ? 'dark' : 'light'};`,
    ];
    const escalas = escalasDoTema(meta.id);
    for (const [cor, tons] of Object.entries(escalas)) {
      for (const s of SHADES) linhas.push(`--c-${cor}-${s}: ${canais(tons[s])};`);
    }
    const seletor =
      meta.id === 'claro' ? `:root, html[data-theme='claro']` : `html[data-theme='${meta.id}']`;
    blocos[seletor] = Object.fromEntries(
      linhas.map((l) => {
        const [k, v] = l.split(/:(.*)/s);
        return [k.trim(), v.replace(/;$/, '').trim()];
      }),
    );
  }
  return blocos;
}

/** Objeto `colors` do Tailwind apontando para as variáveis. */
function coresTailwind() {
  const out = {};
  for (const cor of ['slate', ...CHROMA]) {
    out[cor] = Object.fromEntries(
      SHADES.map((s) => [s, `rgb(var(--c-${cor}-${s}) / <alpha-value>)`]),
    );
  }
  return out;
}

module.exports = { THEME_META, cssDosTemas, coresTailwind, SHADES };
