# Netlify Deploy

Dieses Projekt nutzt Netlify Functions und Netlify Blobs fuer globale Speicherung.

Bitte nicht nur den `dist`-Ordner per Drag and Drop hochladen. Dabei werden Functions nicht gebaut.

Empfohlener Weg:

1. ZIP entpacken.
2. Den Ordner `maexle-score-board` in ein GitHub- oder GitLab-Repository hochladen.
3. In Netlify: Add new site -> Import existing project.
4. Build command: `npm run build`
5. Publish directory: `dist`

Die `netlify.toml` ist bereits passend konfiguriert.

Nach dem ersten Deploy speichert die App den Spielstand global in Netlify Blobs.
