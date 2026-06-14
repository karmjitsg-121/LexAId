import { useState, useRef, useEffect } from 'react'
import { searchLegalDatabase, formatContextForAI } from './lib/legalSearch'
import LoginPage from './components/LoginPage'
import { supabase } from './lib/supabaseClient'



// ─── API Configuration ─────────────────────────────────────────────────────────
const SARVAM_API_KEY = 'sk_pw5t298r_CovLbtc8r6A38WShifMeK2hE'
const GEMINI_API_KEY = 'AQ.Ab8RN6I7BKaUe4-YbEbyj6GJjh0zymOLv4TI9Sg04KNMGl4SNA'
const DEEPSEEK_API_KEY = 'sk-bed57bbeec1b4a78bf200863ed4eec5d'
const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'

// ─── Language Mapping ──────────────────────────────────────────────────────────
const LANGUAGE_NAMES = {
  'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil',
  'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi', 'gu-IN': 'Gujarati', 'pa-IN': 'Punjabi',
  'en-IN': 'English (Indian)', 'od-IN': 'Odia', 'ur-IN': 'Urdu',
  'en-US': 'English', 'sa-IN': 'Sanskrit', 'as-IN': 'Assamese',
}

const LANGUAGE_FLAGS = {
  'hi-IN': '🇮🇳', 'bn-IN': '🇮🇳', 'ta-IN': '🇮🇳', 'te-IN': '🇮🇳',
  'kn-IN': '🇮🇳', 'ml-IN': '🇮🇳', 'mr-IN': '🇮🇳', 'gu-IN': '🇮🇳',
  'pa-IN': '🇮🇳', 'en-IN': '🇮🇳', 'od-IN': '🇮🇳', 'ur-IN': '🇵🇰',
  'en-US': '🇺🇸',
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Criminal', 'Civil / Dispute', 'Property & Real Estate', 'Employment & Labour',
  'Consumer Rights', 'Family & Matrimonial', 'Cyber Crime', 'Taxation',
  'Corporate / Business', 'Constitutional Rights', 'Immigration', 'Other'
]

const FAQS = [
  { q: 'Is this platform a substitute for a real lawyer?', a: 'No. LexAid provides legal information and guidance only — not official legal advice. While we help you understand your rights and next steps, you should always consult a qualified lawyer for your specific situation, especially for serious matters.' },
  { q: 'Which Indian languages does voice input support?', a: 'LexAid uses Sarvam AI for voice transcription, supporting Hindi, Bengali, Tamil, Telugu, Kannada, Malayalam, Marathi, Gujarati, Punjabi, Odia, Urdu, and English. Simply speak in your preferred language and it will be automatically detected and transcribed.' },
  { q: 'How does multilingual voice input work?', a: 'When you click the microphone button, your speech is recorded and sent to Sarvam AI\'s speech recognition API. It automatically detects your language, transcribes the audio, and fills the text area. Gemini AI then analyzes the legal context even if the input is in a regional language.' },
  { q: 'How accurate is the legal information provided?', a: 'LexAid uses Google Gemini AI trained on comprehensive legal data. We strive for accuracy but laws change frequently. Always verify with official government sources or a licensed attorney.' },
  { q: 'Is my information kept private?', a: 'Your queries are sent to Sarvam AI (for transcription) and Google Gemini (for legal analysis). We do not store your conversations. Please do not share sensitive personal identifiers.' },
  { q: 'What should I do in an emergency legal situation?', a: 'If you are in immediate danger, call emergency services (100/112) first. LexAid will highlight immediate actions prominently for urgent situations. Still consult a lawyer as soon as possible.' },
]

// ─── Gemini System Prompt Builder ─────────────────────────────────────────────
const buildSystemPrompt = () => `You are LexAid, an expert AI legal guidance assistant specializing in Indian law (including IPC, CrPC, CPC, BNS 2023, BNSS 2023, BSA 2023, and other central or state statutes of India). You help ordinary people understand their legal rights and navigate legal situations.

The user's input may be in any language (Hindi, Tamil, Telugu, Bengali, Marathi, Kannada, Gujarati, Punjabi, Malayalam, Odia, Urdu, or English). You MUST:
1. Understand the user's situation regardless of input language
2. Identify the input language and detect any grammatical errors
3. Normalize and clarify the user's query in English
4. Provide comprehensive, accurate legal guidance for the Indian jurisdiction
5. Cite specific Indian laws, acts, sections, IPC/CrPC/BNS codes. If AUTHORITATIVE LEGAL CONTEXT is retrieved from the database, prioritize and explicitly cite those specific sections in your legal guidance.

Return ONLY valid JSON in this exact format (zero text outside the JSON):
{
  "original_language": "detected language name e.g. Hindi or English",
  "corrected_text": "Clean English interpretation of the user's query with grammar corrected",
  "legal_summary": "One-sentence plain summary of the legal issue identified",
  "relevant_laws": "Comprehensive list of specific Indian laws, acts, sections, constitutional provisions relevant to this situation in India. Include IPC/BNS sections, CrPC/BNSS sections, relevant High Court or Supreme Court judgments if applicable.",
  "legal_implications": "Plain-English explanation of what this situation means legally — rights, obligations, liabilities. Avoid jargon or explain all terms.",
  "immediate_actions": "CRITICAL immediate steps if the situation is urgent. Specific, actionable. If not urgent, write N/A.",
  "step_by_step_guidance": ["Detailed step 1", "Detailed step 2", "Detailed step 3", "Detailed step 4", "Detailed step 5"],
  "where_to_file": "Specific offices, portals (URLs if available), helplines, courts or tribunals in India where the user should go",
  "documents_required": ["Document or evidence item 1", "Document or evidence item 2", "Document or evidence item 3"],
  "sample_document": "A complete, ready-to-use formal draft complaint, legal notice, or statement. Include proper formatting with To:, From:, Subject:, Date:, and body with legal references.",
  "communication_scripts": {
    "police": "Exact script: What to say when reporting to police. Include your rights, what to demand, what NOT to say.",
    "lawyer": "Exact script: How to brief a lawyer for the first time. Key facts to mention, questions to ask.",
    "government_office": "Exact script: What to say when filing at a government office or consumer forum."
  },
  "urgency_level": "low",
  "disclaimer": "This is legal information only, not legal advice. Please consult a qualified lawyer for your specific situation."
}

IMPORTANT RULES:
- urgency_level must be EXACTLY one of: low, medium, high, critical
- critical = violence, unlawful arrest, immediate threat to life/property
- high = ongoing illegal activity, imminent financial/legal harm
- medium = pending deadline, unresolved dispute with escalation risk
- low = general query, no immediate harm
- Always be empathetic, empowering, and clear
- For India, cite the most current applicable laws
- The sample_document must be professionally formatted and ready for real use`

// ─── Urgency Config ────────────────────────────────────────────────────────────
const URGENCY_CONFIG = {
  critical: { label: '🚨 CRITICAL — Immediate action required', color: 'critical', icon: '🚨' },
  high:     { label: '⚠️ HIGH PRIORITY — Act quickly', color: 'high', icon: '⚠️' },
  medium:   { label: '📌 MEDIUM PRIORITY — Address soon', color: 'medium', icon: '📌' },
  low:      { label: '✅ LOW URGENCY — Handle at your pace', color: 'low', icon: '✅' },
}

const TABS = [
  { id: 'overview', icon: '🌐', label: 'Overview' },
  { id: 'laws',    icon: '⚖️', label: 'Laws & Rights' },
  { id: 'steps',   icon: '👣', label: 'Guidance' },
  { id: 'file',    icon: '🏛️', label: 'Where to File' },
  { id: 'docs',    icon: '📂', label: 'Documents' },
  { id: 'draft',   icon: '📝', label: 'Draft' },
  { id: 'scripts', icon: '💬', label: 'Scripts' },
]

// ─── Sarvam Speech-to-Text ────────────────────────────────────────────────────
async function transcribeWithSarvam(audioBlob) {
  const formData = new FormData()
  // Use webm extension for the blob
  const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
  formData.append('file', audioBlob, `recording.${ext}`)
  formData.append('model', 'saarika:v2.5')
  // No language_code = auto-detect

  const response = await fetch(SARVAM_STT_URL, {
    method: 'POST',
    headers: { 'api-subscription-key': SARVAM_API_KEY },
    body: formData,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Sarvam STT failed (${response.status}): ${errText}`)
  }

  return response.json() // { transcript, language_code }
}

// ─── Build user message ───────────────────────────────────────────────────────
function buildUserMsg(text, category, detectedLangCode, retrievedContext = '') {
  const langName = LANGUAGE_NAMES[detectedLangCode] || 'Unknown'
  let msg = `Country/Jurisdiction: India
Legal Category: ${category}
Input Language Detected by STT: ${langName} (${detectedLangCode || 'auto'})\n`

  if (retrievedContext) {
    msg += `\n${retrievedContext}\n`
  }

  msg += `\nUser's Situation:
${text}`
  return msg
}

// ─── Gemini Legal Analysis ────────────────────────────────────────────────────
async function analyzeWithGemini(text, category, detectedLangCode, retrievedContext = '') {
  const body = {
    system_instruction: { parts: [{ text: buildSystemPrompt() }] },
    contents: [{ role: 'user', parts: [{ text: buildUserMsg(text, category, detectedLangCode, retrievedContext) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: 'application/json' },
  }
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const msg = err?.error?.message || `Gemini API error ${response.status}`
    if (response.status === 429) {
      throw new Error('Gemini quota exceeded (free tier limit reached). Switch to ⚡ DeepSeek V3 which has no such limit, or wait a minute and retry.')
    }
    throw new Error(msg)
  }
  const data = await response.json()
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse Gemini response as JSON')
  return JSON.parse(jsonMatch[0])
}

// ─── DeepSeek Legal Analysis ──────────────────────────────────────────────────
async function analyzeWithDeepSeek(text, category, detectedLangCode, retrievedContext = '') {
  const body = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user',   content: buildUserMsg(text, category, detectedLangCode, retrievedContext) },
    ],
    temperature: 0.3,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  }
  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `DeepSeek API error ${response.status}`)
  }
  const data = await response.json()
  const rawText = data.choices?.[0]?.message?.content || ''
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse DeepSeek response as JSON')
  return JSON.parse(jsonMatch[0])
}

// ─── Multi-AI Statistics & Hedged Failover Engine ──────────────────────────────
let providerStats = {
  gemini: { latency: 2000, failures: 0 },
  deepseek: { latency: 2500, failures: 0 }
};

// Load stats from localStorage
try {
  const savedStats = localStorage.getItem('lexaid_ai_stats')
  if (savedStats) {
    providerStats = { ...providerStats, ...JSON.parse(savedStats) }
  }
} catch (err) {
  console.error('Failed to load AI stats', err)
}

function saveStats() {
  try {
    localStorage.setItem('lexaid_ai_stats', JSON.stringify(providerStats))
  } catch (err) {
    console.warn('Failed to save AI stats', err)
  }
}

const PROVIDERS = {
  gemini: {
    name: 'gemini',
    fn: analyzeWithGemini,
  },
  deepseek: {
    name: 'deepseek',
    fn: analyzeWithDeepSeek,
  }
};

async function analyzeWithAI(text, category, detectedLangCode, retrievedContext = '') {
  const getProviderScore = (pKey) => {
    const stat = providerStats[pKey]
    return stat.latency + (stat.failures * 6000)
  };

  // Sort providers: best (lowest score) first
  const sortedKeys = Object.keys(PROVIDERS).sort((a, b) => getProviderScore(a) - getProviderScore(b));
  
  const primaryKey = sortedKeys[0];
  const backupKey = sortedKeys[1];

  console.log(`Starting primary provider: ${primaryKey}. Backup provider: ${backupKey}`);

  let primaryFinished = false;
  let backupStarted = false;
  
  const executeProvider = async (key) => {
    const startTime = Date.now();
    try {
      const fn = PROVIDERS[key].fn;
      const result = await fn(text, category, detectedLangCode, retrievedContext);
      
      // Success update
      const duration = Date.now() - startTime;
      providerStats[key].latency = Math.round(0.8 * providerStats[key].latency + 0.2 * duration);
      providerStats[key].failures = Math.max(0, providerStats[key].failures - 1);
      saveStats();
      
      return result;
    } catch (err) {
      // Failure update
      providerStats[key].failures += 1;
      providerStats[key].latency += 3000;
      saveStats();
      throw err;
    }
  };

  return new Promise((resolve, reject) => {
    let resolved = false;
    let primaryError = null;
    let backupError = null;

    // Start primary
    executeProvider(primaryKey)
      .then(res => {
        if (!resolved) {
          resolved = true;
          primaryFinished = true;
          resolve(res);
        }
      })
      .catch(err => {
        primaryFinished = true;
        primaryError = err;
        console.warn(`Primary AI provider (${primaryKey}) failed:`, err);
        
        // If backup has already started, wait for it.
        // If backup has NOT started, start it immediately now.
        if (!backupStarted) {
          startBackup();
        } else if (backupError) {
          reject(new Error(`Both AI services are temporarily degraded. Primary: ${primaryError.message}. Backup: ${backupError.message}`));
        }
      });

    // Start backup function
    const startBackup = () => {
      if (backupStarted) return;
      backupStarted = true;
      console.log(`Launching backup AI provider: ${backupKey}`);
      
      executeProvider(backupKey)
        .then(res => {
          if (!resolved) {
            resolved = true;
            resolve(res);
          }
        })
        .catch(err => {
          backupError = err;
          console.warn(`Backup AI provider (${backupKey}) failed:`, err);
          
          if (primaryFinished && primaryError) {
            reject(new Error(`Both AI services are temporarily degraded. Primary: ${primaryError.message}. Backup: ${backupError.message}`));
          }
        });
    };

    // Set hedge timeout: 7 seconds
    setTimeout(() => {
      if (!resolved && !primaryFinished) {
        console.log(`Primary AI (${primaryKey}) is taking longer than 7s. Invoking backup provider in parallel...`);
        startBackup();
      }
    }, 7000);
  });
}



// ─── Collapsible Card ─────────────────────────────────────────────────────────
function ResultCard({ icon, title, iconBg, children, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen(o => !o)}>
        <div className="card-title-row">
          <div className="card-icon" style={{ background: iconBg }}>{icon}</div>
          <span className="card-title">{title}</span>
          {badge && <span className="card-badge">{badge}</span>}
        </div>
        <span className={`card-chevron ${open ? 'open' : ''}`}>▾</span>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  )
}

// ─── Main App Component ──────────────────────────────────────────────────────
function MainApp({ session, onLogout }) {
  const [theme, setTheme] = useState('light')
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme) }, [theme])

  // Input state
  const [situation, setSituation] = useState('')
  const [category, setCategory] = useState('Criminal')

  // RAG (Legal Database Search) state
  const enableRAG = true
  const [retrievedSections, setRetrievedSections] = useState([])
  const [isSearchingDB, setIsSearchingDB] = useState(false)


  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [detectedLang, setDetectedLang] = useState(null) // { code, name }
  const [transcriptionRaw, setTranscriptionRaw] = useState('')

  // Analysis state
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  // Voice assistant
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('')
  const [voicePhase, setVoicePhase] = useState('idle') // idle | listening | transcribing | analyzing | speaking

  // UI state
  const [openFaqs, setOpenFaqs] = useState({})
  const [copied, setCopied] = useState(false)

  // Refs
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const toolRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const voiceModeRef = useRef(voiceMode)

  useEffect(() => {
    voiceModeRef.current = voiceMode
  }, [voiceMode])

  // ─── Recording Timer ────────────────────────────────────────────────────────
  const startTimer = () => {
    setRecordingSeconds(0)
    timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
  }
  const stopTimer = () => { clearInterval(timerRef.current); setRecordingSeconds(0) }

  // ─── MediaRecorder Start ────────────────────────────────────────────────────
  const startRecording = async () => {
    setError(null)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Microphone access is not supported by your browser or in this context (e.g. non-HTTPS).')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []

      // Pick best supported MIME type
      const mimeType = [
        'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'
      ].find(m => MediaRecorder.isTypeSupported(m)) || ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        await processAudioBlob(blob)
      }

      recorder.start(250) // collect chunks every 250ms
      setIsRecording(true)
      startTimer()
    } catch (err) {
      setError('Microphone access denied. Please allow microphone permission in your browser.')
      console.error(err)
    }
  }

  // ─── MediaRecorder Stop ─────────────────────────────────────────────────────
  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
    stopTimer()
  }

  // ─── Process Audio via Sarvam ───────────────────────────────────────────────
  const processAudioBlob = async (blob) => {
    setIsTranscribing(true)
    setError(null)
    try {
      const sarvamResult = await transcribeWithSarvam(blob)
      const transcript = sarvamResult.transcript || ''
      const langCode = sarvamResult.language_code || 'en-IN'

      setTranscriptionRaw(transcript)
      setSituation(prev => prev ? `${prev} ${transcript}` : transcript)
      setDetectedLang({
        code: langCode,
        name: LANGUAGE_NAMES[langCode] || langCode,
        flag: LANGUAGE_FLAGS[langCode] || '🌐',
      })
    } catch (err) {
      setError(`Voice transcription failed: ${err.message}`)
    } finally {
      setIsTranscribing(false)
    }
  }

  // ─── Main Analysis ──────────────────────────────────────────────────────────
  const fetchGuidance = async (text) => {
    if (!text?.trim()) return
    setLoading(true)
    setResult(null)
    setError(null)
    setActiveTab('overview')

    try {
      let context = ''
      let dbSections = []
      
      if (enableRAG) {
        setIsSearchingDB(true)
        try {
          dbSections = await searchLegalDatabase(text, { filterCategory: category })
          setRetrievedSections(dbSections)
          context = formatContextForAI(dbSections)
        } catch (dbErr) {
          console.error('Error during database RAG search:', dbErr)
        } finally {
          setIsSearchingDB(false)
        }
      } else {
        setRetrievedSections([])
      }

      const parsed = await analyzeWithAI(text, category, detectedLang?.code, context)
      setResult(parsed)
    } catch (err) {
      setError(err.message || 'Unknown error from AI service')
    } finally {
      setLoading(false)
      setIsSearchingDB(false)
    }
  }

  const handleSubmit = () => {
    if (!situation.trim()) return
    fetchGuidance(situation)
    setTimeout(() => toolRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  // ─── Voice Assistant Mode ───────────────────────────────────────────────────
  const speak = (text) => {
    synthRef.current.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.95; utt.pitch = 1; utt.lang = 'en-IN'
    synthRef.current.speak(utt)
    return utt
  }

  const startVoiceAssistant = () => {
    setError(null)
    setVoiceMode(true)
    setVoicePhase('speaking')
    setVoiceStatus('Greeting you...')
    
    let voiceAssistantTimeout = null
    let didTransition = false

    const handleTransition = () => {
      if (didTransition) return
      didTransition = true
      if (voiceAssistantTimeout) clearTimeout(voiceAssistantTimeout)
      listenVoiceAssistant()
    }

    try {
      const utt = speak(`Hello, I am your LexAid legal assistant, powered by Sarvam AI. Please describe your legal situation in any language — Hindi, Tamil, Telugu, or English — and I will help you.`)
      utt.onend = handleTransition
      utt.onerror = handleTransition
      // Fallback timeout of 6 seconds
      voiceAssistantTimeout = setTimeout(() => {
        handleTransition()
      }, 6000)
    } catch (err) {
      console.warn('SpeechSynthesis error:', err)
      handleTransition()
    }
  }

  const listenVoiceAssistant = async () => {
    setVoicePhase('listening')
    setVoiceStatus('Listening... Speak in any language')
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Microphone access is not supported by your browser or in this context (e.g. non-HTTPS).')
      setVoiceMode(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (!voiceModeRef.current) return
        setVoicePhase('transcribing')
        setVoiceStatus('Transcribing your speech with Sarvam AI...')
        try {
          const blob = new Blob(audioChunksRef.current, { type: mimeType })
          const sr = await transcribeWithSarvam(blob)
          const tx = sr.transcript || ''
          const lc = sr.language_code || 'en-IN'
          
          if (!voiceModeRef.current) return
          setSituation(tx)
          setDetectedLang({ code: lc, name: LANGUAGE_NAMES[lc] || lc, flag: LANGUAGE_FLAGS[lc] || '🌐' })

          setVoicePhase('analyzing')
          setVoiceStatus(`Analyzing legal situation (detected: ${LANGUAGE_NAMES[lc] || lc})...`)
          
          let context = ''
          let dbSections = []
          if (enableRAG) {
            try {
              dbSections = await searchLegalDatabase(tx, { filterCategory: category })
              setRetrievedSections(dbSections)
              context = formatContextForAI(dbSections)
            } catch (dbErr) {
              console.error('Error during database voice RAG search:', dbErr)
            }
          } else {
            setRetrievedSections([])
          }

          if (!voiceModeRef.current) return
          const analysis = await analyzeWithAI(tx, category, lc, context)
          setResult(analysis)

          if (!voiceModeRef.current) return
          setVoicePhase('speaking')
          setVoiceStatus('Reading your legal guidance...')
          const summary = analysis.legal_summary || analysis.legal_implications?.slice(0, 350) || 'Analysis complete.'
          const responseText = `Here is your legal guidance. ${summary} Please review the detailed information on screen. Do you need help with anything else?`
          const utt = speak(responseText)
          utt.onend = () => {
            if (voiceModeRef.current) {
              setVoicePhase('idle')
              setVoiceStatus('Done. Click Stop to exit or I can listen again.')
            }
          }
        } catch (err) {
          setError(err.message)
          setVoicePhase('idle')
          setVoiceStatus('Error occurred.')
        }
      }

      recorder.start(250)
      // Auto-stop after 30 seconds
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, 30000)

      // Stop on button click or after silence (user manually stops)
      mediaRecorderRef.current = recorder
    } catch (err) {
      setError('Microphone access denied for voice assistant.')
      console.error(err)
      setVoiceMode(false)
    }
  }

  const stopVoiceAssistant = () => {
    setVoiceMode(false)
    setVoicePhase('idle')
    setVoiceStatus('')
    mediaRecorderRef.current?.stop()
    synthRef.current.cancel()
  }

  // ─── Document Tools ──────────────────────────────────────────────────────────
  const copyDoc = () => {
    navigator.clipboard.writeText(result?.sample_document || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const downloadDoc = () => {
    const blob = new Blob([result?.sample_document || ''], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'lexaid_legal_draft.txt'; a.click()
    URL.revokeObjectURL(url)
  }

  const scrollToTool = () => toolRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // ─── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    localStorage.removeItem('lexaid_user')
    onLogout?.()
  }

  // ─── FAQ ────────────────────────────────────────────────────────────────────
  const toggleFaq = i => setOpenFaqs(o => ({ ...o, [i]: !o[i] }))

  // ─── Result Tab Content ──────────────────────────────────────────────────────
  const renderTab = () => {
    if (!result) return null
    switch (activeTab) {
      case 'overview':
        return (
          <div className="results-container">
            {/* Language Detection Card */}
            {result.original_language && (
              <div className="lang-detection-card">
                <div className="lang-detection-header">
                  <span className="lang-icon">🌐</span>
                  <div>
                    <div className="lang-label">Language Detected & Analyzed</div>
                    <div className="lang-value">{detectedLang?.flag || '🌐'} {result.original_language}</div>
                  </div>
                  <div className="lang-pills">
                    <span className="lang-pill sarvam">Sarvam STT</span>
                    <span className="lang-pill ai-engine">Multi-AI Engine</span>
                  </div>
                </div>
                {result.corrected_text && (
                  <div className="corrected-text-block">
                    <span className="corrected-label">✏️ Interpreted Query (Grammar Corrected):</span>
                    <span className="corrected-text">"{result.corrected_text}"</span>
                  </div>
                )}
                {result.legal_summary && (
                  <div className="legal-summary-block">
                    <span className="summary-label">📋 Legal Issue Identified:</span>
                    <span className="summary-text">{result.legal_summary}</span>
                  </div>
                )}
              </div>
            )}

            {/* Retrieved Legal Context (RAG) */}
            {enableRAG && (
              <ResultCard 
                icon="🏛️" 
                title="Retrieved Legal Context" 
                iconBg="rgba(201,151,43,0.1)" 
                defaultOpen={false}
                badge={`${retrievedSections.length} sections found`}
              >
                <div className="rag-context-card">
                  {retrievedSections.length > 0 ? (
                    <div className="rag-context-list">
                      {retrievedSections.map((sec, i) => (
                        <div key={i} className="rag-context-item">
                          <div className="rag-context-meta">
                            <span className="rag-context-law">⚖️ {sec.act_name}</span>
                            <span className="rag-context-sec">{sec.section_number}</span>
                          </div>
                          {sec.section_title && <div className="rag-context-title">{sec.section_title}</div>}
                          <p className="rag-context-content">{sec.section_content}</p>
                          {sec.keywords && sec.keywords.length > 0 && (
                            <div className="rag-context-keywords">
                              {sec.keywords.map((kw, kIdx) => (
                                <span key={kIdx} className="rag-context-keytag">#{kw}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rag-no-context">
                      No matching sections found in the database for this query. The AI will provide guidance using general legal knowledge.
                    </div>
                  )}
                </div>
              </ResultCard>
            )}

            <ResultCard icon="⚖️" title="Relevant Laws & Rights" iconBg="rgba(201,151,43,0.12)">
              <p className="prose">{result.relevant_laws}</p>
            </ResultCard>

            <ResultCard icon="📋" title="Legal Implications" iconBg="rgba(15,31,61,0.08)">
              <p className="prose">{result.legal_implications}</p>
            </ResultCard>

            {result.immediate_actions && result.immediate_actions !== 'N/A' && (
              <ResultCard icon="🚨" title="Immediate Actions" iconBg="rgba(239,68,68,0.1)" defaultOpen>
                <div className="immediate-highlight">
                  <p className="prose">{result.immediate_actions}</p>
                </div>
              </ResultCard>
            )}
          </div>
        )

      case 'laws':
        return (
          <ResultCard icon="⚖️" title="Relevant Laws & Constitutional Rights" iconBg="rgba(201,151,43,0.12)">
            <p className="prose">{result.relevant_laws}</p>
          </ResultCard>
        )

      case 'steps':
        return (
          <ResultCard icon="👣" title="Step-by-Step Guidance" iconBg="rgba(34,197,94,0.1)">
            <ul className="steps-list">
              {(result.step_by_step_guidance || []).map((step, i) => (
                <li key={i} className="step-item">
                  <div className="step-num-badge">{i + 1}</div>
                  <span className="step-text">{step}</span>
                </li>
              ))}
            </ul>
          </ResultCard>
        )

      case 'file':
        return (
          <ResultCard icon="🏛️" title="Where to File / Report" iconBg="rgba(59,130,246,0.1)">
            <p className="prose">{result.where_to_file}</p>
          </ResultCard>
        )

      case 'docs':
        return (
          <ResultCard icon="📂" title="Documents & Evidence Required" iconBg="rgba(124,58,237,0.1)">
            <div className="doc-chips">
              {(result.documents_required || []).map((doc, i) => (
                <div key={i} className="doc-chip"><span className="doc-chip-icon">📄</span> {doc}</div>
              ))}
            </div>
          </ResultCard>
        )

      case 'draft':
        return (
          <ResultCard icon="📝" title="Sample Legal Statement / Draft" iconBg="rgba(201,151,43,0.1)">
            <pre className="doc-preview">{result.sample_document}</pre>
            <div className="doc-actions">
              <button className={`btn-copy ${copied ? 'copied' : ''}`} onClick={copyDoc}>
                {copied ? '✅ Copied!' : '📋 Copy to Clipboard'}
              </button>
              <button className="btn-download" onClick={downloadDoc}>⬇️ Download as .txt</button>
            </div>
          </ResultCard>
        )

      case 'scripts':
        return (
          <ResultCard icon="💬" title="Communication Scripts" iconBg="rgba(249,115,22,0.1)">
            {result.communication_scripts?.police && (
              <div className="script-block">
                <div className="script-title">👮 Talking to Police Officers</div>
                <p className="script-text">{result.communication_scripts.police}</p>
                <div className="script-warning">⚠️ Do not give statements under pressure. You have the right to remain silent and request a lawyer.</div>
              </div>
            )}
            {result.communication_scripts?.lawyer && (
              <div className="script-block">
                <div className="script-title">👔 Speaking with a Lawyer</div>
                <p className="script-text">{result.communication_scripts.lawyer}</p>
              </div>
            )}
            {result.communication_scripts?.government_office && (
              <div className="script-block">
                <div className="script-title">🏛️ Filing at a Government Office</div>
                <p className="script-text">{result.communication_scripts.government_office}</p>
              </div>
            )}
          </ResultCard>
        )

      default: return null
    }
  }

  // ─── Voice Phase Colors ──────────────────────────────────────────────────────
  const PHASE_COLORS = {
    idle: '#a855f7', listening: '#ef4444', transcribing: '#f59e0b',
    analyzing: '#3b82f6', speaking: '#22c55e',
  }
  const PHASE_LABELS = {
    idle: '⬤ Ready', listening: '🔴 Listening', transcribing: '🟡 Transcribing',
    analyzing: '🔵 Analyzing', speaking: '🟢 Speaking',
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Disclaimer Banner */}
      <div className="disclaimer-banner">
        ⚖️ <span>LexAid</span> provides legal information and guidance only — not official legal advice. Consult a qualified lawyer for your specific situation.
      </div>

      {/* Navbar */}
      <nav className="navbar">
        <a className="navbar-brand" href="#hero">
          <div className="brand-icon">⚖️</div>
          <span className="brand-name">Lex<span>Aid</span></span>
        </a>
        <div className="navbar-actions">
          <button className="nav-link" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>How It Works</button>
          <button className="nav-link" onClick={scrollToTool}>Get Guidance</button>
          <button className="nav-link" onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}>FAQ</button>
          <button className="theme-toggle" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} title="Toggle dark mode">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <span className="nav-user-email" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginRight: '8px', marginLeft: '8px' }}>
            👤 {session?.user?.email}
          </span>
          <button className="nav-link logout-btn" onClick={handleLogout} title="Logout">🚪 Logout</button>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero" id="hero">
        <div className="hero-content">
          <div className="hero-badge">✨ Multilingual AI Legal Guidance</div>
          <h1>Know Your Rights.<br /><span>Take the Right Steps.</span></h1>
          <p className="hero-sub">
            LexAid is your AI legal companion — speak in <strong>Hindi, Tamil, Telugu, Bengali</strong> or any regional language.
            Powered by <strong>Sarvam AI</strong> for voice and our high-reliability <strong>Multi-AI Fusion Engine</strong> for intelligent legal analysis.
          </p>
          <div className="hero-cta">
            <button className="btn-primary" onClick={scrollToTool}>⚖️ Get Legal Guidance</button>
            <button className="btn-secondary" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>📖 How It Works</button>
          </div>
          <div className="hero-lang-pills">
            {['हिंदी', 'தமிழ்', 'తెలుగు', 'বাংলা', 'ಕನ್ನಡ', 'മലയാളം', 'मराठी', 'ਪੰਜਾਬੀ', 'English'].map(l => (
              <span key={l} className="hero-lang-pill">{l}</span>
            ))}
          </div>
          <div className="hero-stats">
            <div className="hero-stat"><span className="hero-stat-num">12+</span><span className="hero-stat-label">Languages</span></div>
            <div className="hero-stat"><span className="hero-stat-num">28+</span><span className="hero-stat-label">States & UTs</span></div>
            <div className="hero-stat"><span className="hero-stat-num">Sarvam</span><span className="hero-stat-label">STT Engine</span></div>
            <div className="hero-stat"><span className="hero-stat-num">Multi-AI</span><span className="hero-stat-label">Failover Engine</span></div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section-bg" id="how-it-works">
        <div className="section-label">Simple Process</div>
        <h2 className="section-title">How LexAid Works</h2>
        <p className="section-sub">Speak or type in any language. Get expert legal guidance in seconds.</p>
        <div className="steps-grid">
          {[
            { num: '1', icon: '🎙️', title: 'Speak or Type', desc: 'Describe your legal situation by typing or speaking in any Indian language. Sarvam AI automatically detects and transcribes your speech.' },
            { num: '2', icon: '🤖', title: 'AI Understands & Analyzes', desc: 'LexAid Multi-AI corrects grammar, identifies the legal issue, and analyzes applicable laws and rights for your jurisdiction.' },
            { num: '3', icon: '⚡', title: 'Get Clear Legal Guidance', desc: 'Receive step-by-step guidance, relevant laws, draft documents, communication scripts, and immediate action items — in clear English.' },
          ].map(s => (
            <div key={s.num} className="step-card">
              <div className="step-num">{s.num}</div>
              <div className="step-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Powered By Row */}
        <div className="powered-by-row">
          <div className="powered-by-card sarvam-card">
            <div className="powered-icon">🎙️</div>
            <div>
              <div className="powered-name">Sarvam AI</div>
              <div className="powered-desc">Multilingual Speech Recognition for Indian Languages</div>
              <div className="powered-langs">hi • ta • te • bn • kn • ml • mr • gu • pa • od • ur</div>
            </div>
          </div>
          <div className="powered-connector">+</div>
          <div className="powered-by-card gemini-card">
            <div className="powered-icon">⚙️</div>
            <div>
              <div className="powered-name">LexAid Multi-AI Engine</div>
              <div className="powered-desc">Automatic Load Balancing & Hedged Failover between multiple state-of-the-art AI networks</div>
              <div className="powered-langs">Intelligent analysis • Auto failover • High availability • Latency optimization</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Tool */}
      <section className="tool-section" id="tool" ref={toolRef}>
        <div className="tool-section-header">
          <div className="section-label">AI Legal Assistant</div>
          <h2 className="section-title">Describe Your Legal Situation</h2>
          <p className="section-sub">Type or speak in any language. Sarvam AI transcribes — LexAid Multi-AI analyzes.</p>
        </div>

        <div className="input-card">
          {/* Selectors Row */}
          <div className="input-row" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <label className="field-label" htmlFor="category-select">📁 Legal Category</label>
              <select id="category-select" className="select-field" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>


          {/* Language Support Hint */}
          <div className="lang-support-hint">
            🎙️ Supports voice input in:&nbsp;
            <strong>Hindi • Tamil • Telugu • Bengali • Kannada • Malayalam • Marathi • Gujarati • Punjabi • Odia • Urdu • English</strong>
          </div>

          {/* Textarea */}
          <div className="textarea-wrapper">
            <textarea
              id="situation-input"
              className="input-area"
              placeholder="Describe your legal situation here... या अपनी समस्या हिंदी में लिखें... இல் தமிழில் உங்கள் சிக்கலை விவரிக்கவும்..."
              value={situation}
              onChange={e => setSituation(e.target.value)}
              maxLength={3000}
            />
            <span className="char-count">{situation.length}/3000</span>
          </div>

          {/* Database Searching Status */}
          {isSearchingDB && (
            <div className="searching-db-indicator">
              <div className="searching-db-spinner" />
              <span>Searching Indian Legal Knowledge Database (RAG)...</span>
            </div>
          )}

          {/* Transcription Status */}
          {isTranscribing && (
            <div className="transcription-status">
              <div className="transcription-spinner" />
              <span>Transcribing with Sarvam AI...</span>
            </div>
          )}

          {/* Detected Language Badge */}
          {detectedLang && !isTranscribing && (
            <div className="detected-lang-badge">
              <span className="detected-lang-icon">🌐</span>
              <span>Language detected:</span>
              <strong>{detectedLang.flag} {detectedLang.name}</strong>
              <span className="sarvam-credit">via Sarvam AI</span>
              {transcriptionRaw && (
                <span className="transcription-preview">"{transcriptionRaw.slice(0, 60)}{transcriptionRaw.length > 60 ? '…' : ''}"</span>
              )}
              <button
                className="detected-lang-clear"
                onClick={() => { setDetectedLang(null); setTranscriptionRaw('') }}
              >✕</button>
            </div>
          )}

          {/* Recording Indicator */}
          {isRecording && (
            <div className="recording-bar">
              <div className="rec-dot" />
              <span className="rec-label">Recording...</span>
              <span className="rec-timer">{String(Math.floor(recordingSeconds / 60)).padStart(2,'0')}:{String(recordingSeconds % 60).padStart(2,'0')}</span>
              <div className="rec-waveform">
                {Array.from({ length: 20 }, (_, i) => (
                  <div key={i} className="rec-wave-bar" style={{ animationDelay: `${i * 0.05}s` }} />
                ))}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', marginLeft: 'auto' }}>Max 30s</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="input-actions">
            {isRecording ? (
              <button className="btn-mic recording" id="stop-recording-btn" onClick={stopRecording}>
                <span className="mic-dot" /> Stop Recording
              </button>
            ) : (
              <button
                className="btn-mic"
                id="start-recording-btn"
                onClick={startRecording}
                disabled={isTranscribing}
              >
                {isTranscribing ? '⏳ Transcribing...' : '🎙️ Record Voice'}
              </button>
            )}

            <button
              className={`btn-voice-assistant ${voiceMode ? 'active' : ''}`}
              id="voice-assistant-btn"
              onClick={voiceMode ? stopVoiceAssistant : startVoiceAssistant}
            >
              {voiceMode ? '⏹️ Stop Assistant' : '🤖 Voice Assistant'}
            </button>

            <button
              className="btn-submit"
              id="get-guidance-btn"
              onClick={handleSubmit}
              disabled={loading || !situation.trim() || isTranscribing}
            >
              {loading ? '⏳ Analyzing situation...' : '⚖️ Get Legal Guidance'}
            </button>
          </div>
        </div>

        {/* Voice Assistant Panel */}
        {voiceMode && (
          <div className="voice-panel">
            <div className="waveform">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="wave-bar" style={{
                  background: PHASE_COLORS[voicePhase] || '#a855f7',
                  animationDelay: `${i * 0.08}s`,
                  animationPlayState: voicePhase === 'idle' ? 'paused' : 'running'
                }} />
              ))}
            </div>
            <div className="voice-status">
              <div className="voice-status-label" style={{ color: PHASE_COLORS[voicePhase] }}>
                {PHASE_LABELS[voicePhase]}
              </div>
              <div className="voice-status-text">{voiceStatus || 'Initializing...'}</div>
              <div className="voice-api-row">
                <span className="lang-pill sarvam">Sarvam STT</span>
                <span className="lang-pill ai-engine">Multi-AI Engine</span>
              </div>
            </div>
            <button className="btn-stop-voice" onClick={stopVoiceAssistant}>⏹️ Stop</button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="loading-card">
            <div className="loading-spinner" />
            <h3 className="loading-title">LexAid AI is analyzing your situation...</h3>
            <p className="loading-sub">Identifying applicable laws, correcting grammar, and building your personalized legal guidance</p>
            <div className="loading-steps-row">
              <span className="loading-step">🔍 Identifying legal issue</span>
              <span className="loading-step">⚖️ Matching laws</span>
              <span className="loading-step">📝 Drafting documents</span>
            </div>
            <div className="loading-dots">
              <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-card">
            <h3>⚠️ Something went wrong</h3>
            <p>{error}</p>
            <button className="btn-retry" onClick={handleSubmit}>🔄 Try Again</button>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div id="results-section">
            {result.urgency_level && URGENCY_CONFIG[result.urgency_level] && (
              <div className={`urgency-banner ${URGENCY_CONFIG[result.urgency_level].color}`} style={{ marginBottom: 20 }}>
                <span style={{ fontSize: '1.3rem' }}>{URGENCY_CONFIG[result.urgency_level].icon}</span>
                {URGENCY_CONFIG[result.urgency_level].label}
              </div>
            )}

            <div className="tabs-bar" style={{ marginBottom: 20 }}>
              {TABS.map(t => (
                <button key={t.id} id={`tab-${t.id}`} className={`tab-btn ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                  <span>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>

            {renderTab()}

            {result.disclaimer && (
              <div className="result-disclaimer">
                <span>⚠️</span><span>{result.disclaimer}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="faq-section section-bg" id="faq">
        <div className="section-label">Common Questions</div>
        <h2 className="section-title">Frequently Asked Questions</h2>
        <p className="section-sub">Everything about LexAid, multilingual support, and how we can help.</p>
        <div className="faq-grid">
          {FAQS.map((f, i) => (
            <div key={i} className="faq-item">
              <button className="faq-question" id={`faq-${i}`} onClick={() => toggleFaq(i)} aria-expanded={!!openFaqs[i]}>
                {f.q}
                <span style={{ fontSize: '1.2rem', flexShrink: 0, transition: 'transform 0.25s', transform: openFaqs[i] ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
              </button>
              {openFaqs[i] && <div className="faq-answer">{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-disclaimer">
          <strong>⚠️ Important Legal Disclaimer:</strong> LexAid is an AI-powered legal information platform. The guidance provided is for informational purposes only and does not constitute legal advice. Always consult a qualified and licensed attorney for advice specific to your situation.
        </div>
        <div className="footer-grid">
          <div className="footer-brand">
            <h3>⚖️ Lex<span>Aid</span></h3>
            <p>Empowering people with knowledge of their legal rights. Multilingual AI legal guidance powered by Sarvam AI and LexAid Multi-AI Engine.</p>
            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className="lang-pill sarvam" style={{ fontSize: '0.75rem' }}>🎙️ Sarvam AI STT</span>
              <span className="lang-pill ai-engine" style={{ fontSize: '0.75rem' }}>🤖 Multi-AI Fusion</span>
            </div>
          </div>
          <div className="footer-col">
            <h4>Platform</h4>
            <ul>
              <li onClick={scrollToTool}>Get Guidance</li>
              <li onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>How It Works</li>
              <li onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}>FAQ</li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Legal Areas</h4>
            <ul>{CATEGORIES.slice(0, 5).map(c => <li key={c}>{c}</li>)}</ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2025 LexAid · Multilingual AI Legal Guidance</span>
          <span>Sarvam AI STT + Multi-AI Engine · For informational purposes only</span>
        </div>
      </footer>
    </>
  )
}

// ─── App Wrapper with Login State ────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const user = localStorage.getItem('lexaid_user')
      return user ? { user: JSON.parse(user) } : null
    } catch (err) {
      console.error('Failed to parse local user session:', err)
      localStorage.removeItem('lexaid_user')
      return null
    }
  })
  const [loading, setLoading] = useState(() => {
    const hasLocalUser = Boolean(localStorage.getItem('lexaid_user'))
    return supabase ? !hasLocalUser : false
  })

  useEffect(() => {
    if (!supabase) {
      return undefined
    }

    let mounted = true

    supabase.auth.getSession().then(({ data: { session: sbSession } }) => {
      if (!mounted) return
      if (sbSession) {
        setSession(sbSession)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sbSession) => {
      if (!mounted) return
      if (sbSession) {
        setSession(sbSession)
      } else {
        localStorage.removeItem('lexaid_user')
        setSession(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="login-container" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!session) {
    return <LoginPage onLogin={(newSession) => setSession(newSession)} />
  }

  return <MainApp session={session} onLogout={() => setSession(null)} />
}
