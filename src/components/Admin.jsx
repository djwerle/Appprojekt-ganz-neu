// src/components/Admin.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Admin() {
  const [uid, setUid] = useState(null)
  const [courses, setCourses] = useState([])
  const [levels, setLevels] = useState([])
  const [words, setWords] = useState([])

  const [selectedCourse, setSelectedCourse] = useState(null)
  const [selectedLevel, setSelectedLevel] = useState(null)

  const [newCourse, setNewCourse] = useState({ title: '', description: '', is_public: true })
  const [newLevel, setNewLevel] = useState({ name: '', sort: 1 })
  const [newWord, setNewWord] = useState({ siSwati: '', english: '', part_of_speech: '' })
  const [audioFile, setAudioFile] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession()
      const id = data?.session?.user?.id || null
      setUid(id)
      if (id) loadCourses(id)
    })()
  }, [])

  const toast = (t) => { setMsg(t); setTimeout(()=>setMsg(''), 2500) }

  async function loadCourses(ownerId) {
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('owner', ownerId)
      .order('created_at', { ascending: false })
    if (!error) setCourses(data || [])
  }

  async function createCourse() {
    if (!uid) return
    const { error } = await supabase.from('courses').insert({ ...newCourse, owner: uid })
    if (error) return toast('Fehler: ' + error.message)
    setNewCourse({ title: '', description: '', is_public: true })
    toast('Kurs angelegt')
    loadCourses(uid)
  }

  async function deleteCourse(id) {
    if (!confirm('Kurs wirklich löschen?')) return
    const { error } = await supabase.from('courses').delete().eq('id', id)
    if (error) return toast('Fehler: ' + error.message)
    if (selectedCourse === id) { setSelectedCourse(null); setLevels([]); setSelectedLevel(null); setWords([]) }
    toast('Kurs gelöscht')
    loadCourses(uid)
  }

  async function loadLevels(courseId) {
    const { data, error } = await supabase
      .from('levels')
      .select('*')
      .eq('course_id', courseId)
      .order('sort', { ascending: true })
    if (!error) setLevels(data || [])
  }

  async function createLevel() {
    if (!selectedCourse) return toast('Bitte Kurs wählen')
    const payload = { course_id: selectedCourse, name: newLevel.name, sort: Number(newLevel.sort) || null }
    const { error } = await supabase.from('levels').insert(payload)
    if (error) return toast('Fehler: ' + error.message)
    setNewLevel({ name: '', sort: 1 })
    toast('Level angelegt')
    loadLevels(selectedCourse)
  }

  async function deleteLevel(id) {
    if (!confirm('Level wirklich löschen?')) return
    const { error } = await supabase.from('levels').delete().eq('id', id)
    if (error) return toast('Fehler: ' + error.message)
    if (selectedLevel === id) { setSelectedLevel(null); setWords([]) }
    toast('Level gelöscht')
    loadLevels(selectedCourse)
  }

  async function loadWords(levelId) {
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .eq('level_id', levelId)
      .order('created_at', { ascending: true })
    if (!error) setWords(data || [])
  }

  async function createWord() {
    if (!selectedCourse || !selectedLevel) return toast('Bitte Kurs & Level wählen')

    let audio_path = null
    if (audioFile) {
      const sanitized = audioFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `courses/${selectedCourse}/audio/${Date.now()}-${sanitized}`
      const { error: upErr } = await supabase.storage.from('course-assets').upload(path, audioFile, { upsert: true })
      if (upErr) return toast('Upload-Fehler: ' + upErr.message)
      audio_path = path
    }

    const payload = {
      course_id: selectedCourse,
      level_id: selectedLevel,
      siswati: newWord.siSwati,
      english: newWord.english,
      part_of_speech: newWord.part_of_speech || null,
      audio_path
    }
    const { error } = await supabase.from('words').insert(payload)
    if (error) return toast('Fehler: ' + error.message)

    setNewWord({ siSwati: '', english: '', part_of_speech: '' })
    setAudioFile(null)
    toast('Wort angelegt')
    loadWords(selectedLevel)
  }

  async function deleteWord(id) {
    if (!confirm('Wort wirklich löschen?')) return
    const { error } = await supabase.from('words').delete().eq('id', id)
    if (error) return toast('Fehler: ' + error.message)
    toast('Wort gelöscht')
    loadWords(selectedLevel)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <a className="text-sm underline" href="#/">← Zur App</a>
          <div className="opacity-80 text-sm">{msg}</div>
        </div>

        {/* Kurse */}
        <section className="rounded-2xl border border-white/10 p-4">
          <h2 className="text-lg font-semibold mb-3">Kurse verwalten</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <input className="p-2 rounded bg-white/10" placeholder="Titel" value={newCourse.title} onChange={e=>setNewCourse(v=>({...v,title:e.target.value}))} />
            <input className="p-2 rounded bg-white/10" placeholder="Beschreibung" value={newCourse.description} onChange={e=>setNewCourse(v=>({...v,description:e.target.value}))} />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={newCourse.is_public} onChange={e=>setNewCourse(v=>({...v,is_public:e.target.checked}))} />
              Öffentlich
            </label>
          </div>
          <div className="mt-2">
            <button className="px-3 py-2 rounded bg-emerald-600" onClick={createCourse} disabled={!newCourse.title}>Kurs anlegen</button>
          </div>

          <ul className="mt-4 grid md:grid-cols-2 gap-2">
            {courses.map(c => (
              <li key={c.id} className={`p-3 rounded-xl border border-white/10 ${selectedCourse===c.id?'bg-white/10':''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{c.title}</div>
                    <div className="text-sm opacity-80">{c.description}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded bg-indigo-600" onClick={()=>{setSelectedCourse(c.id); loadLevels(c.id); setSelectedLevel(null); setWords([])}}>Level</button>
                    <button className="px-2 py-1 rounded bg-rose-600" onClick={()=>deleteCourse(c.id)}>Löschen</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Level */}
        <section className="rounded-2xl border border-white/10 p-4">
          <h2 className="text-lg font-semibold mb-3">Level ({selectedCourse ? 'Kurs gewählt' : 'kein Kurs gewählt'})</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <input className="p-2 rounded bg-white/10" placeholder="Level-Name (z. B. siSwati 1)" value={newLevel.name} onChange={e=>setNewLevel(v=>({...v,name:e.target.value}))} />
            <input className="p-2 rounded bg-white/10" placeholder="Sort" value={newLevel.sort} onChange={e=>setNewLevel(v=>({...v,sort:e.target.value}))} />
            <button className="px-3 py-2 rounded bg-emerald-600" onClick={createLevel} disabled={!selectedCourse || !newLevel.name}>Level anlegen</button>
          </div>
          <ul className="mt-4 space-y-2">
            {levels.map(l => (
              <li key={l.id} className={`p-3 rounded-xl border border-white/10 flex items-center justify-between ${selectedLevel===l.id?'bg-white/10':''}`}>
                <div>{l.name} <span className="opacity-60">(sort {l.sort ?? '—'})</span></div>
                <div className="flex gap-2">
                  <button className="px-2 py-1 rounded bg-indigo-600" onClick={()=>{setSelectedLevel(l.id); loadWords(l.id)}}>Wörter</button>
                  <button className="px-2 py-1 rounded bg-rose-600" onClick={()=>deleteLevel(l.id)}>Löschen</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Wörter */}
        <section className="rounded-2xl border border-white/10 p-4">
          <h2 className="text-lg font-semibold mb-3">Wörter ({selectedLevel ? 'Level gewählt' : 'kein Level gewählt'})</h2>
          <div className="grid md:grid-cols-4 gap-3 items-center">
            <input className="p-2 rounded bg-white/10" placeholder="siSwati" value={newWord.siSwati} onChange={e=>setNewWord(v=>({...v,siSwati:e.target.value}))} />
            <input className="p-2 rounded bg-white/10" placeholder="English" value={newWord.english} onChange={e=>setNewWord(v=>({...v,english:e.target.value}))} />
            <input className="p-2 rounded bg-white/10" placeholder="Part of Speech (optional)" value={newWord.part_of_speech} onChange={e=>setNewWord(v=>({...v,part_of_speech:e.target.value}))} />
            <input type="file" accept="audio/*" onChange={e=>setAudioFile(e.target.files?.[0] || null)} className="p-2 rounded bg-white/10" />
            <button className="px-3 py-2 rounded bg-emerald-600" onClick={createWord} disabled={!selectedLevel || !newWord.siSwati || !newWord.english}>Wort anlegen</button>
          </div>

          <ul className="mt-4 space-y-2">
            {words.map(w => {
              const url = w.audio_path ? supabase.storage.from('course-assets').getPublicUrl(w.audio_path).data.publicUrl : null
              return (
                <li key={w.id} className="p-3 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{w.siswati} <span className="opacity-70">→ {w.english}</span></div>
                      {w.part_of_speech && <div className="text-sm opacity-70">{w.part_of_speech}</div>}
                    </div>
                    <button className="px-2 py-1 rounded bg-rose-600" onClick={()=>deleteWord(w.id)}>Löschen</button>
                  </div>
                  {url && <audio className="mt-2 w-full" controls src={url} />}
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
