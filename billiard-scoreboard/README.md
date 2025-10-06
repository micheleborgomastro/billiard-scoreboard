# Billiard Scoreboard (Live)

Plugin WordPress per gestire un **tabellone segnapunti** multi-tavolo e relativi **overlay per OBS** tramite shortcode.

## Novità 1.10.11
- **“Nuova partita”** ora azzera **solo i punteggi** e l’**ultimo tiro** (nomi, set e storico **invariati**).
- **“Azzera punteggi”** è stato rinominato **“Azzera tutto”** e ora esegue il **reset completo** (nomi → “Giocatore 1/2”, punteggi, set, storico).
- **Modale “Azzera tutto”**: mostra un sotto-testo esplicativo su cosa verrà azzerato.

## Pulsanti principali (tabellone)
- **Nuova partita** → azzera punteggi + ultimo tiro (niente altro).
- **Azzera tutto** → reset completo (nomi, punteggi, set, storico).
- **Fine set** → assegna il set al punteggio maggiore e azzera i soli punteggi.
- **Schermo intero** → attiva/disattiva fullscreen.

## Shortcode principali
- **Scoreboard**: `[billiard_scoreboard id="TAVOLO1" brand_logo="" dev_text="" dev_logo="" dev_link=""]`
- **Overlay (OBS)**: `[billiard_overlay id="TAVOLO1" height="64" width="" bg="transparent" p1="#0a7a5c" p2="#0a7a5c" accent="#f39c12" text="#ffffff" logo="" logo1="" logo2="" sets="1"]`

## Upgrade notes
- **Nessuna modifica alle classi CSS esistenti** → il tuo CSS custom continuerà a funzionare senza problemi.
- **Nessuna azione richiesta** dopo l’aggiornamento: puoi sostituire direttamente la vecchia versione con la 1.10.11.
- Le uniche differenze sono nei pulsanti **Nuova partita** e **Azzera tutto**, come descritto sopra.

## Requisiti
- WordPress ≥ 5.8 · Testato fino a 6.6
- PHP ≥ 7.4

## Licenza
Distribuzione privata dell’autore. Aggiorna secondo le tue policy.
