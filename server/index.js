import 'dotenv/config'
import crypto from 'node:crypto'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import nodemailer from 'nodemailer'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data')
const distDir = path.join(rootDir, 'dist')
const port = Number(process.env.PORT || 4174)

const seeds = {
  'lists.json': [
    {
      id: 'informatica',
      name: 'Promozione informatica',
      description: 'Contatti per sviluppo software, siti, supporto IT e automazioni.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'identita-digitale',
      name: 'Identita digitale',
      description: 'Lista pronta per una futura offerta su identita digitale e servizi collegati.',
      createdAt: new Date().toISOString(),
    },
  ],
  'contacts.json': [],
  'services.json': [
    { id: 'sviluppo-web', label: 'Sviluppo siti e applicazioni web' },
    { id: 'supporto-it', label: 'Supporto informatico rapido' },
    { id: 'automazioni', label: 'Automazioni per attivita e uffici' },
    { id: 'manutenzione', label: 'Pacchetti di manutenzione e assistenza' },
  ],
  'campaigns.json': [
    {
      id: 'promo-informatica',
      name: 'Presentazione servizi informatici',
      listId: 'informatica',
      subject: 'Supporto informatico e sviluppo su misura',
      fromName: 'Federico',
      replyTo: '',
      updatedAt: new Date().toISOString(),
      body:
        'Ciao {{name}},\n\nsono Federico, sviluppatore informatico. Ti contatto per presentarti alcuni servizi che possono aiutare la tua attivita:\n\n{{services}}\n\nSe puo essere utile, possiamo sentirci per capire cosa serve davvero e preparare una proposta snella.\n\nGrazie,\nFederico',
    },
    {
      id: 'promo-identita-digitale',
      name: 'Presentazione identita digitale',
      listId: 'identita-digitale',
      subject: 'Servizi digitali per semplificare la tua attivita',
      fromName: 'Federico',
      replyTo: '',
      updatedAt: new Date().toISOString(),
      body:
        'Ciao {{name}},\n\nsto preparando una proposta dedicata ai servizi digitali e alla gestione dell\'identita digitale.\n\n{{services}}\n\nSe vuoi, possiamo sentirci per capire quali strumenti possono semplificare il lavoro quotidiano.\n\nGrazie,\nFederico',
    },
  ],
  'email-history.json': [],
  'suppression-list.json': [],
  'activity-log.json': [],
}

async function ensureDataFiles() {
  await fs.mkdir(dataDir, { recursive: true })
  await Promise.all(
    Object.entries(seeds).map(async ([fileName, seed]) => {
      const filePath = path.join(dataDir, fileName)
      if (!fsSync.existsSync(filePath)) {
        await fs.writeFile(filePath, JSON.stringify(seed, null, 2))
      }
    }),
  )
}

function dataPath(fileName) {
  return path.join(dataDir, fileName)
}

async function readJson(fileName) {
  const content = await fs.readFile(dataPath(fileName), 'utf8')
  return JSON.parse(content)
}

async function writeJson(fileName, data) {
  await fs.writeFile(dataPath(fileName), `${JSON.stringify(data, null, 2)}\n`)
}

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase()
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || `lista-${Date.now()}`
}

function uniqueId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`
}

function configuredEnv(name) {
  const value = process.env[name]?.trim() || ''
  if (!value || value.includes('example.com') || value.startsWith('your-')) {
    return ''
  }
  return value
}

function smtpReady() {
  const hasAuthValues = Boolean(process.env.SMTP_USER || process.env.SMTP_PASS)
  const authReady = Boolean(configuredEnv('SMTP_USER') && configuredEnv('SMTP_PASS'))
  return Boolean(
    configuredEnv('SMTP_HOST') &&
      configuredEnv('SMTP_PORT') &&
      configuredEnv('MAIL_FROM') &&
      (!hasAuthValues || authReady),
  )
}

function createTransport() {
  const auth =
    configuredEnv('SMTP_USER') && configuredEnv('SMTP_PASS')
      ? { user: configuredEnv('SMTP_USER'), pass: configuredEnv('SMTP_PASS') }
      : undefined

  return nodemailer.createTransport({
    host: configuredEnv('SMTP_HOST'),
    port: Number(configuredEnv('SMTP_PORT') || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth,
  })
}

function renderTemplate(template, contact, services) {
  const serviceText = services.map((service) => `- ${service.label}`).join('\n')
  const fallbackName = contact.name || contact.company || contact.email
  const replacements = {
    '{{name}}': fallbackName,
    '{{email}}': contact.email,
    '{{company}}': contact.company || '',
    '{{services}}': serviceText,
    '{{today}}': new Intl.DateTimeFormat('it-IT').format(new Date()),
  }

  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.split(token).join(value),
    template,
  )
}

function defaultFooter() {
  return (
    process.env.MAIL_FOOTER ||
    'Messaggio inviato una sola volta per questa campagna. Per non ricevere altre comunicazioni, rispondi con RIMUOVI.'
  )
}

async function logActivity(type, message) {
  const activity = await readJson('activity-log.json')
  activity.unshift({ id: uniqueId('act'), type, message, createdAt: new Date().toISOString() })
  await writeJson('activity-log.json', activity.slice(0, 200))
}

function parseContactLine(line) {
  const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  if (!emailMatch) {
    return null
  }

  const email = normalizeEmail(emailMatch[0])
  const parts = line
    .split(/[;,\t]/)
    .map((part) => part.trim())
    .filter(Boolean)
  const nonEmailParts = parts.filter((part) => normalizeEmail(part) !== email && !part.includes('@'))

  return {
    email,
    name: nonEmailParts[0] || '',
    company: nonEmailParts[1] || '',
  }
}

async function getState() {
  const [lists, contacts, campaigns, services, history, suppression, activity] = await Promise.all([
    readJson('lists.json'),
    readJson('contacts.json'),
    readJson('campaigns.json'),
    readJson('services.json'),
    readJson('email-history.json'),
    readJson('suppression-list.json'),
    readJson('activity-log.json'),
  ])

  return {
    smtpReady: smtpReady(),
    lists,
    contacts,
    campaigns,
    services,
    history,
    suppression,
    activity,
  }
}

function sendError(response, status, error) {
  response.status(status).json({ error })
}

await ensureDataFiles()

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/api/state', async (_request, response) => {
  response.json(await getState())
})

app.get('/health', (_request, response) => {
  response.json({ ok: true })
})

app.post('/api/lists', async (request, response) => {
  const name = String(request.body?.name || '').trim()
  const description = String(request.body?.description || '').trim()
  if (!name) {
    return sendError(response, 400, 'Inserisci il nome della lista')
  }

  const lists = await readJson('lists.json')
  const campaigns = await readJson('campaigns.json')
  const baseId = slugify(name)
  let id = baseId
  let counter = 2
  while (lists.some((list) => list.id === id)) {
    id = `${baseId}-${counter}`
    counter += 1
  }

  const createdAt = new Date().toISOString()
  const list = { id, name, description, createdAt }
  const campaign = {
    id: `promo-${id}`,
    name: `Presentazione ${name}`,
    listId: id,
    subject: 'Presentazione servizi',
    fromName: 'Federico',
    replyTo: '',
    updatedAt: createdAt,
    body:
      'Ciao {{name}},\n\nti scrivo per presentarti questi servizi:\n\n{{services}}\n\nSe puo essere utile, possiamo sentirci per una valutazione rapida.\n\nGrazie,\nFederico',
  }

  lists.push(list)
  campaigns.push(campaign)
  await Promise.all([writeJson('lists.json', lists), writeJson('campaigns.json', campaigns)])
  await logActivity('list.created', `Creata lista ${name}`)
  response.status(201).json({ list, campaign })
})

app.post('/api/contacts', async (request, response) => {
  const email = normalizeEmail(request.body?.email)
  const listIds = Array.isArray(request.body?.listIds) ? request.body.listIds.filter(Boolean) : []
  if (!isEmail(email)) {
    return sendError(response, 400, 'Email non valida')
  }
  if (!listIds.length) {
    return sendError(response, 400, 'Scegli almeno una lista')
  }

  const contacts = await readJson('contacts.json')
  const existing = contacts.find((contact) => contact.email === email)
  if (existing) {
    existing.name = String(request.body?.name || existing.name || '').trim()
    existing.company = String(request.body?.company || existing.company || '').trim()
    existing.notes = String(request.body?.notes || existing.notes || '').trim()
    existing.lists = [...new Set([...existing.lists, ...listIds])]
    await writeJson('contacts.json', contacts)
    await logActivity('contact.updated', `Aggiornato destinatario ${email}`)
    return response.json(existing)
  }

  const contact = {
    id: uniqueId('contact'),
    email,
    name: String(request.body?.name || '').trim(),
    company: String(request.body?.company || '').trim(),
    notes: String(request.body?.notes || '').trim(),
    lists: [...new Set(listIds)],
    createdAt: new Date().toISOString(),
  }
  contacts.push(contact)
  await writeJson('contacts.json', contacts)
  await logActivity('contact.created', `Aggiunto destinatario ${email}`)
  response.status(201).json(contact)
})

app.post('/api/contacts/import', async (request, response) => {
  const raw = String(request.body?.raw || '')
  const listIds = Array.isArray(request.body?.listIds) ? request.body.listIds.filter(Boolean) : []
  if (!raw.trim()) {
    return sendError(response, 400, 'Incolla almeno una email')
  }
  if (!listIds.length) {
    return sendError(response, 400, 'Scegli almeno una lista')
  }

  const contacts = await readJson('contacts.json')
  const invalid = []
  let added = 0
  let updated = 0

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseContactLine(line.trim())
    if (!parsed) {
      if (line.trim()) {
        invalid.push(line.trim())
      }
      continue
    }

    const existing = contacts.find((contact) => contact.email === parsed.email)
    if (existing) {
      existing.name = parsed.name || existing.name
      existing.company = parsed.company || existing.company
      existing.lists = [...new Set([...existing.lists, ...listIds])]
      updated += 1
    } else {
      contacts.push({
        id: uniqueId('contact'),
        email: parsed.email,
        name: parsed.name,
        company: parsed.company,
        notes: '',
        lists: [...new Set(listIds)],
        createdAt: new Date().toISOString(),
      })
      added += 1
    }
  }

  await writeJson('contacts.json', contacts)
  await logActivity('contacts.imported', `Import contatti: ${added} nuovi, ${updated} aggiornati`)
  response.json({ added, updated, invalid })
})

app.patch('/api/campaigns/:id', async (request, response) => {
  const campaigns = await readJson('campaigns.json')
  const campaign = campaigns.find((item) => item.id === request.params.id)
  if (!campaign) {
    return sendError(response, 404, 'Campagna non trovata')
  }

  const nextCampaign = {
    ...campaign,
    name: String(request.body?.name || campaign.name).trim(),
    listId: String(request.body?.listId || campaign.listId).trim(),
    subject: String(request.body?.subject || campaign.subject).trim(),
    body: String(request.body?.body || campaign.body).trim(),
    fromName: String(request.body?.fromName || campaign.fromName || '').trim(),
    replyTo: String(request.body?.replyTo || '').trim(),
    updatedAt: new Date().toISOString(),
  }

  if (!nextCampaign.name || !nextCampaign.subject || !nextCampaign.body) {
    return sendError(response, 400, 'Nome, oggetto e testo email sono obbligatori')
  }

  const index = campaigns.findIndex((item) => item.id === campaign.id)
  campaigns[index] = nextCampaign
  await writeJson('campaigns.json', campaigns)
  await logActivity('campaign.updated', `Aggiornata campagna ${nextCampaign.name}`)
  response.json(nextCampaign)
})

app.post('/api/services', async (request, response) => {
  const label = String(request.body?.label || '').trim()
  if (!label) {
    return sendError(response, 400, 'Inserisci il servizio')
  }

  const services = await readJson('services.json')
  const service = { id: slugify(label), label }
  if (!services.some((item) => item.id === service.id)) {
    services.push(service)
    await writeJson('services.json', services)
    await logActivity('service.created', `Aggiunto servizio ${label}`)
  }
  response.status(201).json(service)
})

app.delete('/api/services/:id', async (request, response) => {
  const services = await readJson('services.json')
  const nextServices = services.filter((service) => service.id !== request.params.id)
  await writeJson('services.json', nextServices)
  await logActivity('service.deleted', 'Rimosso servizio')
  response.json({ ok: true })
})

app.post('/api/suppression', async (request, response) => {
  const raw = String(request.body?.raw || '')
  const reason = String(request.body?.reason || 'Rimozione manuale').trim()
  const emails = raw
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(isEmail)
  if (!emails.length) {
    return sendError(response, 400, 'Inserisci almeno una email valida')
  }

  const suppression = await readJson('suppression-list.json')
  const knownEmails = new Set(suppression.map((item) => item.email))
  let added = 0
  for (const email of emails) {
    if (!knownEmails.has(email)) {
      suppression.push({ email, reason, addedAt: new Date().toISOString() })
      knownEmails.add(email)
      added += 1
    }
  }
  await writeJson('suppression-list.json', suppression)
  await logActivity('suppression.updated', `Aggiornata lista esclusioni: ${added} nuovi`)
  response.json({ added })
})

app.post('/api/send', async (request, response) => {
  if (!smtpReady()) {
    return sendError(response, 400, 'Configura SMTP nel file .env prima di inviare email reali')
  }

  const campaignId = String(request.body?.campaignId || '')
  const selectedIds = Array.isArray(request.body?.contactIds) ? new Set(request.body.contactIds) : null
  const [campaigns, contacts, history, suppression, services] = await Promise.all([
    readJson('campaigns.json'),
    readJson('contacts.json'),
    readJson('email-history.json'),
    readJson('suppression-list.json'),
    readJson('services.json'),
  ])
  const campaign = campaigns.find((item) => item.id === campaignId)
  if (!campaign) {
    return sendError(response, 404, 'Campagna non trovata')
  }

  const suppressed = new Set(suppression.map((item) => item.email))
  const alreadySent = new Set(
    history
      .filter((item) => item.campaignId === campaign.id)
      .map((item) => normalizeEmail(item.email)),
  )
  const recipients = contacts.filter(
    (contact) =>
      contact.lists.includes(campaign.listId) && (!selectedIds || selectedIds.has(contact.id)),
  )

  if (!recipients.length) {
    return sendError(response, 400, 'Nessun destinatario disponibile per questa campagna')
  }

  const transporter = createTransport()
  const skipped = []
  const failed = []
  const sent = []
  const footer = defaultFooter()

  for (const contact of recipients) {
    const email = normalizeEmail(contact.email)
    if (alreadySent.has(email)) {
      skipped.push({ email, reason: 'gia inviato per questa campagna' })
      continue
    }
    if (suppressed.has(email)) {
      skipped.push({ email, reason: 'presente nella lista esclusioni' })
      continue
    }

    const text = `${renderTemplate(campaign.body, contact, services)}\n\n---\n${footer}`
    try {
      const info = await transporter.sendMail({
        from: campaign.fromName
          ? `"${campaign.fromName}" <${process.env.MAIL_FROM}>`
          : process.env.MAIL_FROM,
        replyTo: campaign.replyTo || process.env.MAIL_REPLY_TO || process.env.MAIL_FROM,
        to: contact.email,
        subject: campaign.subject,
        text,
      })
      const item = {
        id: uniqueId('mail'),
        campaignId: campaign.id,
        campaignName: campaign.name,
        contactId: contact.id,
        email: contact.email,
        name: contact.name,
        subject: campaign.subject,
        sentAt: new Date().toISOString(),
        messageId: info.messageId || '',
      }
      history.unshift(item)
      alreadySent.add(email)
      sent.push(item)
    } catch (error) {
      failed.push({ email, error: error instanceof Error ? error.message : String(error) })
    }
  }

  if (sent.length) {
    await writeJson('email-history.json', history)
  }
  await logActivity(
    'campaign.sent',
    `Campagna ${campaign.name}: ${sent.length} invii, ${skipped.length} saltati, ${failed.length} falliti`,
  )

  response.json({ sent: sent.length, skipped, failed })
})

if (fsSync.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((request, response, next) => {
    if (request.path.startsWith('/api')) {
      return next()
    }
    response.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Mail Promotore disponibile su http://localhost:${port}`)
})