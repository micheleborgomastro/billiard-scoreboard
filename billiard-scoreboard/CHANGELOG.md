# Changelog

## 1.10.12 — Clear memo on New Match / End Set (2025-10-09)
- **Nuova partita**: oltre ad azzerare punteggi e “ultimo tiro”, ora azzera anche la **cronologia tiri (memo)** di entrambi.
- **Fine set**: oltre ad assegnare il set e azzerare i punteggi correnti, ora azzera anche la **cronologia tiri (memo)** di entrambi.
- Nessuna modifica alle classi CSS esistenti.

## 1.10.11 — Small UX swap (2025-09-25)
- **Button behavior swap:**
  - **Nuova partita** → azzera **solo punteggi** e **ultimo tiro** (nomi, set, storico invariati).
  - **Azzera punteggi** → rinominato **Azzera tutto** → **reset completo** (nomi → “Giocatore 1/2”, punteggi, set, storico).
- **Modale “Azzera tutto”** con sotto-testo esplicativo su cosa verrà azzerato.
- **Compatibilità CSS:** nessuna classe esistente modificata (aggiunta solo `.bsb-cfm-subtext` nel markup della modale).
- **Internals:** versione plugin aggiornata a `1.10.11`. Nessun altro cambiamento.

## 1.10.10
- Release precedente fornita dall'utente.
