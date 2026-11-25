import { describe, expect, it } from 'vitest'

import {
  OPTIONAL_PROMPT_SECTIONS,
  PROMPT_SECTION_TITLES,
  REQUIRED_PROMPT_SECTIONS,
  promptTemplateSkeleton,
  validatePromptTemplate,
  type PromptSection,
} from './template.ts'

const BODIES: Readonly<Record<PromptSection, string>> = {
  objective: 'Réduire le LCP de la page d’accueil.',
  finding: 'LCP 4,2 s mesuré le 2026-11-20 sur abc1234.',
  files: '- `pages/index.vue`',
  todo: '1. Précharger l’image héros.',
  acceptance: '- LCP < 2,5 s',
  constraints: 'Ne pas toucher au SSR.',
  linkedContexts: '- perf-nuxt',
}

function promptWith(sections: readonly PromptSection[]): string {
  return sections
    .map((section) => `## ${PROMPT_SECTION_TITLES[section]}\n\n${BODIES[section]}\n`)
    .join('\n')
}

const COMPLETE = promptWith(REQUIRED_PROMPT_SECTIONS)

describe('constantes du gabarit', () => {
  it('sépare les sections obligatoires et facultatives', () => {
    expect(REQUIRED_PROMPT_SECTIONS).toEqual([
      'objective',
      'finding',
      'files',
      'todo',
      'acceptance',
    ])
    expect(OPTIONAL_PROMPT_SECTIONS).toEqual(['constraints', 'linkedContexts'])
  })
})

describe('validatePromptTemplate', () => {
  it('accepte un prompt complet, avec ou sans sections facultatives', () => {
    expect(validatePromptTemplate(COMPLETE)).toEqual({ ok: true })
    expect(
      validatePromptTemplate(
        promptWith([...REQUIRED_PROMPT_SECTIONS, ...OPTIONAL_PROMPT_SECTIONS]),
      ),
    ).toEqual({ ok: true })
  })

  it.each(REQUIRED_PROMPT_SECTIONS)('signale la seule section manquante : %s', (absent) => {
    const prompt = promptWith(REQUIRED_PROMPT_SECTIONS.filter((section) => section !== absent))
    expect(validatePromptTemplate(prompt)).toEqual({ ok: false, missing: [absent] })
  })

  it.each(['', '   \n\n', 'Du texte sans aucun titre.'])(
    'signale les 5 sections pour %j',
    (prompt) => {
      expect(validatePromptTemplate(prompt)).toEqual({
        ok: false,
        missing: REQUIRED_PROMPT_SECTIONS,
      })
    },
  )

  it("rend `missing` dans l'ordre du gabarit, quel que soit l'ordre du prompt", () => {
    const prompt = promptWith(['acceptance', 'objective'])
    expect(validatePromptTemplate(prompt)).toEqual({
      ok: false,
      missing: ['finding', 'files', 'todo'],
    })
  })

  it.each([
    ['objective', '# objectif'],
    ['objective', '###### OBJECTIF'],
    ['objective', '## Objectif :'],
    ['objective', '## Objectif:'],
    ['objective', '## Objectif ##'],
    ['objective', '   ## Objectif'],
    ['todo', '## A faire'],
    ['todo', '## a  FAIRE'],
    ['todo', '## À faire.'],
    ['acceptance', "## Criteres d'acceptation"],
    ['acceptance', '## Critères d’acceptation'],
    ['acceptance', '##\tCRITÈRES   D’ACCEPTATION :'],
  ] as const)('reconnaît la variante de titre %s : %j', (section, heading) => {
    const others = REQUIRED_PROMPT_SECTIONS.filter((candidate) => candidate !== section)
    const prompt = `${promptWith(others)}\n${heading}\n\n${BODIES[section]}\n`
    expect(validatePromptTemplate(prompt)).toEqual({ ok: true })
  })

  it.each(['#Objectif', '    ## Objectif', '####### Objectif', '**Objectif**', 'Objectif\n==='])(
    'ne prend pas %j pour un titre ATX',
    (heading) => {
      const others = REQUIRED_PROMPT_SECTIONS.filter((section) => section !== 'objective')
      const prompt = `${heading}\n\n${BODIES.objective}\n\n${promptWith(others)}`
      expect(validatePromptTemplate(prompt)).toEqual({ ok: false, missing: ['objective'] })
    },
  )

  it('compte une section au corps vide comme manquante', () => {
    const prompt = COMPLETE.replace(BODIES.finding, '   \n\t')
    expect(validatePromptTemplate(prompt)).toEqual({ ok: false, missing: ['finding'] })
  })

  it('compte comme manquante une section suivie seulement de sous-titres vides', () => {
    const prompt = COMPLETE.replace(BODIES.files, '### Front\n\n### Back\n')
    expect(validatePromptTemplate(prompt)).toEqual({ ok: false, missing: ['files'] })
  })

  it('accepte un corps porté par une sous-section', () => {
    const prompt = COMPLETE.replace(BODIES.files, '### Front\n\n- `pages/index.vue`')
    expect(validatePromptTemplate(prompt)).toEqual({ ok: true })
  })

  it('termine un corps au titre suivant de niveau supérieur', () => {
    const prompt = `${promptWith(['objective', 'finding', 'files', 'todo'])}\n### Critères d'acceptation\n# Annexe\n\nDu texte.\n`
    expect(validatePromptTemplate(prompt)).toEqual({ ok: false, missing: ['acceptance'] })
  })

  it('accepte une section présente deux fois si une occurrence est remplie', () => {
    const prompt = `## Objectif\n\n${COMPLETE}`
    expect(validatePromptTemplate(prompt)).toEqual({ ok: true })
  })

  it('ignore les titres inconnus', () => {
    const prompt = `# Mission\n\nIntro.\n\n${COMPLETE}\n## Notes diverses\n\nRien.\n`
    expect(validatePromptTemplate(prompt)).toEqual({ ok: true })
  })

  it.each([
    ['```', '```'],
    ['~~~', '~~~'],
    ['````md', '`````'],
  ])('ignore les titres dans un bloc de code %s … %s', (open, close) => {
    const others = REQUIRED_PROMPT_SECTIONS.filter((section) => section !== 'finding')
    const prompt = `${promptWith(others)}\n${open}\n## Constat\n\nFaux constat.\n${close}\n`
    expect(validatePromptTemplate(prompt)).toEqual({ ok: false, missing: ['finding'] })
  })

  it('ne ferme pas un bloc ``` par ~~~ ni par une clôture plus courte', () => {
    const others = REQUIRED_PROMPT_SECTIONS.filter((section) => section !== 'finding')
    const prompt = `${promptWith(others)}\n\`\`\`\`\n~~~\n\`\`\`\n## Constat\n\nFaux.\n\`\`\`\`\n`
    expect(validatePromptTemplate(prompt)).toEqual({ ok: false, missing: ['finding'] })
  })

  it('compte un bloc de code comme contenu de la section', () => {
    const prompt = COMPLETE.replace(BODIES.files, '```\npages/index.vue\n```')
    expect(validatePromptTemplate(prompt)).toEqual({ ok: true })
  })

  it('accepte les fins de ligne CRLF', () => {
    expect(validatePromptTemplate(COMPLETE.replaceAll('\n', '\r\n'))).toEqual({ ok: true })
  })

  it('reste linéaire sur une entrée hostile', () => {
    const hostile = `## ${'#'.repeat(50_000)} ${' :'.repeat(50_000)}\n${'~'.repeat(50_000)}`
    expect(validatePromptTemplate(hostile)).toEqual({
      ok: false,
      missing: REQUIRED_PROMPT_SECTIONS,
    })
  })
})

describe('promptTemplateSkeleton', () => {
  it('contient les 5 titres obligatoires en niveau 2, dans l’ordre', () => {
    const headings = promptTemplateSkeleton()
      .split('\n')
      .filter((line) => line.startsWith('## '))
    expect(headings).toEqual(REQUIRED_PROMPT_SECTIONS.map((s) => `## ${PROMPT_SECTION_TITLES[s]}`))
  })

  it('est refusé tant que les sections ne sont pas remplies', () => {
    expect(validatePromptTemplate(promptTemplateSkeleton())).toEqual({
      ok: false,
      missing: REQUIRED_PROMPT_SECTIONS,
    })
  })
})
