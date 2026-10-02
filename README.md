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

Build command: `npm install && npm run build`
Start command: `npm start`
Health check: `/health`

Per Render puoi usare `render.yaml` come Blueprint. Le variabili SMTP sono marcate come secret e vanno inserite solo nella dashboard Render, mai nel repository. Se il piano Render non permette il disk persistente, rimuovi la sezione `disk` e lascia `DATA_DIR` non impostata: l'app resta avviabile, ma i JSON possono resettarsi ai riavvii.
