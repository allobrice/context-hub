# Prompt Claude Code — implémentation de l'UI Context Hub

À coller dans Claude Code, lancé à la racine du projet (qui ne contient que `design-kit/`).

---

# Mission
Construire l'UI de gestion de **Context Hub** en React 19 + TypeScript strict, dans ce dossier.
Context Hub centralise des « contextes » Markdown réutilisables, versionnés et partagés, que les sessions Claude Code lisent via un serveur MCP.
Le serveur MCP et l'API n'existent pas encore : l'UI doit tourner seule, avec des données mockées derrière une interface remplaçable.

# Références (à lire avant de planifier)
- `design-kit/README.md` : contenu du kit.
- `design-kit/SPEC.md` : **spec fonctionnelle et visuelle, source de vérité** (modèle de domaine, design system, écrans, états).
- `design-kit/maquettes/png/*.png` : rendu attendu de chaque écran et de chaque état. Ouvre-les avec l'outil Read avant d'implémenter un écran.
- `design-kit/maquettes/html/*.html` : maquettes statiques, avec le markup, les styles inline et les icônes SVG exacts. Reprends-y les tracés SVG, les espacements et les libellés.
- `design-kit/maquettes/manifest.json` : correspondance entre maquette, écran et état.
- `design-kit/tokens/` : tokens de couleur et de thème, à transcrire en SCSS.
- `design-kit/sources/*.dc.html` : sources Claude Design (non exécutables hors de Claude Design ; utiles pour voir la logique d'état dans `renderVals()`).
`design-kit/` est en lecture seule : ne le modifie pas, ne l'importe pas dans le bundle, et exclus-le d'ESLint, Prettier et tsconfig.

# Mode de travail
1. **Commence en plan mode.** Ne crée aucun fichier avant que j'aie validé ton plan (arborescence, dépendances, découpage en phases).
2. Le dossier n'est pas vide (`design-kit/`) : scaffolde sans écraser ce dossier.
3. Travaille phase par phase. À la fin de chaque phase : `npm run typecheck && npm run lint && npm run test` au vert, puis un résumé de 5 lignes maximum, et tu t'arrêtes pour validation.
4. Pour chaque écran : relis les PNG concernés, implémente, puis compare ton rendu aux maquettes. Si un outil de capture navigateur est disponible, fais une capture à 1440 px et compare-la au PNG ; sinon, liste les écarts connus.
5. Pour chaque dépendance, vérifie la dernière version stable (`npm view <pkg> version`).
6. Si un point est ambigu, ou si une maquette contredit SPEC.md, pose-moi la question.

# Skills à utiliser (plugin frontend-toolkit)
Charge chaque skill avec l'outil Skill au moment indiqué et applique ses règles :
| Skill | Quand |
|---|---|
| `frontend-toolkit:auditing-architecture` | Phase 0 pour valider l'arborescence et les dépendances entre couches, puis en audit final |
| `frontend-toolkit:developing-typescript` | Phase 1 (modèle de domaine, tsconfig) et chaque fois que tu crées des types |
| `frontend-toolkit:developing-scss` | Phase 2 (tokens, thèmes) puis pour chaque composant stylé |
| `frontend-toolkit:writing-clean-code` | En continu, et en revue à la fin de chaque phase sur les fichiers modifiés |
| `frontend-toolkit:auditing-performance` | Phase 7 (audit final : bundle, rendu des listes, lazy loading) |
Les règles de ces skills priment sur tes habitudes. Si un skill contredit SPEC.md, signale-le.

# Stack imposée
- Vite + React 19 + TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- React Router en data mode (`createBrowserRouter`), routes chargées en lazy
- TanStack Query pour le data fetching
- SCSS Modules + custom properties CSS pour les thèmes (valeurs dans `design-kit/tokens/`). Pas de lib de composants UI, pas de Tailwind.
- Polices via `@fontsource/inter` et `@fontsource/jetbrains-mono`
- `react-markdown` + `remark-gfm` + `rehype-sanitize`. **Jamais de `rehype-raw` ni de `dangerouslySetInnerHTML`** : le contenu d'un contexte est une donnée non fiable.
- Vitest + Testing Library (+ `user-event`), ESLint (flat config) + Prettier

# Architecture
```
src/
  domain/          # types et règles pures (SPEC.md §2), aucune dépendance React
  application/     # ports (interfaces) + cas d'usage
  infrastructure/  # InMemoryContextRepository : fixtures (SPEC.md §6), latence simulée, erreur injectable
  ui/
    app/           # router, providers, layout (sidebar)
    components/    # génériques : Button, Badge, Tag, Segmented, Dialog, Skeleton, EmptyState, ErrorState, CopyField, Icon…
    features/      # library/ context-detail/ context-editor/ taxonomy/
    styles/        # tokens, thèmes, mixins, reset
```
Règle de dépendance : `ui → application → domain` ; `infrastructure` implémente les ports d'`application`.
L'adapter in-memory reproduit les états des maquettes via un query param `?mock=empty|loading|error|slow|conflict`.

# Exigences transverses
- Accessibilité WCAG 2.2 AA (SPEC.md §3) : vrais `<button>` et `<a href>`, `aria-label` sur les boutons icône, `aria-busy` pendant le chargement, `aria-live` pour les copies, `<dialog>` natif.
- Performance : routes en lazy, recherche debouncée + `useDeferredValue`, parser Markdown chargé uniquement sur Détail et Éditeur.
- Tests :
  - unitaires sur tout `domain/` ;
  - composants : les 4 états de la Bibliothèque, la copie d'URI, le blocage de publication, le dialog de fusion.
- Crée un `CLAUDE.md` à la racine : commandes, arborescence, règle de dépendance entre couches, référence à `design-kit/`, interdits (rehype-raw, dangerouslySetInnerHTML, couleurs en dur hors tokens).

# Phases
0. Lecture du kit, plan, validation de l'arborescence (`auditing-architecture`) → **stop**
1. Scaffold, tsconfig strict, lint, test, CLAUDE.md, domaine + tests (`developing-typescript`) → stop
2. Tokens, thèmes, reset, composants génériques (`developing-scss`) → stop
3. Layout + Bibliothèque : maquettes 01–07 → stop
4. Détail : maquettes 08–11 → stop
5. Éditeur : maquettes 12–15 → stop
6. Tags & collections : maquettes 16–22 → stop
7. Audits finaux `auditing-architecture` + `auditing-performance` + passe `writing-clean-code` : findings P0→P3, correction des P0/P1, tableau des écarts restants avec les maquettes → stop
