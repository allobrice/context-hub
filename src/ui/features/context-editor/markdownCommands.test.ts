import { describe, expect, it } from 'vitest'

import { applyMarkdownCommand } from './markdownCommands.ts'

const select = (value: string, start: number, end = start) => ({ value, start, end })

describe('applyMarkdownCommand', () => {
  it('met en gras la sélection et la garde sélectionnée', () => {
    expect(applyMarkdownCommand(select('un mot ici', 3, 6), 'bold')).toEqual({
      value: 'un **mot** ici',
      start: 5,
      end: 8,
    })
  })

  it('insère un texte de remplacement sélectionné sans sélection', () => {
    expect(applyMarkdownCommand(select('', 0), 'italic')).toEqual({
      value: '_texte_',
      start: 1,
      end: 6,
    })
  })

  it('code en ligne ou bloc selon la sélection', () => {
    expect(applyMarkdownCommand(select('useFetch', 0, 8), 'code').value).toBe('`useFetch`')
    expect(applyMarkdownCommand(select('a\nb', 0, 3), 'code').value).toBe('```\na\nb\n```')
  })

  it('préfixe les lignes touchées (titre, liste), sans doubler le préfixe', () => {
    expect(applyMarkdownCommand(select('un\ndeux', 1, 5), 'list').value).toBe('- un\n- deux')
    expect(applyMarkdownCommand(select('- déjà', 2), 'list').value).toBe('- déjà')
    expect(applyMarkdownCommand(select('Titre', 2), 'heading').value).toBe('## Titre')
  })

  it('crée un lien et sélectionne l’URL à compléter', () => {
    const result = applyMarkdownCommand(select('voir doc', 5, 8), 'link')
    expect(result.value).toBe('voir [doc](https://)')
    expect(result.value.slice(result.start, result.end)).toBe('https://')
  })
})
