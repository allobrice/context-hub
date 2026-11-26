/**
 * « Proposer comme contexte » (mission terminée, maquette 38) : préremplit l'éditeur avec le résultat.
 * Le contexte reste un brouillon, relu et publié par un humain après le scan du serveur.
 */
import type { DoneMission } from '@context-hub/domain/missions/types.ts'

import { deliverableLabel } from './missionDetailPresentation.ts'

/** Description d'un contexte : une ligne de 160 caractères au plus. */
export const PROPOSAL_DESCRIPTION_MAX_LENGTH = 160

export interface ContextProposal {
  readonly title: string
  readonly description: string
  readonly content: string
}

/** Une cellule de tableau Markdown tient sur une ligne et n'ouvre pas de colonne. */
function tableCell(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function truncate(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`
}

export function missionProposal(mission: DoneMission): ContextProposal {
  const { result } = mission
  const metrics =
    result.metrics.length === 0
      ? []
      : [
          '',
          '## Mesures',
          '',
          '| Mesure | Avant | Après |',
          '| --- | --- | --- |',
          ...result.metrics.map(
            (metric) =>
              `| ${tableCell(metric.name)} | ${tableCell(metric.before)} | ${tableCell(metric.after)} |`,
          ),
        ]
  const deliverables =
    result.deliverables.length === 0
      ? []
      : [
          '',
          '## Livrables',
          '',
          ...result.deliverables.map((item) => `- ${deliverableLabel(item)}`),
        ]
  return {
    title: mission.title,
    description: truncate(mission.summary, PROPOSAL_DESCRIPTION_MAX_LENGTH),
    content: [
      `# ${mission.title}`,
      '',
      result.summary,
      ...metrics,
      ...deliverables,
      '',
      `> Issu de la mission ${mission.slug}. À relire avant publication.`,
    ].join('\n'),
  }
}
