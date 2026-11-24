# Boodschappen-app

Statische web-app (PWA), geen build-stap nodig. Alles in deze map kan zo online gezet worden.

## Opbouw
- `index.html`, `css/app.css`: schil en opmaak (stijl Rozenklei).
- `js/main.js`: schermen Weekmenu, Recepten, Lijst, Voorraad.
- `js/store.js`: gegevenslaag met `load/save/subscribe`. `LocalAdapter` = IndexedDB op het toestel (zonder account).
- `js/cloud.js`: `CloudAdapter` op Firebase (Firestore + Auth, SDK via gstatic). Slaat alleen gewijzigde velden op, zodat twee mensen tegelijk kunnen afvinken. Werkt ook offline (wijzigingen worden later verstuurd).
- `js/account.js`: inlogscherm, huishouden beginnen/meedoen met code, uitnodigen, en de Samen-kaart op het Voorraad-scherm.
- `js/firebase-config.js`: projectgegevens van Firebase. Staat hier `null`, dan werkt de app alleen lokaal zoals voorheen.
- `firestore.rules`: beveiligingsregels (plakken in Firebase > Firestore > Regels). Alleen leden van een huishouden kunnen de gegevens lezen of wijzigen.
- `js/model.js`: weken en het samenstellen van de boodschappenlijst.
- `js/ingredients.js`: ingrediëntregels ontleden, optellen, categoriseren, voorraadkast herkennen.
- `js/importer.js`: recept via link (schema.org Recipe), geplakte tekst of foto (tekstherkenning met Tesseract.js, taal nld).
- `sw.js` + `manifest.webmanifest`: installeren op het beginscherm, offline openen, en "Delen naar Boodschappen" vanuit Chrome op Android.

## Samen live werken
1. Maak een Firebase-project, zet Authentication > E-mail/wachtwoord aan, maak een Firestore-database en plak `firestore.rules` bij Regels.
2. Voeg een web-app toe en zet de `firebaseConfig` in `js/firebase-config.js`.
3. De eerste die inlogt kiest "Begin een huishouden": de gegevens van dat toestel gaan mee. De ander logt in en vult de code in. Op een volgend toestel (bijv. tablet) vraagt de app of de recepten van dat toestel erbij moeten.

## Bekende beperkingen
- Link-import gaat via openbare doorgeefdiensten (CORS). Lukt dat niet, dan kan de tekst geplakt worden. Bij de online opslag komt een eigen ophaalfunctie.
- Werkt alleen volledig via https (installeren, service worker).

## Lokaal testen
`python3 -m http.server 8123` in deze map en open http://localhost:8123
