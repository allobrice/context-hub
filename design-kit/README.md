# design-kit — Context Hub UI v1

Kit de référence pour implémenter l'UI de gestion de Context Hub en React. À placer à la racine du projet. Il est **en lecture seule** : ne pas l'importer dans le bundle, et l'exclure du lint et du tsconfig.

## Contenu

| Chemin | Rôle |
|---|---|
| `PROMPT.md` | Prompt à coller dans Claude Code pour lancer l'implémentation |
| `SPEC.md` | Spécification fonctionnelle et visuelle, **source de vérité** |
| `index.html` | Galerie de toutes les maquettes (ouvrir dans un navigateur) |
| `maquettes/png/` | 22 captures à 1440 px de large, pleine page : le rendu attendu |
| `maquettes/html/` | Les mêmes maquettes en HTML statique (markup, styles inline, SVG), sans JS |
| `maquettes/manifest.json` | Pour chaque maquette : id, titre, écran, état (props), chemins |
| `maquettes/fonts/` | Inter et JetBrains Mono (woff2, latin), utilisées par les maquettes |
| `tokens/tokens.css` | Custom properties : base + thèmes `[data-theme="light"\|"dark"]` |
| `tokens/tokens.json` | Les mêmes tokens en JSON, plus le mapping des statuts |
| `sources/*.dc.html` | Sources Claude Design d'origine (logique d'état dans `renderVals()`) ; non exécutables hors de Claude Design |

## Maquettes

| # | Écran | État |
|---|---|---|
| 01–07 | Bibliothèque | tableau, cartes, sombre, vide, chargement, erreur, aucun résultat |
| 08–11 | Détail | normal, sombre, chargement, introuvable (404) |
| 12–15 | Création / édition | secret détecté + autocomplétion des tags, sombre (scan OK), création vide, conflit de version |
| 16–22 | Tags & collections | tags + renommage inline, fusion, sombre, chargement, vide, collections, suppression de collection |

## Limites
- Les maquettes HTML sont des rendus figés : les interactions (bascules, copie, onglets, thème) sont décrites dans `SPEC.md` §1 et visibles dans `sources/`.
- Les données affichées sont des fixtures de démo. `[HÔTE]` est un placeholder pour l'URL du serveur MCP.
- Canvas d'origine (éditable) : https://claude.ai/artifact/4UksXpND7p1h4dLP4wCvCz

## Licences des polices
Inter (© The Inter Project Authors) et JetBrains Mono (© The JetBrains Mono Project Authors), sous SIL Open Font License 1.1. Fichiers issus de `@fontsource/inter` et `@fontsource/jetbrains-mono`.
