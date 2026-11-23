# Règles UI/UX permanentes — PhoneStock Pro

**Priorité : mobile-first, zéro débordement horizontal et actions visibles.**

Ces règles doivent être appliquées à tous les écrans actuels et futurs du logiciel (caisse, produits, achats, créances, rapports, dépenses, notifications, paramètres) :

1. **Sur PC**, tableaux et sidebar premium fixe/repliable ; **sur téléphone**, listes de produits et d'opérations en **cartes verticales**, pas de tableaux à faire défiler horizontalement.
2. Une carte produit affiche le nom et le modèle, les prix en FCFA, la quantité, le statut de stock, ainsi que les actions « Détails », « Modifier » et « Stock / IMEI » sans les couper.
3. Les achats fournisseurs sont également des cartes avec fournisseur, date, lignes d'articles et montant.
4. Toutes les interactions doivent être utilisables sans zoom, ni défilement latéral : boutons qui passent à la ligne, textes longs et IMEI coupés intelligemment, espaces `min-width: 0`, colonnes `minmax(0, 1fr)`.
5. Modales compactes avec défilement **vertical interne**, champs dimensionnés à l'écran, boutons visibles et zone de clic confortable.
6. Header sticky, navigation mobile inférieure, sidebar en tiroir. Ne jamais masquer une action nécessaire derrière une colonne hors écran.
7. Vérifier systématiquement les largeurs **320 px, 360 px, 375 px, 390 px, 430 px, 768 px et ordinateur** ainsi que les thèmes jour/nuit.
8. Tester avec des noms longs, IMEI de 15 chiffres, montants FCFA élevés, plusieurs cartes et petites hauteurs d'écran.
9. Les tableaux desktop restent visibles à partir de 761 px. Sur téléphone, utiliser une représentation en cartes ou un composant responsive spécifique, pas seulement `overflow-x: auto`.
10. Après chaque mise à jour Git dans Docker Desktop Windows, redémarrer Vite si nécessaire et recharger la page pour vérifier le code réel.

## Critères d'acceptation

- Aucun élément essentiel n'est coupé, tronqué sans alternative ou inaccessible sur petit écran.
- Toutes les actions produit peuvent être exécutées en tactile sur 320–430 px.
- Les listes produits et achats sont des cartes mobiles et des tableaux desktop.
- La page entière ne défile pas horizontalement à cause d'un contenu trop large.
- Les nouveaux modules respectent les mêmes règles avant fusion.
