// Voorbeeldrecepten en een standaard voorraadkast voor de eerste keer opstarten.
import { uid } from './store.js';

const RECIPES = [
  {
    title: 'Shakshuka met feta', minutes: 30, servings: 4, tags: ['Vega', 'Snel'],
    ingredients: ['2 el olijfolie', '1 ui', '2 teentjes knoflook', '1 rode paprika', '1 tl komijnpoeder', '1 tl paprikapoeder', '2 blikken tomatenblokjes', '6 eieren', '100 g feta', '1 bosje koriander', 'zout en peper', '1 stokbrood'],
    steps: ['Snipper de ui, hak de knoflook en snijd de paprika in reepjes.', 'Fruit ui, knoflook en paprika 5 minuten in de olie. Voeg komijn en paprikapoeder toe.', 'Doe de tomatenblokjes erbij en laat 10 minuten pruttelen. Breng op smaak met zout en peper.', 'Maak kuiltjes en breek er de eieren in. Deksel erop, 6 tot 8 minuten garen.', 'Verkruimel de feta erover, bestrooi met koriander en eet met stokbrood.'],
  },
  {
    title: 'Rode linzensoep', minutes: 35, servings: 4, tags: ['Vega', 'Soep'],
    ingredients: ['1 el olijfolie', '2 uien', '2 wortels', '2 teentjes knoflook', '1 tl komijnpoeder', '250 g rode linzen', '1 blik tomatenblokjes', '1 l groentebouillon', '1 citroen', '100 ml kokosmelk'],
    steps: ['Snipper de ui, snijd de wortel in blokjes en hak de knoflook.', 'Fruit alles 5 minuten in de olie met de komijn.', 'Voeg linzen, tomaten en bouillon toe en laat 20 minuten zachtjes koken.', 'Pureer de soep, roer de kokosmelk erdoor en breng op smaak met citroensap.'],
  },
  {
    title: 'Pasta pesto met kip', minutes: 25, servings: 4, tags: ['Pasta', 'Snel'],
    ingredients: ['400 g penne', '300 g kipfilet', '1 el olijfolie', '1 potje groene pesto', '250 g cherrytomaten', '75 g rucola', '40 g parmezaan', '2 el pijnboompitten'],
    steps: ['Kook de pasta volgens de verpakking.', 'Snijd de kip in reepjes en bak gaar in de olie.', 'Rooster de pijnboompitten kort in een droge pan.', 'Meng pasta, kip, pesto en gehalveerde tomaatjes. Serveer met rucola, parmezaan en pijnboompitten.'],
  },
  {
    title: 'Thaise groene curry', minutes: 30, servings: 4, tags: [],
    ingredients: ['300 g pandanrijst', '2 el groene currypasta', '1 blik kokosmelk', '400 g kippendijen', '250 g sperziebonen', '1 rode paprika', '1 el vissaus', '1 limoen', '1 bosje koriander'],
    steps: ['Kook de rijst.', 'Bak de currypasta 1 minuut in een wok, voeg de kip toe en bak rondom bruin.', 'Voeg kokosmelk, sperziebonen en paprika toe en laat 10 minuten sudderen.', 'Breng op smaak met vissaus en limoensap, bestrooi met koriander.'],
  },
];

const PANTRY = ['zout', 'peper', 'olijfolie', 'zonnebloemolie', 'komijnpoeder', 'paprikapoeder', 'kerriepoeder', 'oregano', 'tijm', 'kaneel', 'bouillonblokje', 'groentebouillon', 'sojasaus', 'vissaus', 'azijn', 'mosterd', 'bloem', 'suiker', 'knoflook'];

export async function seed(store) {
  const now = Date.now();
  await store.update('recipes', (rs) => {
    RECIPES.forEach((r, i) => { const id = uid(); rs[id] = { ...r, id, image: '', source: '', createdAt: now - i * 1000 }; });
  });
  await store.update('pantry', () => PANTRY.map((name) => ({ id: uid(), name })));
  await store.update('meta', (m) => ({ ...m, seeded: true }));
}
