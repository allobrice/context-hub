import { Link } from 'react-router'

import { paths } from '../../app/paths.ts'
import { Badge } from '../../components/Badge/Badge.tsx'
import { Button } from '../../components/Button/Button.tsx'
import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { Tooltip } from '../../components/Tooltip/Tooltip.tsx'
import styles from './Editor.module.scss'

export interface EditorHeaderProps {
  /** Titre court du contexte édité, ou null en création. */
  contextTitle: string | null
  draftNumber: number | null
  saveStatus: string
  cancelPath: string
  saving: boolean
  /** Raison du blocage de la publication, ou null si publiable (exposée via aria-describedby). */
  publishBlockedReason: string | null
  onSave: () => void
  onPublish: () => void
}

/** En-tête de l'Éditeur (maquettes 12–15) : fil d'Ariane, statut d'enregistrement, actions. */
export function EditorHeader({
  contextTitle,
  draftNumber,
  saveStatus,
  cancelPath,
  saving,
  publishBlockedReason,
  onSave,
  onPublish,
}: EditorHeaderProps) {
  const heading = contextTitle === null ? 'Nouveau contexte' : 'Modifier le contexte'
  const publishBlocked = publishBlockedReason !== null
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <nav aria-label="Fil d’Ariane">
          <ol className={styles.breadcrumb}>
            <li>
              <Link to={paths.library}>Bibliothèque</Link>
            </li>
            <li aria-current="page">
              {contextTitle === null ? 'Nouveau contexte' : `${contextTitle} / Édition`}
            </li>
          </ol>
        </nav>
        <div className={styles.titleLine}>
          <h1 className={styles.title}>{heading}</h1>
          <Badge tone="warn" dot>
            {draftNumber === null ? 'Brouillon' : `Brouillon v${draftNumber}`}
          </Badge>
        </div>
      </div>
      <span className={styles.saveStatus} role="status">
        {saveStatus}
      </span>
      <ButtonLink to={cancelPath} variant="ghost">
        Annuler
      </ButtonLink>
      <Button onClick={onSave} disabled={saving}>
        Enregistrer le brouillon
      </Button>
      <Tooltip content={publishBlockedReason ?? 'Publier pour les sessions de la portée'}>
        {(trigger) => (
          <Button
            variant="primary"
            aria-disabled={publishBlocked || saving}
            {...trigger}
            onClick={() => {
              if (!publishBlocked && !saving) onPublish()
            }}
          >
            {draftNumber === null ? 'Publier' : `Publier la v${draftNumber}`}
          </Button>
        )}
      </Tooltip>
    </header>
  )
}
