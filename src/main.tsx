import { StrictMode, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { createClient, type Session } from '@supabase/supabase-js'
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, Clock3, GraduationCap, LayoutDashboard,
  LockKeyhole, LogOut, MapPin, Search, ShieldCheck, Sparkles, Trophy,
  UsersRound
} from 'lucide-react'
import './styles.css'

type SupabaseClientType = ReturnType<typeof createClient>

let supabase: SupabaseClientType

async function resolveSupabaseConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

  if (envUrl && envKey) {
    return { supabaseUrl: envUrl, publishableKey: envKey }
  }

  const response = await fetch(
    'https://utfxjadpntvbrhnkghbf.supabase.co/functions/v1/gestor-trafego-config',
    { cache: 'no-store' }
  )

  if (!response.ok) {
    throw new Error('Não foi possível carregar a configuração da Central.')
  }

  const config = await response.json() as {
    ok: boolean
    supabaseUrl?: string
    publishableKey?: string
  }

  if (!config.ok || !config.supabaseUrl || !config.publishableKey) {
    throw new Error('Configuração da Central incompleta.')
  }

  return {
    supabaseUrl: config.supabaseUrl,
    publishableKey: config.publishableKey
  }
}

type LessonStatus = 'not_started' | 'in_progress' | 'completed'
type StaffRole = 'owner' | 'professor' | 'coordenador' | 'suporte'

interface Context {
  ok: boolean
  staff: null | { role: StaffRole; display_name?: string | null }
  student: null | { id: string; full_name: string; status: string; avatar_url?: string | null }
  enrollment: null | { id: string; status: string; joined_at: string }
  cohort: null | { id: string; name: string; status: string; starts_on?: string | null; start_time: string; end_time: string; location_text?: string | null }
  course: null | { id: string; title: string; subtitle?: string | null; workload_hours: number; expected_months: number; total_lessons: number; gate_mode: 'manual' }
}

interface LessonSummary {
  id: string
  global_order: number
  lesson_order: number
  title: string
  estimated_minutes: number
  publish_status: string
  can_open: boolean
  access_granted: boolean
  lock_reason?: string | null
  status: LessonStatus
  progress_percent: number
}

interface ModuleSummary {
  id: string
  module_order: number
  title: string
  short_title?: string | null
  summary?: string | null
  lessons: LessonSummary[]
}

interface StudentHome {
  ok: boolean
  student: { full_name: string; status: string }
  course: NonNullable<Context['course']>
  cohort: NonNullable<Context['cohort']>
  progress: { total_lessons: number; completed_lessons: number; available_lessons: number; completed_percent: number }
  modules: ModuleSummary[]
  announcements: Array<{ id: string; title: string; body: string; priority: string }>
}

interface StudentLesson {
  ok: boolean
  lesson: {
    id: string
    global_order: number
    lesson_order: number
    title: string
    summary?: string | null
    estimated_minutes: number
    objectives: string[]
    content: Array<Record<string, unknown>>
    module: { module_order: number; title: string }
    status: LessonStatus
    progress_percent: number
  }
  materials: Array<{ id: string; title: string; material_type: string; url?: string | null }>
  assignments: Array<{ id: string; title: string; required: boolean }>
}

interface AdminDashboard {
  ok: boolean
  role: string
  course: { title: string; subtitle?: string | null; workload_hours: number; expected_months: number; total_lessons: number; gate_mode: string }
  cohort: { id: string; name: string; status: string; capacity: number; starts_on?: string | null; start_time: string; end_time: string }
  students: Array<{ enrollment_id: string; full_name: string; email?: string | null; whatsapp?: string | null; enrollment_status: string; completed_lessons: number; available_lessons: number }>
  modules: Array<{ id: string; module_order: number; title: string; summary?: string | null; lessons: Array<{ id: string; global_order: number; title: string; publish_status: string }> }>
}

interface AdminStudent {
  ok: boolean
  student: { full_name: string; email?: string | null; whatsapp?: string | null; status: string }
  enrollment: { id: string; status: string }
  lessons: Array<{
    id: string
    global_order: number
    title: string
    module_order: number
    module_title: string
    publish_status: string
    effective_access: boolean
    status: LessonStatus
    progress_percent: number
  }>
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gestor-trafego-api', { body })
  if (error) throw new Error(error.message || 'Falha ao comunicar com a Central.')
  return data as T
}

const api = {
  context: () => invoke<Context>({ action: 'context' }),
  studentHome: () => invoke<StudentHome>({ action: 'student_home' }),
  studentLesson: (lessonId: string) => invoke<StudentLesson>({ action: 'student_lesson', lesson_id: lessonId }),
  complete: (lessonId: string) => invoke<{ ok: boolean; message: string }>({ action: 'student_complete', lesson_id: lessonId }),
  admin: () => invoke<AdminDashboard>({ action: 'admin_dashboard' }),
  adminStudent: (enrollmentId: string) => invoke<AdminStudent>({ action: 'admin_student', enrollment_id: enrollmentId }),
  setAccess: (enrollmentId: string, lessonId: string, allowed: boolean) =>
    invoke<{ ok: boolean; error?: string; message?: string }>({
      action: 'admin_set_student_access',
      enrollment_id: enrollmentId,
      lesson_id: lessonId,
      allowed
    })
}

function Brand() {
  return <div className="brand"><img src="/logo-live-connect.svg" alt="Live Connect Escola de Profissões" /></div>
}

function ScrollToHash() {
  const location = useLocation()

  useEffect(() => {
    const hash = location.hash.replace('#', '')

    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const timer = window.setTimeout(() => {
      const target = document.getElementById(hash)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 40)

    return () => window.clearTimeout(timer)
  }, [location.pathname, location.hash])

  return null
}

function ProgressRing({ value }: { value: number }) {
  const size = 132
  const stroke = 9
  const radius = (size - stroke) / 2
  const c = 2 * Math.PI * radius
  const offset = c - Math.max(0, Math.min(100, value)) / 100 * c
  return <div className="progress-ring">
    <svg width={size} height={size} aria-hidden="true">
      <circle className="ring-track" cx={size/2} cy={size/2} r={radius} strokeWidth={stroke}/>
      <circle className="ring-value" cx={size/2} cy={size/2} r={radius} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={offset}/>
    </svg>
    <div><strong>{Math.round(value)}%</strong><span>concluído</span></div>
  </div>
}

function Shell({ mode, name, children }: { mode: 'student'|'admin'; name?: string; children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = async () => { await supabase.auth.signOut(); navigate('/login', { replace: true }) }
  const student = [
    ['/aluno', LayoutDashboard, 'Visão geral'],
    ['/aluno#formacao', GraduationCap, 'Formação'],
    ['/aluno#materiais', BookOpen, 'Materiais'],
    ['/aluno#desempenho', Trophy, 'Desempenho']
  ] as const
  const admin = [
    ['/admin', LayoutDashboard, 'Visão geral'],
    ['/admin#turma', UsersRound, 'Turma'],
    ['/admin#liberacao', ShieldCheck, 'Liberações'],
    ['/admin#estrutura', BookOpen, 'Estrutura']
  ] as const
  const items = mode === 'student' ? student : admin
  const isActive = (to: string) => {
    const [path, hash] = to.split('#')
    if (location.pathname !== path) return false
    return hash ? location.hash === '#' + hash : !location.hash
  }

  return <div className="shell">
    <aside className="sidebar">
      <Brand/>
      <div className="product-label">
        <span>Central exclusiva</span>
        <strong>Gestor de Tráfego</strong>
        <small>{mode === 'student' ? 'Área do aluno' : 'Área da equipe'}</small>
      </div>
      <nav>{items.map(([to, Icon, label]) =>
        <Link key={label} to={to} className={isActive(to) ? 'nav active' : 'nav'}><Icon size={19}/>{label}</Link>
      )}</nav>
      <div className="sidebar-foot">
        <div className="avatar">{(name || 'LC').split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase()}</div>
        <div className="who"><strong>{name || 'Live Connect'}</strong><small>{mode === 'student' ? 'Aluno' : 'Equipe'}</small></div>
        <button onClick={logout} aria-label="Sair"><LogOut size={18}/></button>
      </div>
    </aside>
    <main>{children}</main>
    <nav className="mobile-nav">{items.map(([to, Icon, label]) =>
      <Link key={label} to={to} className={isActive(to) ? 'active' : ''}><Icon size={19}/><small>{label}</small></Link>
    )}</nav>
  </div>
}

function Login({ hasSession }: { hasSession: boolean }) {
  const navigate = useNavigate()
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')

  if (hasSession) return <Navigate to="/" replace/>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (loginError) return setError('Não foi possível entrar. Confira seu e-mail e senha.')
    navigate('/', { replace: true })
  }

  return <div className="login">
    <section className="login-visual">
      <Brand/>
      <div className="login-copy">
        <span className="eyebrow light">Formação em performance digital</span>
        <h1>Seu espaço para aprender, praticar e evoluir.</h1>
        <p>Uma experiência complementar às aulas presenciais, com progresso supervisionado e acesso liberado pelo professor.</p>
      </div>
      <div className="login-stats"><span><strong>24</strong><small>aulas</small></span><span><strong>48h</strong><small>formação</small></span><span><strong>6</strong><small>módulos</small></span></div>
    </section>
    <section className="login-form-wrap">
      <form className="login-card" onSubmit={submit}>
        <span className="secure"><LockKeyhole size={16}/> Acesso seguro</span>
        <h2>Bem-vindo à Central</h2>
        <p>Entre com os dados cadastrados pela Live Connect.</p>
        <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required placeholder="seuemail@exemplo.com"/></label>
        <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required placeholder="Sua senha"/></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary wide" disabled={loading}>{loading ? 'Entrando…' : <>Entrar na Central <ArrowRight size={18}/></>}</button>
        <small className="help">Problemas para acessar? Fale com a equipe Live Connect.</small>
      </form>
    </section>
  </div>
}

function LessonState({ lesson }: { lesson: LessonSummary }) {
  if (lesson.status === 'completed') return <span className="state done"><Check size={14}/> Concluída</span>
  if (lesson.can_open) return <span className="state open"><ArrowRight size={14}/> Disponível</span>
  if (lesson.access_granted) return <span className="state prep"><Clock3 size={14}/> Em preparação</span>
  return <span className="state locked"><LockKeyhole size={14}/> Bloqueada</span>
}

function StudentPage() {
  const [data,setData] = useState<StudentHome|null>(null)
  const [error,setError] = useState('')
  const [openModule,setOpenModule] = useState(1)

  useEffect(()=>{ api.studentHome().then(setData).catch(e=>setError(e.message)) },[])
  const next = useMemo(()=>data?.modules.flatMap(m=>m.lessons).find(l=>l.can_open && l.status!=='completed'),[data])

  if (!data && !error) return <Loading text="Preparando sua Central…"/>
  if (!data) return <Failure text={error}/>

  const firstName=data.student.full_name.split(' ')[0]

  return <Shell mode="student" name={data.student.full_name}>
    <header className="page-head">
      <div><span className="eyebrow">Sua jornada profissional</span><h1>Olá, {firstName}.</h1><p>Continue no seu ritmo. A próxima etapa será liberada pelo professor no momento certo.</p></div>
      <div className="meta"><span><CalendarDays size={17}/> Segunda-feira</span><span><Clock3 size={17}/> 18h–20h</span></div>
    </header>

    <section className="hero-grid">
      <article className="course-hero">
        <div><span className="pill dark">Formação em andamento</span><h2>{data.course.title}</h2><p>{data.course.subtitle}</p>
          <div className="facts"><span>{data.course.workload_hours}h</span><span>{data.course.total_lessons} aulas</span><span>{data.course.expected_months} meses</span></div>
          {next ? <Link className="primary" to={'/aluno/aula/'+next.id}>Continuar na aula {next.global_order}<ArrowRight size={18}/></Link> : <span className="waiting"><ShieldCheck size={18}/> Aguardando próxima liberação</span>}
        </div>
        <ProgressRing value={data.progress.completed_percent}/>
      </article>
      <article className="schedule">
        <span className="pill">Turma 01</span><h3>Seu encontro presencial</h3>
        <div><CalendarDays/><span><strong>Segunda-feira</strong><small>{data.cohort.starts_on ? new Date(data.cohort.starts_on+'T12:00:00').toLocaleDateString('pt-BR') : 'Início após confirmação da turma'}</small></span></div>
        <div><Clock3/><span><strong>18h às 20h</strong><small>Prática e acompanhamento</small></span></div>
        <div><MapPin/><span><strong>{data.cohort.location_text || 'Live Connect'}</strong><small>Aula presencial</small></span></div>
      </article>
    </section>

    {data.announcements[0] && <div className="announcement"><Sparkles size={19}/><div><strong>{data.announcements[0].title}</strong><p>{data.announcements[0].body}</p></div></div>}

    <section id="formacao" className="block">
      <div className="block-head">
        <div><span className="eyebrow">Minha formação</span><h2>Sua trilha completa</h2><p>Você enxerga toda a jornada, mas cada etapa abre somente com autorização.</p></div>
        <div className="stats"><span><strong>{data.progress.completed_lessons}</strong> concluídas</span><span><strong>{data.progress.available_lessons}</strong> liberadas</span><span><strong>{data.progress.total_lessons}</strong> total</span></div>
      </div>

      <div className="modules">{data.modules.map(m=>{
        const opened=openModule===m.module_order
        const done=m.lessons.filter(l=>l.status==='completed').length
        return <article className={'module '+(opened?'opened':'')} key={m.id}>
          <button className="module-head" onClick={()=>setOpenModule(opened?0:m.module_order)} aria-expanded={opened}>
            <span className="number">{String(m.module_order).padStart(2,'0')}</span>
            <span className="module-title"><strong>{m.title}</strong><small>{m.summary}</small></span>
            <span className="module-count"><strong>{done}/{m.lessons.length}</strong><small>concluídas</small></span>
            <ChevronDown size={20}/>
          </button>
          {opened && <div className="lesson-list">{m.lessons.map(l=>{
            const row=<div className={'lesson-row '+(l.can_open?'available ':'')+(l.status==='completed'?'completed':'')}>
              <span className="lesson-no">{String(l.global_order).padStart(2,'0')}</span>
              <span className="lesson-copy"><strong>{l.title}</strong><small><Clock3 size={13}/>{l.estimated_minutes} min {l.lock_reason ? '• '+l.lock_reason : ''}</small></span>
              <LessonState lesson={l}/>
            </div>
            return l.can_open ? <Link className="lesson-link" key={l.id} to={'/aluno/aula/'+l.id}>{row}</Link> : <div key={l.id}>{row}</div>
          })}</div>}
        </article>
      })}</div>
    </section>

    <section className="cards">
      <article><ShieldCheck/><h3>Progressão supervisionada</h3><p>Concluir uma aula registra sua evolução, mas nunca libera automaticamente a próxima.</p></article>
      <article id="materiais"><BookOpen/><h3>Materiais</h3><p>Apostilas, planilhas, modelos e arquivos surgirão conforme forem publicados.</p></article>
      <article id="desempenho"><Trophy/><h3>Desempenho</h3><p>Seu histórico de atividades, progresso e projeto final será consolidado aqui.</p></article>
    </section>
  </Shell>
}

function LessonPage() {
  const { id='' }=useParams()
  const [data,setData]=useState<StudentLesson|null>(null)
  const [error,setError]=useState('')
  const [finishing,setFinishing]=useState(false)
  const [message,setMessage]=useState('')

  useEffect(()=>{ api.studentLesson(id).then(setData).catch(e=>setError(e.message)) },[id])

  if (!data && !error) return <Loading text="Abrindo sua aula…"/>
  if (!data) return <Failure text={error || 'Aula indisponível.'}/>

  const finish=async()=>{
    setFinishing(true)
    try{
      const r=await api.complete(id)
      setMessage(r.message)
      setData({...data,lesson:{...data.lesson,status:'completed',progress_percent:100}})
    }catch(e){setError((e as Error).message)}
    finally{setFinishing(false)}
  }

  return <Shell mode="student">
    <div className="lesson-page">
      <Link className="back" to="/aluno"><ArrowLeft size={18}/> Voltar para a formação</Link>
      <header className="lesson-head">
        <div><span className="eyebrow">Módulo {data.lesson.module.module_order} · Aula {String(data.lesson.global_order).padStart(2,'0')}</span><h1>{data.lesson.title}</h1><p>{data.lesson.summary || 'O conteúdo pedagógico detalhado será inserido antes da publicação desta aula.'}</p></div>
        <div className="meta"><span><Clock3 size={17}/>{data.lesson.estimated_minutes} min</span><span><ShieldCheck size={17}/> Acesso autorizado</span></div>
      </header>

      <div className="lesson-layout">
        <article className="lesson-content">
          {data.lesson.objectives?.length>0 && <section><span className="eyebrow">Objetivos</span><ul>{data.lesson.objectives.map((x,i)=><li key={i}><CheckCircle2 size={18}/>{x}</li>)}</ul></section>}
          {data.lesson.content?.length>0 ? <pre>{JSON.stringify(data.lesson.content,null,2)}</pre> : <div className="empty-content"><BookOpen size={38}/><h2>Conteúdo em preparação</h2><p>A estrutura está pronta. O material didático será inserido em uma etapa posterior.</p></div>}
          {message && <div className="success"><CheckCircle2 size={20}/><div><strong>Aula concluída.</strong><p>{message}</p></div></div>}
          {error && <div className="error">{error}</div>}
          <button className="primary" onClick={finish} disabled={finishing||data.lesson.status==='completed'}>
            {data.lesson.status==='completed' ? <><CheckCircle2 size={18}/> Aula concluída</> : finishing?'Registrando…':'Marcar aula como concluída'}
          </button>
        </article>

        <aside>
          <div className="side-card"><span className="eyebrow">Materiais</span><h3>Recursos desta aula</h3>
            {data.materials.length ? data.materials.map(m=><a key={m.id} href={m.url||'#'}><BookOpen size={17}/><span><strong>{m.title}</strong><small>{m.material_type}</small></span></a>) : <p>Nenhum material publicado ainda.</p>}
          </div>
          <div className="side-card"><span className="eyebrow">Atividades</span><h3>Prática e entregas</h3>
            {data.assignments.length ? data.assignments.map(a=><div className="resource" key={a.id}><CheckCircle2 size={17}/><span><strong>{a.title}</strong><small>{a.required?'Obrigatória':'Complementar'}</small></span></div>) : <p>Nenhuma atividade publicada ainda.</p>}
          </div>
        </aside>
      </div>
    </div>
  </Shell>
}

function AdminPage() {
  const [data,setData]=useState<AdminDashboard|null>(null)
  const [student,setStudent]=useState<AdminStudent|null>(null)
  const [search,setSearch]=useState('')
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')

  const load=()=>api.admin().then(setData).catch(e=>setError(e.message))
  useEffect(()=>{load()},[])
  const filtered=useMemo(()=>data?.students.filter(s=>s.full_name.toLowerCase().includes(search.toLowerCase()))||[],[data,search])

  if (!data && !error) return <Loading text="Abrindo painel da equipe…"/>
  if (!data) return <Failure text={error}/>

  const openStudent=async(id:string)=>setStudent(await api.adminStudent(id))
  const toggle=async(lessonId:string,allowed:boolean)=>{
    if(!student)return
    setBusy(lessonId)
    setError('')
    try{
      const r=await api.setAccess(student.enrollment.id,lessonId,allowed)
      if(!r.ok)throw new Error(r.message||'Não foi possível alterar o acesso.')
      setStudent(await api.adminStudent(student.enrollment.id))
      load()
    }catch(e){setError((e as Error).message)}
    finally{setBusy('')}
  }

  if (student) return <Shell mode="admin" name="Equipe Live Connect">
    <div className="admin-page">
      <button className="back button-link" onClick={()=>setStudent(null)}><ArrowLeft size={18}/> Voltar à turma</button>
      <header className="page-head">
        <div><span className="eyebrow">Liberação individual</span><h1>{student.student.full_name}</h1><p>A decisão individual prevalece sobre a liberação geral da turma.</p></div>
        <span className="pill">{student.lessons.filter(l=>l.status==='completed').length}/24 concluídas</span>
      </header>
      {error&&<div className="error admin-error">{error}</div>}
      <div className="access-list">{student.lessons.map(l=>{
        const ready=l.publish_status==='published'
        return <article className="access-row" key={l.id}>
          <span className="lesson-no">{String(l.global_order).padStart(2,'0')}</span>
          <span className="lesson-copy"><strong>{l.title}</strong><small>Módulo {l.module_order} · {ready?'Conteúdo publicado':'Conteúdo ainda não publicado'}</small></span>
          <span className={'state '+(l.effective_access?'done':'locked')}>{l.effective_access?<><Check size={14}/> Liberada</>:<><LockKeyhole size={14}/> Bloqueada</>}</span>
          <button className={l.effective_access?'secondary danger':'primary small'} disabled={busy===l.id||(!ready&&!l.effective_access)} onClick={()=>toggle(l.id,!l.effective_access)}>
            {busy===l.id?'Salvando…':l.effective_access?'Bloquear':ready?'Liberar':'Aguardando conteúdo'}
          </button>
        </article>
      })}</div>
    </div>
  </Shell>

  return <Shell mode="admin" name="Equipe Live Connect">
    <div className="admin-page">
      <header className="page-head">
        <div><span className="eyebrow">Central da equipe</span><h1>Gestor de Tráfego Pago</h1><p>Acompanhe a turma e controle o acesso às aulas.</p></div>
        <span className="pill"><ShieldCheck size={15}/> Progressão manual</span>
      </header>

      <section className="kpis">
        <article><UsersRound/><span><strong>{data.students.length}/{data.cohort.capacity}</strong><small>alunos</small></span></article>
        <article><GraduationCap/><span><strong>{data.students.filter(s=>s.enrollment_status==='active').length}</strong><small>matrículas ativas</small></span></article>
        <article><Clock3/><span><strong>Seg · 18h</strong><small>horário</small></span></article>
        <article><ShieldCheck/><span><strong>Manual</strong><small>liberação</small></span></article>
      </section>

      <section id="turma" className="block">
        <div className="block-head">
          <div><span className="eyebrow">Turma 01</span><h2>Alunos e progresso</h2><p>Selecione um aluno para gerenciar o acesso individual.</p></div>
          <div className="search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar aluno" aria-label="Buscar aluno"/></div>
        </div>
        {filtered.length ? <div className="student-table">{filtered.map(s=>
          <button className="student-row" key={s.enrollment_id} onClick={()=>openStudent(s.enrollment_id)}>
            <span className="avatar">{s.full_name.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase()}</span>
            <span className="identity"><strong>{s.full_name}</strong><small>{s.email||s.whatsapp||'Contato não informado'}</small></span>
            <span className="metric"><strong>{s.completed_lessons}</strong><small>concluídas</small></span>
            <span className="metric"><strong>{s.available_lessons}</strong><small>liberadas</small></span>
            <ChevronRight size={19}/>
          </button>
        )}</div> : <div className="empty-state"><UsersRound size={42}/><h3>Nenhum aluno cadastrado ainda.</h3><p>Quando as matrículas forem vinculadas à Turma 01, os alunos aparecerão aqui.</p></div>}
      </section>

      <section id="liberacao" className="block">
        <div className="block-head">
          <div>
            <span className="eyebrow">Controle de acesso</span>
            <h2>Liberações</h2>
            <p>A progressão é manual e controlada pela equipe. Nenhuma conclusão libera a próxima aula automaticamente.</p>
          </div>
        </div>
        <div className="release-grid">
          <article>
            <span className="release-icon"><UsersRound size={21}/></span>
            <h3>Liberação individual</h3>
            <p>Selecione um aluno da turma para liberar ou bloquear aulas especificamente para ele.</p>
            <Link className="secondary" to="/admin#turma">Ir para alunos</Link>
          </article>
          <article>
            <span className="release-icon"><ShieldCheck size={21}/></span>
            <h3>Regra de progressão</h3>
            <p>A conclusão de uma aula registra o progresso, mas a aula seguinte permanece fechada até autorização.</p>
            <span className="release-status"><CheckCircle2 size={16}/> Regra ativa</span>
          </article>
          <article>
            <span className="release-icon"><LockKeyhole size={21}/></span>
            <h3>Proteção de conteúdo</h3>
            <p>Uma aula sem conteúdo publicado não pode ser liberada acidentalmente pela equipe.</p>
            <span className="release-status"><CheckCircle2 size={16}/> Proteção ativa</span>
          </article>
        </div>
      </section>

      <section id="estrutura" className="block">
        <div className="block-head"><div><span className="eyebrow">Estrutura acadêmica</span><h2>6 módulos · 24 aulas</h2><p>O conteúdo será inserido depois. Nenhuma aula é liberada por padrão.</p></div></div>
        <div className="module-grid">{data.modules.map(m=>
          <article className="admin-module" key={m.id}>
            <span className="number">{String(m.module_order).padStart(2,'0')}</span>
            <h3>{m.title}</h3><p>{m.summary}</p>
            {m.lessons.map(l=><div className="admin-lesson" key={l.id}><strong>{String(l.global_order).padStart(2,'0')}</strong><span>{l.title}</span><small>{l.publish_status==='published'?'Publicado':'Conteúdo pendente'}</small></div>)}
          </article>
        )}</div>
      </section>
    </div>
  </Shell>
}

function Loading({text}:{text:string}) {
  return <div className="center"><div className="spinner"/><p>{text}</p></div>
}

function Failure({text}:{text:string}) {
  return <div className="center"><LockKeyhole size={42}/><h2>Não foi possível continuar.</h2><p>{text}</p><button className="secondary" onClick={()=>window.location.reload()}>Tentar novamente</button></div>
}

function SessionRouter({session}:{session:Session}) {
  const [context,setContext]=useState<Context|null>(null)
  const [error,setError]=useState('')

  useEffect(()=>{api.context().then(setContext).catch(e=>setError(e.message))},[session.user.id])

  if(error)return <Failure text={error}/>
  if(!context)return <Loading text="Validando seu acesso…"/>

  const staff=Boolean(context.staff)
  const student=Boolean(context.student&&context.enrollment)

  return <Routes>
    <Route path="/admin/*" element={staff?<AdminPage/>:<Navigate to="/aluno" replace/>}/>
    <Route path="/aluno/aula/:id" element={student?<LessonPage/>:<Navigate to="/admin" replace/>}/>
    <Route path="/aluno/*" element={student?<StudentPage/>:<Navigate to="/admin" replace/>}/>
    <Route path="*" element={staff?<Navigate to="/admin" replace/>:student?<Navigate to="/aluno" replace/>:<div className="center"><h2>Acesso ainda não vinculado.</h2><p>Sua conta existe, mas ainda não está associada a uma turma desta formação.</p></div>}/>
  </Routes>
}

function App() {
  const [session,setSession]=useState<Session|null|undefined>(undefined)

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return()=>data.subscription.unsubscribe()
  },[])

  if(session===undefined)return <Loading text="Carregando Central…"/>

  return <>
    <ScrollToHash/>
    <Routes>
      <Route path="/login" element={<Login hasSession={Boolean(session)}/>}/>
      <Route path="/*" element={session?<SessionRouter session={session}/>:<Navigate to="/login" replace/>}/>
    </Routes>
  </>
}

async function bootstrap() {
  const config = await resolveSupabaseConfig()

  supabase = createClient(config.supabaseUrl, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  })

  createRoot(document.getElementById('root')!).render(
    <StrictMode><BrowserRouter><App/></BrowserRouter></StrictMode>
  )
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Falha inesperada ao iniciar a Central.'
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;padding:32px;background:#f4f7fb;font-family:Inter,system-ui,sans-serif;color:#10233f">
        <section style="max-width:560px;padding:32px;border:1px solid #dce5f0;border-radius:20px;background:white;box-shadow:0 14px 40px rgba(12,39,78,.09);text-align:center">
          <h1 style="margin:0 0 10px;font-size:1.8rem">Não foi possível iniciar a Central.</h1>
          <p style="margin:0;color:#6b7e96;line-height:1.6">${message}</p>
        </section>
      </main>
    `
  }
})
