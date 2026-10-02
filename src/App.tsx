import { useEffect, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  History,
  ListChecks,
  Mail,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react'
import './App.css'

type Tab = 'send' | 'contacts' | 'email' | 'history' | 'rules'

type MailingList = {
  id: string
  name: string
  description: string
  createdAt: string
}

type Contact = {
  id: string
  email: string
  name: string
  company: string
  notes: string
  lists: string[]
  createdAt: string
}

type Campaign = {
  id: string
  name: string
  listId: string
  subject: string
  body: string
  fromName: string
  replyTo: string
  updatedAt: string
}

type ServiceItem = {
  id: string
  label: string
}

type HistoryItem = {
  id: string
  campaignId: string
  campaignName: string
  contactId: string
  email: string
  name: string
  subject: string
  sentAt: string
  messageId: string
}

type SuppressionItem = {
  email: string
  reason: string
  addedAt: string
}

type ActivityItem = {
  id: string
  type: string
  message: string
  createdAt: string
}

type AppState = {
  smtpReady: boolean
  lists: MailingList[]
  contacts: Contact[]
  campaigns: Campaign[]
  services: ServiceItem[]
  history: HistoryItem[]
  suppression: SuppressionItem[]
  activity: ActivityItem[]
}

type Notice = {
  type: 'ok' | 'error'
  text: string
}

type SendResult = {
  sent: number
  skipped: { email: string; reason: string }[]
  failed: { email: string; error: string }[]
}

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'send', label: 'Invio', icon: Send },
  { id: 'contacts', label: 'Destinatari', icon: Users },
  { id: 'email', label: 'Email', icon: FileText },
  { id: 'history', label: 'Storico', icon: History },
  { id: 'rules', label: 'Regole', icon: ShieldCheck },
]

const emptyContactForm = {
  email: '',
  name: '',
  company: '',
  notes: '',
  listIds: [] as string[],
}

const emptyCampaignEditor = {
  name: '',
  subject: '',
  body: '',
  fromName: '',
  replyTo: '',
  listId: '',
}

function campaignToEditor(campaign: Campaign) {
  return {
    name: campaign.name,
    subject: campaign.subject,
    body: campaign.body,
    fromName: campaign.fromName,
    replyTo: campaign.replyTo,
    listId: campaign.listId,
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error ?? 'Operazione non riuscita')
  }

  return payload as T
}

function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('send')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])
  const [contactSearch, setContactSearch] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [contactForm, setContactForm] = useState(emptyContactForm)
  const [importText, setImportText] = useState('')
  const [importListIds, setImportListIds] = useState<string[]>([])
  const [campaignEditor, setCampaignEditor] = useState(emptyCampaignEditor)
  const [newList, setNewList] = useState({ name: '', description: '' })
  const [newService, setNewService] = useState('')
  const [suppressionText, setSuppressionText] = useState('')

  async function loadState(preferredCampaignId = selectedCampaignId) {
    const nextState = await apiRequest<AppState>('/api/state')
    const nextCampaign =
      nextState.campaigns.find((campaign) => campaign.id === preferredCampaignId) ??
      nextState.campaigns[0]

    setState(nextState)
    setSelectedCampaignId(nextCampaign?.id ?? '')
    setCampaignEditor(nextCampaign ? campaignToEditor(nextCampaign) : emptyCampaignEditor)
  }

  function showLoadError(error: unknown) {
    setNotice({
      type: 'error',
      text: error instanceof Error ? error.message : 'Errore di caricamento',
    })
  }

  useEffect(() => {
    void Promise.resolve()
      .then(() => loadState())
      .catch(showLoadError)
  }, [])

  const lists = state?.lists ?? []
  const campaigns = state?.campaigns ?? []
  const contacts = state?.contacts ?? []
  const services = state?.services ?? []
  const history = state?.history ?? []
  const suppression = state?.suppression ?? []
  const activity = state?.activity ?? []
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId)
  const listForCampaign = lists.find((list) => list.id === selectedCampaign?.listId)
  const sentEmailsForCampaign = new Set(
    history
      .filter((item) => item.campaignId === selectedCampaign?.id)
      .map((item) => normalizeEmail(item.email)),
  )
  const suppressedEmails = new Set(suppression.map((item) => normalizeEmail(item.email)))
  const contactsForCampaign = selectedCampaign
    ? contacts.filter((contact) => contact.lists.includes(selectedCampaign.listId))
    : []
  const pendingContacts = contactsForCampaign.filter(
    (contact) =>
      !sentEmailsForCampaign.has(normalizeEmail(contact.email)) &&
      !suppressedEmails.has(normalizeEmail(contact.email)),
  )
  const filteredContacts = contactsForCampaign.filter((contact) => {
    const search = contactSearch.trim().toLowerCase()
    if (!search) {
      return true
    }

    return [contact.email, contact.name, contact.company, contact.notes]
      .join(' ')
      .toLowerCase()
      .includes(search)
  })
  const selectedEligibleContacts = contactsForCampaign.filter(
    (contact) =>
      selectedContactIds.includes(contact.id) &&
      !sentEmailsForCampaign.has(normalizeEmail(contact.email)) &&
      !suppressedEmails.has(normalizeEmail(contact.email)),
  )
  const historyForCampaign = history.filter((item) => item.campaignId === selectedCampaign?.id)

  function showNotice(type: Notice['type'], text: string) {
    setNotice({ type, text })
  }

  function getListName(listId: string) {
    return lists.find((list) => list.id === listId)?.name ?? listId
  }

  function getCampaignName(campaignId: string) {
    return campaigns.find((campaign) => campaign.id === campaignId)?.name ?? campaignId
  }

  function selectCampaign(campaignId: string) {
    const campaign = campaigns.find((item) => item.id === campaignId)
    setSelectedCampaignId(campaignId)
    setCampaignEditor(campaign ? campaignToEditor(campaign) : emptyCampaignEditor)
    setSelectedContactIds([])
  }

  function toggleListSelection(current: string[], listId: string) {
    if (current.includes(listId)) {
      return current.filter((id) => id !== listId)
    }
    return [...current, listId]
  }

  function contactStatus(contact: Contact) {
    const email = normalizeEmail(contact.email)
    if (suppressedEmails.has(email)) {
      return { label: 'bloccato', className: 'muted' }
    }
    if (sentEmailsForCampaign.has(email)) {
      return { label: 'gia inviato', className: 'sent' }
    }
    return { label: 'nuovo', className: 'ready' }
  }

  async function withBusy(action: () => Promise<void>) {
    setIsBusy(true)
    setNotice(null)
    try {
      await action()
    } catch (error: unknown) {
      showNotice('error', error instanceof Error ? error.message : 'Operazione non riuscita')
    } finally {
      setIsBusy(false)
    }
  }

  async function saveCampaign(event: FormEvent) {
    event.preventDefault()
    if (!selectedCampaign) {
      return
    }

    await withBusy(async () => {
      await apiRequest(`/api/campaigns/${selectedCampaign.id}`, {
        method: 'PATCH',
        body: JSON.stringify(campaignEditor),
      })
      await loadState(selectedCampaign.id)
      showNotice('ok', 'Email salvata')
    })
  }

  async function addContact(event: FormEvent) {
    event.preventDefault()
    await withBusy(async () => {
      const fallbackListId = selectedCampaign?.listId ?? lists[0]?.id
      await apiRequest('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          ...contactForm,
          listIds: contactForm.listIds.length ? contactForm.listIds : [fallbackListId],
        }),
      })
      setContactForm(emptyContactForm)
      await loadState()
      showNotice('ok', 'Destinatario salvato')
    })
  }

  async function importContacts(event: FormEvent) {
    event.preventDefault()
    await withBusy(async () => {
      const fallbackListId = selectedCampaign?.listId ?? lists[0]?.id
      const result = await apiRequest<{ added: number; updated: number; invalid: string[] }>(
        '/api/contacts/import',
        {
          method: 'POST',
          body: JSON.stringify({
            raw: importText,
            listIds: importListIds.length ? importListIds : [fallbackListId],
          }),
        },
      )
      setImportText('')
      await loadState()
      showNotice(
        'ok',
        `Import completato: ${result.added} nuovi, ${result.updated} aggiornati, ${result.invalid.length} righe ignorate`,
      )
    })
  }

  async function createList(event: FormEvent) {
    event.preventDefault()
    await withBusy(async () => {
      const result = await apiRequest<{ list: MailingList; campaign: Campaign }>('/api/lists', {
        method: 'POST',
        body: JSON.stringify(newList),
      })
      setNewList({ name: '', description: '' })
      await loadState(result.campaign.id)
      showNotice('ok', `Lista ${result.list.name} creata`)
    })
  }

  async function addService(event: FormEvent) {
    event.preventDefault()
    await withBusy(async () => {
      await apiRequest('/api/services', {
        method: 'POST',
        body: JSON.stringify({ label: newService }),
      })
      setNewService('')
      await loadState()
      showNotice('ok', 'Servizio aggiunto')
    })
  }

  async function removeService(serviceId: string) {
    await withBusy(async () => {
      await apiRequest(`/api/services/${serviceId}`, { method: 'DELETE' })
      await loadState()
      showNotice('ok', 'Servizio rimosso')
    })
  }

  async function addSuppression(event: FormEvent) {
    event.preventDefault()
    await withBusy(async () => {
      const result = await apiRequest<{ added: number }>('/api/suppression', {
        method: 'POST',
        body: JSON.stringify({ raw: suppressionText, reason: 'Rimozione manuale' }),
      })
      setSuppressionText('')
      await loadState()
      showNotice('ok', `${result.added} indirizzi bloccati`)
    })
  }

  async function sendCampaign(mode: 'all' | 'selected') {
    if (!selectedCampaign) {
      return
    }

    if (mode === 'selected' && selectedEligibleContacts.length === 0) {
      showNotice('error', 'Seleziona almeno un destinatario nuovo')
      return
    }

    await withBusy(async () => {
      const result = await apiRequest<SendResult>('/api/send', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: selectedCampaign.id,
          contactIds:
            mode === 'selected' ? selectedEligibleContacts.map((contact) => contact.id) : undefined,
        }),
      })
      setSelectedContactIds([])
      await loadState()
      const failedText = result.failed.length ? `, ${result.failed.length} falliti` : ''
      const skippedText = result.skipped.length ? `, ${result.skipped.length} saltati` : ''
      showNotice('ok', `Invio completato: ${result.sent} spediti${skippedText}${failedText}`)
    })
  }

  function renderListPicker(value: string[], onChange: (nextValue: string[]) => void) {
    return (
      <div className="list-picker">
        {lists.map((list) => (
          <label key={list.id} className={value.includes(list.id) ? 'pill-check active' : 'pill-check'}>
            <input
              type="checkbox"
              checked={value.includes(list.id)}
              onChange={() => onChange(toggleListSelection(value, list.id))}
            />
            {list.name}
          </label>
        ))}
      </div>
    )
  }

  function renderSendTab() {
    return (
      <div className="workspace-grid send-grid">
        <section className="panel control-panel">
          <div className="panel-heading">
            <span className="eyebrow">Campagna attiva</span>
            <h2>{selectedCampaign?.name ?? 'Nessuna campagna'}</h2>
          </div>

          <label className="field">
            <span>Email da inviare</span>
            <select
              value={selectedCampaignId}
              onChange={(event) => selectCampaign(event.target.value)}
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>

          <div className="stat-grid compact">
            <div>
              <strong>{contactsForCampaign.length}</strong>
              <span>in lista</span>
            </div>
            <div>
              <strong>{pendingContacts.length}</strong>
              <span>nuovi</span>
            </div>
            <div>
              <strong>{historyForCampaign.length}</strong>
              <span>gia inviati</span>
            </div>
          </div>

          <div className={state?.smtpReady ? 'smtp-box ready' : 'smtp-box warning'}>
            {state?.smtpReady ? <CheckCircle2 /> : <AlertTriangle />}
            <span>{state?.smtpReady ? 'SMTP pronto' : 'Configura SMTP prima degli invii reali'}</span>
          </div>

          <div className="button-stack">
            <button
              type="button"
              className="primary-action"
              disabled={!state?.smtpReady || isBusy || pendingContacts.length === 0}
              onClick={() => void sendCampaign('all')}
            >
              <Send />
              Invia nuovi della lista
            </button>
            <button
              type="button"
              disabled={!state?.smtpReady || isBusy || selectedEligibleContacts.length === 0}
              onClick={() => void sendCampaign('selected')}
            >
              <Mail />
              Invia selezionati ({selectedEligibleContacts.length})
            </button>
            <button type="button" onClick={() => setSelectedContactIds(pendingContacts.map((item) => item.id))}>
              <ListChecks />
              Seleziona nuovi
            </button>
          </div>
        </section>

        <section className="panel table-panel">
          <div className="table-toolbar">
            <div>
              <span className="eyebrow">{listForCampaign?.name ?? 'Lista'}</span>
              <h2>Destinatari</h2>
            </div>
            <label className="search-box">
              <Search />
              <input
                type="search"
                placeholder="Cerca email, nome, azienda"
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
              />
            </label>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sel.</th>
                  <th>Email</th>
                  <th>Nome</th>
                  <th>Azienda</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => {
                  const status = contactStatus(contact)
                  const disabled = status.label !== 'nuovo'
                  return (
                    <tr key={contact.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedContactIds.includes(contact.id)}
                          disabled={disabled}
                          onChange={() => {
                            setSelectedContactIds((current) =>
                              current.includes(contact.id)
                                ? current.filter((id) => id !== contact.id)
                                : [...current, contact.id],
                            )
                          }}
                        />
                      </td>
                      <td>{contact.email}</td>
                      <td>{contact.name || '-'}</td>
                      <td>{contact.company || '-'}</td>
                      <td>
                        <span className={`status-chip ${status.className}`}>{status.label}</span>
                      </td>
                    </tr>
                  )
                })}
                {!filteredContacts.length && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      Nessun destinatario per questa lista
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  function renderContactsTab() {
    return (
      <div className="workspace-grid">
        <form className="panel form-panel" onSubmit={(event) => void addContact(event)}>
          <div className="panel-heading">
            <span className="eyebrow">Nuovo contatto</span>
            <h2>Aggiungi destinatario</h2>
          </div>
          <label className="field">
            <span>Email</span>
            <input
              required
              type="email"
              value={contactForm.email}
              onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Nome</span>
            <input
              value={contactForm.name}
              onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Azienda</span>
            <input
              value={contactForm.company}
              onChange={(event) => setContactForm({ ...contactForm, company: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Note</span>
            <input
              value={contactForm.notes}
              onChange={(event) => setContactForm({ ...contactForm, notes: event.target.value })}
            />
          </label>
          {renderListPicker(contactForm.listIds, (listIds) => setContactForm({ ...contactForm, listIds }))}
          <button type="submit" className="primary-action" disabled={isBusy}>
            <Plus />
            Salva destinatario
          </button>
        </form>

        <form className="panel form-panel" onSubmit={(event) => void importContacts(event)}>
          <div className="panel-heading">
            <span className="eyebrow">Import rapido</span>
            <h2>Incolla email o CSV</h2>
          </div>
          <textarea
            required
            className="import-area"
            placeholder={'nome,email,azienda\nMario Rossi,mario@example.com,Rossi SRL'}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
          />
          {renderListPicker(importListIds, (listIds) => setImportListIds(listIds))}
          <button type="submit" className="primary-action" disabled={isBusy}>
            <Upload />
            Importa lista
          </button>
        </form>

        <section className="panel wide-panel">
          <div className="table-toolbar">
            <div>
              <span className="eyebrow">Archivio locale</span>
              <h2>Tutti i contatti</h2>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nome</th>
                  <th>Azienda</th>
                  <th>Liste</th>
                  <th>Creato</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>{contact.email}</td>
                    <td>{contact.name || '-'}</td>
                    <td>{contact.company || '-'}</td>
                    <td>{contact.lists.map(getListName).join(', ')}</td>
                    <td>{formatDate(contact.createdAt)}</td>
                  </tr>
                ))}
                {!contacts.length && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      Nessun contatto salvato
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  function renderEmailTab() {
    return (
      <div className="workspace-grid email-grid">
        <form className="panel form-panel editor-panel" onSubmit={(event) => void saveCampaign(event)}>
          <div className="panel-heading">
            <span className="eyebrow">Template</span>
            <h2>Email campagna</h2>
          </div>
          <label className="field">
            <span>Campagna</span>
            <select
              value={selectedCampaignId}
              onChange={(event) => selectCampaign(event.target.value)}
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Nome campagna</span>
            <input
              required
              value={campaignEditor.name}
              onChange={(event) => setCampaignEditor({ ...campaignEditor, name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Lista collegata</span>
            <select
              value={campaignEditor.listId}
              onChange={(event) => setCampaignEditor({ ...campaignEditor, listId: event.target.value })}
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Oggetto</span>
            <input
              required
              value={campaignEditor.subject}
              onChange={(event) => setCampaignEditor({ ...campaignEditor, subject: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Nome mittente</span>
            <input
              value={campaignEditor.fromName}
              onChange={(event) => setCampaignEditor({ ...campaignEditor, fromName: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Reply-to</span>
            <input
              type="email"
              value={campaignEditor.replyTo}
              onChange={(event) => setCampaignEditor({ ...campaignEditor, replyTo: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Testo email</span>
            <textarea
              required
              className="email-body"
              value={campaignEditor.body}
              onChange={(event) => setCampaignEditor({ ...campaignEditor, body: event.target.value })}
            />
          </label>
          <div className="token-row">
            <span>{'{{name}}'}</span>
            <span>{'{{company}}'}</span>
            <span>{'{{services}}'}</span>
            <span>{'{{today}}'}</span>
          </div>
          <button type="submit" className="primary-action" disabled={isBusy}>
            <Save />
            Salva email
          </button>
        </form>

        <section className="panel form-panel">
          <div className="panel-heading">
            <span className="eyebrow">Liste dinamiche</span>
            <h2>Nuova lista</h2>
          </div>
          <form className="stacked-form" onSubmit={(event) => void createList(event)}>
            <label className="field">
              <span>Nome lista</span>
              <input
                required
                value={newList.name}
                onChange={(event) => setNewList({ ...newList, name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Descrizione</span>
              <input
                value={newList.description}
                onChange={(event) => setNewList({ ...newList, description: event.target.value })}
              />
            </label>
            <button type="submit" disabled={isBusy}>
              <Plus />
              Crea lista
            </button>
          </form>

          <div className="mini-list">
            {lists.map((list) => (
              <div key={list.id} className="mini-list-item">
                <strong>{list.name}</strong>
                <span>{list.description || 'Senza descrizione'}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel form-panel">
          <div className="panel-heading">
            <span className="eyebrow">Attivita</span>
            <h2>Servizi nel testo</h2>
          </div>
          <form className="inline-form" onSubmit={(event) => void addService(event)}>
            <input
              required
              value={newService}
              onChange={(event) => setNewService(event.target.value)}
            />
            <button type="submit" title="Aggiungi servizio" disabled={isBusy}>
              <Plus />
            </button>
          </form>
          <div className="service-list">
            {services.map((service) => (
              <div key={service.id} className="service-item">
                <span>{service.label}</span>
                <button
                  type="button"
                  title="Rimuovi servizio"
                  onClick={() => void removeService(service.id)}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  function renderHistoryTab() {
    return (
      <div className="workspace-grid history-grid">
        <section className="panel table-panel wide-panel">
          <div className="table-toolbar">
            <div>
              <span className="eyebrow">Email inviate</span>
              <h2>Storico spedizioni</h2>
            </div>
            <span className="file-badge">data/email-history.json</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Email</th>
                  <th>Nome</th>
                  <th>Campagna</th>
                  <th>Oggetto</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.sentAt)}</td>
                    <td>{item.email}</td>
                    <td>{item.name || '-'}</td>
                    <td>{getCampaignName(item.campaignId)}</td>
                    <td>{item.subject}</td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      Nessun invio registrato
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel activity-panel">
          <div className="panel-heading">
            <span className="eyebrow">Ultime azioni</span>
            <h2>Registro attivita</h2>
          </div>
          <div className="activity-list">
            {activity.slice(0, 12).map((item) => (
              <div key={item.id} className="activity-item">
                <span>{formatDate(item.createdAt)}</span>
                <strong>{item.message}</strong>
              </div>
            ))}
            {!activity.length && <p className="soft-text">Il registro e vuoto.</p>}
          </div>
        </section>
      </div>
    )
  }

  function renderRulesTab() {
    return (
      <div className="workspace-grid rules-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <span className="eyebrow">Blocco invii</span>
            <h2>Lista esclusioni</h2>
          </div>
          <form className="stacked-form" onSubmit={(event) => void addSuppression(event)}>
            <textarea
              required
              className="import-area small"
              placeholder="email-da-non-contattare@example.com"
              value={suppressionText}
              onChange={(event) => setSuppressionText(event.target.value)}
            />
            <button type="submit" className="primary-action" disabled={isBusy}>
              <ShieldCheck />
              Blocca indirizzi
            </button>
          </form>
          <div className="mini-list">
            {suppression.map((item) => (
              <div key={item.email} className="mini-list-item">
                <strong>{item.email}</strong>
                <span>{item.reason}</span>
              </div>
            ))}
            {!suppression.length && <p className="soft-text">Nessun indirizzo bloccato.</p>}
          </div>
        </section>

        <section className="panel rule-panel">
          <div className="panel-heading">
            <span className="eyebrow">Sicurezza</span>
            <h2>Regole operative</h2>
          </div>
          <div className="rule-list">
            <div>
              <CheckCircle2 />
              <span>Invio una sola volta per campagna allo stesso indirizzo.</span>
            </div>
            <div>
              <CheckCircle2 />
              <span>Esclusioni rispettate prima di ogni spedizione.</span>
            </div>
            <div>
              <CheckCircle2 />
              <span>Storico e destinatari restano in file locali JSON.</span>
            </div>
            <div>
              <AlertTriangle />
              <span>Usa solo contatti con base legale o consenso e conserva la fonte del contatto nelle note.</span>
            </div>
          </div>
        </section>

        <section className="panel rule-panel">
          <div className="panel-heading">
            <span className="eyebrow">SMTP</span>
            <h2>Configurazione invio</h2>
          </div>
          <div className="env-list">
            <code>SMTP_HOST</code>
            <code>SMTP_PORT</code>
            <code>SMTP_USER</code>
            <code>SMTP_PASS</code>
            <code>MAIL_FROM</code>
          </div>
          <p className="soft-text">
            Copia .env.example in .env e inserisci le credenziali direttamente nel file locale.
          </p>
        </section>
      </div>
    )
  }

  if (!state) {
    return (
      <main className="loading-shell">
        <Mail />
        <p>Caricamento applicazione...</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Mail Promotore</span>
          <h1>Invii mirati senza doppioni</h1>
        </div>
        <div className="header-status">
          <span className={state.smtpReady ? 'status-chip ready' : 'status-chip muted'}>
            {state.smtpReady ? 'SMTP pronto' : 'SMTP mancante'}
          </span>
          <span className="status-chip sent">{history.length} invii storici</span>
        </div>
      </header>

      <nav className="tabs" aria-label="Sezioni applicazione">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon />
              {tab.label}
            </button>
          )
        })}
      </nav>

      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}

      {activeTab === 'send' && renderSendTab()}
      {activeTab === 'contacts' && renderContactsTab()}
      {activeTab === 'email' && renderEmailTab()}
      {activeTab === 'history' && renderHistoryTab()}
      {activeTab === 'rules' && renderRulesTab()}
    </main>
  )
}

export default App
