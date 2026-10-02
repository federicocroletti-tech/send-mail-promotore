# Mail Promotore

Applicazione locale per gestire liste di destinatari, template email, storico invii e blocco automatico dei doppioni per campagna.

## Avvio sviluppo

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`
API locale: `http://localhost:4174`

## Invio email reale

Copia `.env.example` in `.env` e inserisci i dati SMTP direttamente nel file locale. Senza SMTP configurato l'app permette di gestire liste e template, ma non invia email reali.

## File dati

- `data/contacts.json`: destinatari e liste collegate
- `data/campaigns.json`: testi email e liste associate
- `data/email-history.json`: storico degli invii riusciti
- `data/suppression-list.json`: indirizzi da non contattare
- `data/services.json`: servizi inseribili nel template con `{{services}}`

## Produzione locale o Render

```bash
npm run build
npm start
```

Build command: `npm ci && npm run build`
Start command: `npm start`
Health check: `/health`

Per Render puoi usare `render.yaml` come Blueprint gratuito (`plan: free`). Il deploy pubblico parte senza SMTP: l'app permette di gestire liste e template, ma il bottone di invio resta disabilitato finche non configuri le variabili SMTP nella dashboard Render. La configurazione gratuita non include un disk persistente: l'app resta avviabile, ma i JSON possono resettarsi ai riavvii. Se in futuro vuoi storico persistente anche su Render, aggiungi un disk e imposta `DATA_DIR` al relativo mount path.
