# The Vinyl Drop — Chat History Summary

> Gecomprimeerde werkgeschiedenis. Deze file bevat alleen beslissingen, belangrijke bevindingen, architectuurafspraken en de actuele status die nodig is om verder te werken.

## 1. Productvisie

The Vinyl Drop is in de eerste plaats een **lokale community marketplace voor vinyl**, niet een klassieke webwinkel.

De eerste doelgroep is Amsterdam Oost, daarna de rest van Amsterdam.

De kernervaring is:

**Online vinyl ontdekken → contact leggen → in het echt afspreken → plaat bekijken → eventueel samen een biertje drinken → deal sluiten.**

Daarom zijn voorlopig geen complexe landelijke verzendinfrastructuur, zware checkout/betalingslogica of uitgebreide belasting-/administratiecomplexiteit het uitgangspunt.

Professionaliteit zit voor nu vooral in de kwaliteit van de software, data, UX en betrouwbaarheid van de community marketplace.

---

## 2. Fase 1 — status

Fase 1 is in hoofdzaak afgerond.

Als afgerond behandeld:
- infrastructuur, CI, dispatcher en safety gates;
- EJS shell en design-system tokens;
- Supabase authentication;
- profile management;
- Drizzle/PostgreSQL data foundation;
- domain model: Release → PhysicalCopy → Listing;
- listing creation;
- image upload pipeline;
- listing lifecycle;
- PhysicalCopy forward migration;
- Phase 5 Discovery:
  - /browse
  - /search
  - listing detail
  - comments/CSRF
  - seller profiles
  - foutpropagatie.

PR #38 / Issue #37 (PhysicalCopy forward migration) is volgens de chat naar main gemerged.

PR #36 / Issue #13 betreft Phase 5 Discovery.

Belangrijke afspraak: PR #36 moet vóór merge altijd met de actuele main worden gereconcilieerd.

---

## 3. Belangrijk productinzicht: release catalogus

De eerste implementatie van + DROP vereiste dat een release al in de lokale database stond. Dat leverde slechts een paar testalbums op en is niet geschikt voor de echte use case.

De gebruiker heeft een grote collectie met onder andere:
- LP's;
- 12-inches;
- 7-inches;
- white labels;
- zeldzame en mogelijk niet-geïndexeerde releases.

Het juiste model is daarom:

### Canonical Release

Een Release bevat gedeelde metadata over een uitgave, zoals:
- artiest;
- titel;
- jaar;
- format;
- label;
- catalogusnummer;
- barcode;
- genre;
- cover art;
- externe bron/id wanneer beschikbaar.

### PhysicalCopy

Een PhysicalCopy beschrijft het specifieke exemplaar van de verkoper, bijvoorbeeld:
- conditie;
- prijs;
- eigen foto's;
- overige exemplaar-specifieke informatie.

### Listing

Een listing maakt het fysieke exemplaar verkoopbaar/ruilbaar binnen de marketplace.

**Een verkoper mag nooit afhankelijk zijn van een vooraf gevulde lijst met enkele releases.**

---

## 4. External Catalog Enrichment

De gewenste flow voor + DROP is:

1. Verkoper zoekt een release op barcode, catalogusnummer, artiest of albumtitel.
2. Het platform zoekt metadata in een externe catalogus, bijvoorbeeld Discogs.
3. De gevonden release wordt geïmporteerd of gekoppeld aan de canonieke PostgreSQL `releases` tabel.
4. De verkoper hoeft alleen zijn eigen exemplaargegevens in te vullen:
   - conditie;
   - prijs;
   - foto's;
   - eventueel beschrijving.
5. Daarna wordt de listing aangemaakt.

Externe catalogi zijn **enrichment sources**; PostgreSQL blijft de eigen source of truth voor de applicatie.

---

## 5. Custom releases

Een externe catalogus zal niet alles bevatten.

Daarom moet er naast catalogusimport een eenvoudige fallback bestaan voor:
- white labels;
- test pressings;
- promos;
- bootlegs;
- lokale/private pressings;
- andere releases die niet gevonden worden.

De gebruiker moet in dat geval snel zelf een canonical Release kunnen maken en direct doorgaan naar het aanmaken van zijn PhysicalCopy/listing.

De custom flow moet minimaal rekening houden met:
- artiest;
- titel;
- label;
- jaar;
- format;
- genre;
- optioneel catalogusnummer;
- optionele notitie/tag voor white label of vergelijkbare gevallen.

---

## 6. Fase 2 richting

In de chat zijn de volgende pijlers als logische vervolgstappen benoemd.

### A. Catalogus & release creation
Prioriteit:
1. externe cataloguszoekfunctie;
2. automatische metadata/import;
3. custom release fallback.

### B. Community
Later:
- listing Q&A/comments;
- seller activity;
- community/feed-functionaliteit.

### C. Trade
Later:
- trade offers;
- direct contact / onderhandeling.

### D. Mobile & bulk upload
Later:
- camera-first upload;
- sneller meerdere drops achter elkaar plaatsen.

De precieze issue-indeling kan later worden afgestemd op de huidige GitHub-status. De inhoudelijke richting staat wel vast: **eerst een veel betere release/drop-flow bouwen.**

---

## 7. GitHub-status aan het einde van deze chat

De laatste relevante toestand uit de chat:

- main bevat inmiddels de migraties en de Discogs/cataloguswijzigingen die in de chat als onderdeel van Fase 2 zijn ontwikkeld.
- De meest recente genoemde main commit was `030da1c95`.
- De Phase 5 branch was:
  `feature/issue-13-phase-5-discovery-6911120434680647110`
- De genoemde branch-head was `e266d911`.
- Volgens de chat liep deze branch 4 commits achter op main en waren de histories diverged.
- PR #36 was daarom **NOT READY**.

### Belangrijkste blocker

PR #36 moet eerst opnieuw met de actuele main worden gesynchroniseerd.

Bij die reconciliation mag niets van deze drie groepen verloren gaan:

1. bestaande Phase 5 discovery/profile/comment functionaliteit;
2. actuele migraties en andere wijzigingen uit main;
3. actuele catalogus/Discogs- en cover-art functionaliteit uit main.

### Specifiek cover-art aandachtspunt

main bevat volgens de laatste review `Release.coverArtUrl` en gebruikt dit als fallback wanneer een listing geen eigen foto heeft.

Bij de merge van PR #36 moet dit gedrag behouden blijven.

### Specifiek workflow/safety aandachtspunt

De Phase 5 branch bevatte volgens de laatste review ook wijzigingen aan:

`.github/workflows/phase-safety-gate.yml`

Dat hoort niet bij het inhoudelijke Phase 5 werk. Bij reconciliation moet daarom de **huidige versie uit main leidend blijven**, tenzij er expliciet een inhoudelijk onderbouwde reden is om de workflow te wijzigen.

---

## 8. Laatste reviewbesluit voor PR #36

**PR #36: NOT READY**

Niet mergen voordat:
- de branch met de actuele main is gereconcilieerd;
- er geen Phase 5-werk verloren is gegaan;
- de migratieketen intact is;
- catalogus/Discogs wijzigingen intact zijn;
- `Release.coverArtUrl` fallback intact is;
- de huidige Safety Gate uit main behouden blijft;
- lint, typecheck, tests, build en migratieverificatie opnieuw succesvol zijn uitgevoerd.

---

## 9. Werkafspraak voor vervolg

De volgende stap is niet opnieuw de architectuur bespreken, maar **PR #36 technisch afronden tegen de huidige main**.

Daarna:
1. PR #36 opnieuw inhoudelijk reviewen;
2. pas bij een schone reconciliation en groene checks mergen;
3. vervolgens de catalogus/drop-flow verder uitwerken en verfijnen;
4. daarna pas community/trade/mobile-bulk werk prioriteren.

---

## 10. Ontwerpprincipe om actief te bewaken

The Vinyl Drop moet een **eenvoudige community marketplace-ervaring** houden:

> Een plaat moet zo makkelijk mogelijk van fysieke verzameling naar online drop kunnen gaan.

Dus niet:

**formulier invullen → allerlei administratieve stappen → pas veel later listing**

maar:

**release herkennen → gegevens automatisch invullen → eigen exemplaargegevens toevoegen → foto's → drop.**

Voor zeldzame releases:

**niet gevonden → custom release maken → direct verder.**

Dat is een kernprincipe voor de verdere ontwikkeling.
