# Chackos Scratch Classic points

Season points, standings, results by date, event summary and finals for the Chackos Scratch Classic.
The site is plain HTML and JavaScript hosted on GitHub Pages. All results live in a Google Sheet, and
the site reads the sheet every time someone opens it, so editing the sheet updates the site.

## Updating results

Everything happens in the Google Sheet. One row per bowler or match, one tab per kind of data:

| Tab | One row per | Notes |
|---|---|---|
| Events | event | Date, title, format, description, qualifying games, cut line (number of rows above the red line, including rolloff losers), the sheet's cut note, champion, runner-up. Champion and runner-up can be left blank and are worked out from the finals. |
| Results | bowler per event | Date, place, name as printed, name to use (this is how the same bowler is matched across events), tags (S/W), G1 to G7, total, 6-game total (advancers events), stepladder seed (1 to 5), status, final place, note. |
| Matches | match play or stepladder match | Date, round, winner, winner score, loser, loser score. Rounds show in the order they first appear. |
| Elimination | bowler per elimination round | Date, round, bowler, score, advanced (Yes/No), prize. |
| Settings | (one row) | Made-cut bonus, top-qualifier bonus, points for 106th and lower, whether Senior/Female spots get the cut bonus. |

**Status** is one of `Made cut`, `Senior spot`, `Female spot`, `Lost rolloff`, or blank.

**Final place** can be left blank. The site then works it out: finals first (champion, runner-up, then by
the round they went out in), then the stepladder seeds, then 6-game totals, then qualifying totals. Type a
number to override it for one bowler.

Dates can be typed as `2026-12-06` or `12/6/2026`. Every tab must use the same date for the same event.

## Setup

1. The Google Sheet must be shared as **Anyone with the link: Viewer**.
2. Put the sheet's ID (the long code between `/d/` and `/edit` in its address) in `config.js`.
3. GitHub Pages serves the `main` branch from the root folder.

If the sheet can't be reached, the site falls back to the copies in `data/`, which are a snapshot
of the season as of November 2026.
