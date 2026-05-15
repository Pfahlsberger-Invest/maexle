# Maexle Score-Board

Eine kleine React-Webapp zum Tracken, wer beim Maexle wie oft "drueckt".

## Features

- Klick-Counter pro Person mit Tagesstatistik & All-Time-Statistik
- Tabs fuer Heute / All Time
- Bar-Chart und Ranking (weniger Klicks = besser)
- Personen hinzufuegen/entfernen
- Ewige-Schande-Score pro Person (-100 bis +100, verfaellt um -10 alle 5 Min)
- Audit-Trail mit IP, Zeitstempel, Person und Aktion
- Daten werden global via Netlify Function + Netlify Blobs persistiert
- Vorschaltseite mit Tagespasswort im Schema `eskalationXX`
- Standardspieler sind geschuetzt und nicht loeschbar

## Deployment auf Netlify

Fuer die globale Datenhaltung muss die App als Netlify-Projekt mit Build deployed werden, damit die Function unter `netlify/functions/klick-data.js` mit veroeffentlicht wird. Ein reiner Drag-and-Drop-Upload des `dist/`-Ordners reicht fuer globale Speicherung nicht aus.

Netlify installiert beim Build `@netlify/blobs`. Die Blob-Daten bleiben deploy-uebergreifend erhalten.

## Deployment via Git (empfohlen)

1. Repo auf GitHub/GitLab pushen
2. Auf Netlify "Add new site -> Import existing project" waehlen
3. Build-Command: `npm run build`
4. Publish-Directory: `dist`

Die `netlify.toml` ist bereits konfiguriert.

## Lokal entwickeln

```bash
npm install
npm run dev
```

Dann http://localhost:5173 aufrufen.

Hinweis: Mit reinem `npm run dev` nutzt die App den lokalen Fallback, weil die Netlify Function nicht laeuft. Fuer einen lokalen Test der Function kannst du `netlify dev` verwenden.

## Hinweise

- Die App holt deine oeffentliche IP einmalig von api.ipify.org fuer den Audit-Trail.
- Die App speichert den Spielstand global in Netlify Blobs.
- Wenn die Function lokal nicht erreichbar ist, nutzt die App `localStorage` als Fallback.
- Das Tagespasswort wird serverseitig geprueft. `XX` ist der aktuelle Tag im Monat plus 11.
