# ioBroker Mealplanner Adapter

Essensplaner für 2 Personen — verwaltet den Wochenplan der aktuellen und nächsten Woche, eine Gerichtedatenbank und eine Beilagendatenbank.

## Installation

```bash
cd /opt/iobroker
npm install /path/to/iobroker.mealplanner
iobroker add mealplanner
```

## Konfiguration

Im Admin-Panel gibt es 4 Tabs:

| Tab | Funktion |
|-----|----------|
| **Wochenplaner** | Hauptspeise, Beilage, Typ und Notiz pro Tag eintragen. Würfel-Button für Zufallsvorschlag. |
| **Gerichte** | Gerichtedatenbank pflegen (Name, Kategorie, Rezept-URL, Portionen) |
| **Beilagen** | Beilagendatenbank pflegen |
| **Import/Export** | Wochenplan als CSV exportieren / importieren |

## Datenpunkte

### Heutige Werte (read-only, aktualisiert um 00:01 Uhr)

| Datenpunkt | Typ | Beschreibung |
|------------|-----|--------------|
| `today.main` | string | Hauptspeise ID |
| `today.main_name` | string | Hauptspeise Name |
| `today.side` | string | Beilage ID |
| `today.side_name` | string | Beilage Name |
| `today.category` | string | Kategorie |
| `today.type` | string | Typ (normal/extern/event/leer) |
| `today.note` | string | Notiz |

### Wochenplan

Für `week.current.{Tag}.*` und `week.next.{Tag}.*` (Tag = Montag … Sonntag):

| Suffix | Beschreibung |
|--------|--------------|
| `.main` | Hauptspeise ID |
| `.main_name` | Hauptspeise Name |
| `.side` | Beilage ID |
| `.side_name` | Beilage Name |
| `.category` | Kategorie |
| `.type` | Typ |
| `.note` | Notiz |

### Befehle

| Datenpunkt | Beschreibung |
|------------|--------------|
| `cmd.suggest` | `true` schreiben → Zufallsvorschlag für heute |
| `cmd.export` | `true` schreiben → CSV-Export (Ausgabe ins Log) |
| `cmd.import` | CSV-String schreiben → Import |

### Info

| Datenpunkt | Beschreibung |
|------------|--------------|
| `info.current_kw` | Aktuelle Kalenderwoche |
| `info.next_kw` | Nächste Kalenderwoche |
| `info.db_dishes` | Anzahl Gerichte |
| `info.db_sides` | Anzahl Beilagen |
| `info.last_export` | ISO-Zeitstempel des letzten Exports |

## Datenbank

Die JSON-Datenbank liegt unter:
```
/opt/iobroker/iobroker-data/mealplanner/database.json
```

## CSV-Format

```
kw;wochentag;hauptspeise;beilage;typ;notiz
20;Montag;Pasta Bolognese;Salat;normal;
20;Dienstag;Fischstäbchen;Kartoffeln;normal;Kinder mögen das
```

## Typen

- `normal` — normaler Tag
- `extern` — Auswärts essen
- `event` — besonderer Anlass
- `leer` — kein Eintrag

## Kategorien (Gerichte)

`vegetarisch` | `fisch` | `fleisch` | `extern` | `event`

## Lizenz

MIT — Wolfgang Halbartschlager
