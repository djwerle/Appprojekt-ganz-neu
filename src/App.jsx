// src/App.jsx
import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import Admin from './components/Admin'

/* ---------- kleine Helfer ---------- */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/* ---------- Auth ---------- */
function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const signUp = async () => {
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
  }
  const signIn = async () => {
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
  }

  return (
    <div className="min-h-screen bg-slate-900 grid place-items-center p-6">
      <div className="max-w-sm w-full p-6 rounded-2xl shadow bg-white/5 text-white space-y-3 border border-white/10">
        <h1 className="text-xl font-semibold">Login / Register</h1>
        <input className="w-full p-2 rounded bg-white/10" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full p-2 rounded bg-white/10" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded bg-blue-600" onClick={signIn}>Login</button>
          <button className="px-3 py-2 rounded bg-emerald-600" onClick={signUp}>Register</button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  )
}

/* ---------- Kursliste ---------- */
function Courses({ session }) {
  const [courses, setCourses] = useState([])
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    const uid = session.user.id
    // Profil sicherstellen
    supabase.from('profiles').upsert({ id: uid }).then(()=>{})
    // Kurse laden
    supabase.from('courses').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => { if (!error) setCourses(data || []) })
    // Bin ich Owner mind. eines Kurses?
    supabase.from('courses').select('id').eq('owner', uid).limit(1)
      .then(({ data }) => setIsOwner((data?.length ?? 0) > 0))
  }, [session])

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="max-w-4xl mx-auto p-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Kurse</h2>
        <div className="flex gap-2">
          {isOwner && <a className="px-3 py-2 rounded bg-slate-700" href="#/admin">Editor</a>}
          <button className="px-3 py-2 rounded bg-slate-700" onClick={() => supabase.auth.signOut()}>Logout</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {courses.length === 0 && (
          <div className="opacity-80">Noch keine Kurse gefunden. Lege in Supabase einen Kurs an (z. B. „siSwati 1“).</div>
        )}
        <ul className="grid md:grid-cols-2 gap-3">
          {courses.map(c => (
            <li key={c.id} className="rounded-xl border border-white/10 p-4">
              <div className="font-semibold">{c.title}</div>
              <div className="text-sm opacity-80">{c.description}</div>
              <a className="inline-block mt-3 px-3 py-2 rounded bg-indigo-600" href={`#/course/${c.id}`}>Öffnen</a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

/* ---------- Level-Übersicht mit Due-Badges ---------- */
function CourseView({ courseId }) {
  const [levels, setLevels] = useState([])
  const [due, setDue] = useState({}) // { [level_id]: number }

  useEffect(() => {
    // Level laden
    supabase
      .from('levels')
      .select('*')
      .eq('course_id', courseId)
      .order('sort', { ascending: true })
      .then(({ data }) => setLevels(data || []))
  }, [courseId])

  useEffect(() => {
    ;(async () => {
      const { data: session } = await supabase.auth.getSession()
      const uid = session?.session?.user?.id
      if (!uid) return setDue({})
      const { data, error } = await supabase.rpc('due_counts_for_course', { _course: courseId, _user: uid })
      if (error) return
      const map = {}
      for (const row of data || []) map[row.level_id] = row.due_count
      setDue(map)
    })()
  }, [courseId])

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-3xl mx-auto p-6">
        <a className="text-sm underline" href="#/">← Zurück</a>
        <h2 className="text-2xl font-bold mb-4">Level</h2>
        <ul className="space-y-2">
          {levels.map(l => {
            const count = due[l.id] ?? null
            return (
              <li key={l.id} className="rounded-xl border border-white/10 p-4 flex items-center justify-between">
                <span className="flex items-center gap-3">
                  {l.name}
                  {count !== null && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600/30 border border-emerald-500/40">
                      heute fällig: {count}
                    </span>
                  )}
                </span>
                <a className="px-3 py-2 rounded bg-emerald-600" href={`#/learn/${l.id}`}>Lernen</a>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/* ---------- Lernen (mit RPC + Audio) ---------- */
function LearnView({ levelId }) {
  const [cards, setCards] = useState([])
  const [idx, setIdx] = useState(0)
  const [showBack, setShowBack] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoplay, setAutoplay] = useState(true)

  const audioRef = useRef(null)

  // Karten laden (RPC bevorzugt, liefert auch audio_path)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true); setError('')

        const { data: session } = await supabase.auth.getSession()
        const uid = session?.session?.user?.id || null

        let words = []
        if (uid) {
          const { data, error } = await supabase.rpc('due_words', { _level: levelId, _user: uid })
          if (error) throw error
          words = data || []
        } else {
          const res = await supabase.from('words')
            .select('id, siswati, english, audio_path')
            .eq('level_id', levelId)
          if (res.error) throw res.error
          words = res.data || []
        }

        // Mappe audio_path -> public URL
        const mapped = words.map(w => {
          const url = w.audio_path
            ? supabase.storage.from('course-assets').getPublicUrl(w.audio_path).data.publicUrl
            : null
          return { ...w, audioUrl: url }
        })

        if (mounted) {
          setCards(shuffle([...mapped]))
          setIdx(0)
          setShowBack(false)
          setLoading(false)
        }
      } catch (e) {
        if (mounted) { setError(e.message || String(e)); setLoading(false) }
      }
    })()
    return () => { mounted = false }
  }, [levelId])

  // Bei Kartenwechsel ggf. automatisch abspielen
  useEffect(() => {
    const c = cards[idx]
    if (!c || !autoplay || !c.audioUrl) return
    // Browser verlangt User-Interaktion; falls blockiert, ignorieren.
    audioRef.current?.play().catch(() => {})
  }, [idx, cards, autoplay])

  // Tastaturkürzel
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase()
      if (k === ' ') { e.preventDefault(); setShowBack(s => !s); return }
      if (k === 'a') rate('again')
      if (k === 'h') rate('hard')
      if (k === 'g') rate('good')
      if (k === 'e') rate('easy')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, idx])

  const rate = async (grade) => {
    const word = cards[idx]
    if (!word) return

    const { data: session } = await supabase.auth.getSession()
    const uid = session?.session?.user?.id
    if (!uid) {
      setShowBack(false)
      setIdx(i => (i + 1) % cards.length)
      return
    }

    const { data: existing } = await supabase
      .from('progress')
      .select('*')
      .eq('user_id', uid)
      .eq('word_id', word.id)
      .maybeSingle()

    let repetition = existing?.repetition || 0
    let easiness = existing?.easiness ?? 2.5
    let interval = existing?.interval_days || 0

    const score = { again: 0, hard: 3, good: 4, easy: 5 }[grade]
    easiness = Math.max(1.3, easiness + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)))
    if (score < 3) { repetition = 0; interval = 1 }
    else {
      repetition += 1
      if (repetition === 1) interval = 1
      else if (repetition === 2) interval = 3
      else interval = Math.round(interval * easiness)
    }
    const due = new Date(); due.setDate(due.getDate() + interval)

    await supabase.from('progress').upsert({
      user_id: uid,
      word_id: word.id,
      repetition,
      easiness,
      interval_days: interval,
      due_date: due.toISOString().slice(0,10),
      last_result: grade,
      updated_at: new Date().toISOString()
    })

    setShowBack(false)
    setCards(prev => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== idx)
      if (idx >= next.length) setIdx(0)
      return next
    })
    setIdx(i => (i + 1) % Math.max(1, cards.length))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white grid place-items-center p-6">
        <div className="max-w-xl w-full text-center opacity-80">Lädt…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-red-300 grid place-items-center p-6">
        <div className="max-w-xl w-full text-center">Fehler: {error}</div>
      </div>
    )
  }
  if (!cards.length) {
    return (
      <div className="min-h-screen bg-slate-900 text-white grid place-items-center p-6">
        <div className="max-w-xl w-full text-center opacity-80">
          Keine Karten fällig – füge Wörter hinzu oder prüfe deine RLS/Seed-Daten.
          <div className="mt-3">
            <a className="underline" href="#/">← zurück zu den Kursen</a>
          </div>
        </div>
      </div>
    )
  }

  const card = cards[idx]
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-xl mx-auto p-6">
        <a className="text-sm underline" href="#/">← Kurse</a>
        <div className="mt-6 rounded-2xl border border-white/10 p-10 text-center bg-white/5">
          <div className="text-sm opacity-70 mb-2">Karte {idx + 1} / {cards.length}</div>
          <div className="text-3xl font-bold">{showBack ? card.english : card.siswati}</div>

          {/* Audio */}
          {card.audioUrl ? (
            <div className="mt-4">
              <audio ref={audioRef} controls src={card.audioUrl} className="w-full" />
              <label className="mt-2 inline-flex items-center gap-2 text-sm opacity-80">
                <input type="checkbox" checked={autoplay} onChange={e=>setAutoplay(e.target.checked)} />
                Auto-Play beim Kartenwechsel
              </label>
            </div>
          ) : (
            <div className="mt-4 text-sm opacity-60">Kein Audio vorhanden</div>
          )}

          <button className="mt-6 px-3 py-2 rounded bg-slate-700" onClick={() => setShowBack(s => !s)}>
            {showBack ? 'Vorderseite' : 'Rückseite'} (Space)
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <button className="px-3 py-2 rounded bg-rose-600"   onClick={() => rate('again')}>Again (A)</button>
          <button className="px-3 py-2 rounded bg-amber-600"  onClick={() => rate('hard')}>Hard (H)</button>
          <button className="px-3 py-2 rounded bg-emerald-600"onClick={() => rate('good')}>Good (G)</button>
          <button className="px-3 py-2 rounded bg-indigo-600" onClick={() => rate('easy')}>Easy (E)</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Router ---------- */
export default function App() {
  const [route, setRoute] = useState(window.location.hash)
  const [session, setSession] = useState(null)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess))
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('hashchange', onHash) }
  }, [])

  if (!session) return <Auth />

  const parts = route.replace('#','').split('/').filter(Boolean)
  if (parts[0] === 'admin') return <Admin />
  if (parts[0] === 'course' && parts[1]) return <CourseView courseId={parts[1]} />
  if (parts[0] === 'learn'  && parts[1]) return <LearnView levelId={parts[1]} />
  return <Courses session={session} />
}
