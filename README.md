# Boodschappen-app (testversie)

Statische web-app (PWA), geen build-stap nodig. Alles in deze map kan zo online gezet worden.

## Opbouw
- `index.html`, `css/app.css`: schil en opmaak (stijl Rozenklei).
- `js/main.js`: schermen Weekmenu, Recepten, Lijst, Voorraad.
- `js/store.js`: gegevenslaag. Nu `LocalAdapter` (IndexedDB op het toestel). Voor samen live werken komt er een online adapter (bijv. Supabase) met dezelfde `load/save/subscribe`, plus login.
- `js/model.js`: weken en het samenstellen van de boodschappenlijst.
- `js/ingredients.js`: ingrediëntregels ontleden, optellen, categoriseren, voorraadkast herkennen.
- `js/importer.js`: recept via link (schema.org Recipe), geplakte tekst of foto (tekstherkenning met Tesseract.js, taal nld).
- `sw.js` + `manifest.webmanifest`: installeren op het beginscherm, offline openen, en "Delen naar Boodschappen" vanuit Chrome op Android.

## Bekende beperkingen testfase
- Gegevens staan per toestel. Overzetten kan met Voorraad > Back-up opslaan/terugzetten.
- Link-import gaat via openbare doorgeefdiensten (CORS). Lukt dat niet, dan kan de tekst geplakt worden. Bij de online opslag komt een eigen ophaalfunctie.
- Werkt alleen volledig via https (installeren, service worker).

## Lokaal testen
`python3 -m http.server 8123` in deze map en open http://localhost:8123
