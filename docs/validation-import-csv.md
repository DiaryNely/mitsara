# Validations import CSV (existantes)

Ce document recense les regles de validation deja en place avant insertion via l import CSV (wizard admin).

## Sources analysees

- newApp/src/services/import/csvParser.js
- newApp/src/api/import.js
- newApp/src/services/import/csvImportService.js
- newApp/src/services/import/taxMapper.js

## Parsing CSV (csvParser.js)

### Regles communes

- Fichier vide -> erreur immediate (Fichier1/2/3 : "fichier vide").
- En-tetes stricts : comparaison insensible a la casse uniquement, accents et caracteres exacts requis.
- Toute colonne manquante ou en trop -> erreur immediate.
- BOM UTF-8 en tete supprime si present.
- Lignes vides ignorees.

### Fichier1 (Produits) : parseFichier1

- En-tetes attendus : date_availability_produit, nom, reference, prix_ttc, Taxe, categorie, prix_achat.
- Lignes avec moins de colonnes que l entete -> ignorees.
- Lignes conservees uniquement si reference et nom sont renseignes.
- Normalisation prix : parsePrice supporte formats FR/EN ; valeur invalide -> 0.

### Fichier2 (Declinaisons) : parseFichier2

- En-tetes attendus : reference, specificite, karazany, stock_initial, prix_vente_ttc.
  - Attention : l en-tete attendu est bien "specificite" avec accent (specificité) dans le CSV.
- Lignes avec moins de 3 colonnes -> ignorees.
- stock_initial -> parseInt, fallback 0.
- prix_vente_ttc -> parsePrice si renseigne, sinon null.

### Fichier3 (Commandes) : parseFichier3

- En-tetes attendus : date, nom, email, pwd, adresse, achat, etat.
- Lignes avec moins de colonnes que l entete -> ignorees.
- Champ achat parse par parseAchatField (voir ci-dessous).

### Champ achat : parseAchatField

- Valeurs vides, "[]" -> tableau vide.
- Entrees avec quantite non numerique ou <= 0 -> ignorees.
- Entrees sans reference -> ignorees.
- Dedupe : meme reference + meme variante (case-insensitive) fusionnees en additionnant les quantites.
- Variante : trim ; variante vide -> null.

## Validation metier pre-import (api/import.js -> validateImportData)

### Fichier1 (Produits)

- nom obligatoire.
- reference obligatoire et unique.
- prix_ttc obligatoire, numerique, strictement positif.
- prix_achat optionnel mais >= 0 si renseigne.
- taxe optionnelle ; si renseignee doit etre numerique >= 0 (accepte "," ou "%").
- categorie obligatoire.
- date_availability_produit optionnelle ; si renseignee doit etre au format strict DD/MM/YYYY.

### Fichier2 (Declinaisons)

- reference obligatoire.
- reference doit exister dans le fichier produits.
- stock_initial doit etre numerique >= 0.
- prix_vente_ttc optionnel ; si renseigne doit etre strictement positif.
- Une seule specificite par produit (taille OU couleur, jamais les deux).

### Fichier3 (Commandes)

- email obligatoire + format valide.
- nom obligatoire.
- date obligatoire ; format strict DD/MM/YYYY (heure optionnelle HH:MM[:SS]).
- Chaque item achat : reference produit doit exister ; quantity > 0.
- etat : pas de validation en phase 0 (interprete plus tard).

### Validation de dates (api/import.js)

- normalizeCsvOrderDate : accepte strictement DD/MM/YYYY + heure optionnelle, verifie date gregorienne valide et heures/min/sec dans les bornes.
- normalizeCsvAvailabilityDate : accepte strictement DD/MM/YYYY, verifie date gregorienne valide.

## Utilitaires CSV generiques (csvImportService.js)

- parseCsvFile :
  - Rejet si aucun en-tete detecte.
  - Ignore lignes vides (toutes les valeurs vides).
- parseXmlSafe : XML invalide -> erreur.
- parseSchemaXml / buildXmlForRow :
  - Champs interdits en creation : id.
  - Valeurs undefined/null ignorees.
  - Valeurs vides ignorees apres normalisation.
  - Champs position < 1 normalises a "1" ; si pas mappes et vides/<=0 -> supprimes.
  - Associations nettoyees du schema avant remplissage.

## Taxe (taxMapper.js)

- normalizeTaxRateNumber : valeur vide ou non numerique -> NaN.
- createTaxRuleGroup : taux de taxe obligatoire, numerique et > 0, sinon erreur.
