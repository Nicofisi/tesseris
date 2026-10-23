# Tesseris

Przytulny tetris w przeglądarce, w **dwóch, trzech, czterech i pięciu wymiarach**. Na imprezę: każdy może spróbować, a lokalny ranking pamięta, kto ile ugrał.

**▶ Zagraj: https://nicofisi.github.io/tesseris/**

## Wymiary

- **2D, klasyk:** zwykły tetris 10 × 20 z obrotami SRS, schowkiem, duchem klocka i T-spinami.
- **3D, studnia:** patrzysz do studni z góry, klocki są z sześcianów, a znika cała zapełniona warstwa podłogi. Rozmiary od 4 × 4 do 10 × 10.
- **4D, hiperstudnia:** kilka studni obok siebie tworzy jedną przestrzeń 4D. Czwarty wymiar biegnie między studniami: klocek może leżeć w kilku naraz i spada, gdy w którejkolwiek na coś trafi. Warstwa znika w każdej studni osobno (albo, w trybie hardkor, tylko gdy jest pełna we wszystkich).
- **5D, szaleństwo:** studnie tworzą siatkę, aż do 10 × 10 = 100 studni. Raczej dla beki.

Do wyboru maraton (do przegranej) albo gra na czas (3 minuty, dobra do rywalizacji na imprezie). Po grze wpisujesz albo wybierasz z listy, kto grał, a wynik trafia do rankingu w przeglądarce (localStorage).

## Sterowanie

| | 2D | 3D i wyżej |
|---|---|---|
| ruch | `←` `→` | `←` `↑` `↓` `→` (zawsze tak, jak widać na ekranie) |
| obrót | `↑` / `X`, `Z` w drugą stronę | `Q` `E` wokół pionu, `W` `S` przechył przód/tył, `A` `D` przechył na boki |
| szybciej w dół | `↓` | `F` |
| zrzut | `Spacja` | `Spacja` |
| schowek | `C` | `C` |
| kamera | | przeciąganie myszą, kółko, `Z` `X` obrót o 90°, `V` widok z góry |
| 4D i 5D | | `Shift` + strzałki: do sąsiedniej studni; `Shift` + `A` `D`, `Q` `E`, `W` `S`: obroty w 4. i 5. wymiar |

Na telefonie i tablecie pojawiają się przyciski na ekranie, a przeciąganie po planszy obraca kamerę.

Pad (np. podpięty do laptopa przy telewizorze): d-pad albo lewa gałka to ruch, prawa gałka przechyla klocek, `LB` `RB` obracają, `A` zrzuca, `B` przyspiesza, `X` to schowek, trzymany `LT` przenosi ruchy i obroty między studnie (4D, 5D), `RT` obraca kamerę, `Start` to pauza (a w menu start gry). W 2D: `A` `B` obroty, `LB` `RB` schowek, d-pad w górę zrzuca.

W 3D i wyżej leżące klocki mają kolor zależny od wysokości (jak mapa poziomic), więc od razu widać, która warstwa jest prawie pełna; w Ustawieniach można wrócić do kolorów klocków. Klocki zasłaniające miejsce lądowania robią się półprzezroczyste.

## Uruchomienie lokalnie

Statyczna strona bez budowania (three.js z CDN):

```bash
node tools/serve.js     # http://localhost:8000/
npm test                # testy logiki gry (node --test)
```

## Jak to jest zrobione

- `js/core/`: zasady gry niezależne od liczby wymiarów (siatka N-wymiarowa, obroty w dowolnej płaszczyźnie osi, kopnięcia SRS w 2D, czyszczenie warstw w każdej studni), plus prosty bot do dema w menu.
- `js/render/`: three.js; każda studnia ma własny viewport (w 4D i 5D jest ich wiele), niebo zmienia porę dnia z poziomem.
- `js/audio/`: muzyka i dźwięki syntezowane w Web Audio, bez plików.
- `js/ui/`, `js/input/`: menu, HUD, ranking, klawiatura, mysz i dotyk.
