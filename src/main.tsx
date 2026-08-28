import { StrictMode, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { createClient, type Session } from '@supabase/supabase-js'
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, Clock3, GraduationCap, LayoutDashboard,
  Copy, KeyRound, LockKeyhole, LogOut, MapPin, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trophy,
  UserPlus, UsersRound, X
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

function normalizeCpf(value: string) {
  return value.replace(/\D/g,'').slice(0,11)
}

function formatCpf(value: string) {
  const cpf=normalizeCpf(value)
  return cpf
    .replace(/^(\d{3})(\d)/,'$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3')
    .replace(/\.(\d{3})(\d)/,'.$1-$2')
}

function maskCpf(value: string) {
  const cpf=normalizeCpf(value)
  return cpf.length===11 ? `***.***.***-${cpf.slice(-2)}` : 'CPF não informado'
}

function validCpf(value: string) {
  const cpf=normalizeCpf(value)
  if(cpf.length!==11 || /^(\d)\1{10}$/.test(cpf)) return false
  const calc=(base:string,factor:number)=>{
    let total=0
    for(const char of base) total+=Number(char)*factor--
    const result=(total*10)%11
    return result===10?0:result
  }
  const d1=calc(cpf.slice(0,9),10)
  const d2=calc(cpf.slice(0,9)+String(d1),11)
  return d1===Number(cpf[9]) && d2===Number(cpf[10])
}

async function loginEmailFromCpf(value: string) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalizeCpf(value)))
  const hex=Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('')
  return `cpf-${hex}@login.liveconnect.local`
}

type LessonStatus = 'not_started' | 'in_progress' | 'completed'
type StaffRole = 'owner' | 'professor' | 'coordenador' | 'suporte'

interface Context {
  ok: boolean
  staff: null | { role: StaffRole; display_name?: string | null }
  student: null | { id: string; full_name: string; status: string; avatar_url?: string | null; must_change_password?: boolean }
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
  students: Array<{ enrollment_id: string; full_name: string; cpf?: string | null; email?: string | null; whatsapp?: string | null; enrollment_status: string; completed_lessons: number; available_lessons: number; must_change_password?: boolean }>
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

interface CreateStudentResult {
  ok: boolean
  error?: string
  message?: string
  student?: {
    id: string
    full_name: string
    cpf: string
    email?: string | null
    whatsapp?: string | null
    status: string
    must_change_password: boolean
  }
  enrollment?: { id: string; status: string; cohort_id: string }
  auth?: {
    new_account: boolean
    existing_account: boolean
    temporary_password?: string | null
  }
}

interface ResetPasswordResult {
  ok: boolean
  error?: string
  full_name?: string
  cpf?: string
  email?: string
  temporary_password?: string
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
  createStudent: (payload: { full_name: string; cpf: string; email: string; whatsapp: string }) =>
    invoke<CreateStudentResult>({ action: 'admin_create_student', ...payload }),
  resetStudentPassword: (enrollmentId: string) =>
    invoke<ResetPasswordResult>({ action: 'admin_reset_student_password', enrollment_id: enrollmentId }),
  passwordChanged: () => invoke<{ ok: boolean; error?: string }>({ action: 'student_password_changed' }),
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
        <Link key={label} to={to} aria-current={isActive(to)?'location':undefined} className={isActive(to) ? 'nav active' : 'nav'}><Icon size={19}/>{label}</Link>
      )}</nav>
      <div className="sidebar-foot">
        <div className="avatar">{(name || 'LC').split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase()}</div>
        <div className="who"><strong>{name || 'Live Connect'}</strong><small>{mode === 'student' ? 'Aluno' : 'Equipe'}</small></div>
        <button onClick={logout} aria-label="Sair"><LogOut size={18}/></button>
      </div>
    </aside>
    <main>{children}</main>
    <nav className="mobile-nav">{items.map(([to, Icon, label]) =>
      <Link key={label} to={to} aria-current={isActive(to)?'location':undefined} className={isActive(to) ? 'active' : ''}><Icon size={19}/><small>{label}</small></Link>
    )}</nav>
  </div>
}

function Login({ hasSession }: { hasSession: boolean }) {
  const navigate = useNavigate()
  const [mode,setMode] = useState<'student'|'staff'>('student')
  const [identifier,setIdentifier] = useState('')
  const [password,setPassword] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')

  if (hasSession) return <Navigate to="/" replace/>

  const changeMode=(next:'student'|'staff')=>{
    setMode(next)
    setIdentifier('')
    setPassword('')
    setError('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    let authEmail=''
    if(mode==='student'){
      if(!validCpf(identifier)) return setError('Informe um CPF válido.')
      authEmail=await loginEmailFromCpf(identifier)
    }else{
      authEmail=identifier.trim().toLowerCase()
      if(!authEmail.includes('@')) return setError('Informe o e-mail da equipe.')
    }

    setLoading(true)
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: authEmail, password })
    setLoading(false)

    if (loginError) {
      return setError(mode==='student'
        ? 'Não foi possível entrar. Confira seu CPF e sua senha.'
        : 'Não foi possível entrar. Confira seu e-mail e sua senha.')
    }
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
        <p>{mode==='student'?'Aluno, entre com seu CPF e sua senha.':'Acesso reservado à equipe Live Connect.'}</p>

        <div className="login-mode" role="tablist" aria-label="Tipo de acesso">
          <button type="button" role="tab" aria-selected={mode==='student'} className={mode==='student'?'active':''} onClick={()=>changeMode('student')}>Aluno</button>
          <button type="button" role="tab" aria-selected={mode==='staff'} className={mode==='staff'?'active':''} onClick={()=>changeMode('staff')}>Equipe</button>
        </div>

        {mode==='student'
          ? <label>CPF<input
              inputMode="numeric"
              value={formatCpf(identifier)}
              onChange={e=>setIdentifier(normalizeCpf(e.target.value))}
              autoComplete="username"
              required
              placeholder="000.000.000-00"
              maxLength={14}
            /></label>
          : <label>E-mail da equipe<input
              type="email"
              value={identifier}
              onChange={e=>setIdentifier(e.target.value)}
              autoComplete="username"
              required
              placeholder="seuemail@exemplo.com"
            /></label>}

        <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required placeholder={mode==='student'?'Senha temporária ou pessoal':'Sua senha'}/></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary wide" disabled={loading}>{loading ? 'Entrando…' : <>Entrar na Central <ArrowRight size={18}/></>}</button>
        <small className="help">{mode==='student'?'No primeiro acesso, a senha temporária deverá ser substituída.':'Problemas para acessar? Verifique sua conta administrativa.'}</small>
      </form>
    </section>
  </div>
}

function PasswordSetupPage({ name }: { name: string }) {
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  const strongEnough =
    password.length >= 10 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)

  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    setError('')
    if(!strongEnough) return setError('Use pelo menos 10 caracteres, com maiúscula, minúscula e número.')
    if(password!==confirm) return setError('As senhas não coincidem.')

    setSaving(true)
    try{
      const { error:updateError }=await supabase.auth.updateUser({password})
      if(updateError) throw updateError
      const result=await api.passwordChanged()
      if(!result.ok) throw new Error('Não foi possível concluir a atualização da senha.')
      window.location.assign('/aluno')
    }catch(e){
      setError((e as Error).message || 'Não foi possível alterar sua senha.')
    }finally{
      setSaving(false)
    }
  }

  const logout=async()=>{ await supabase.auth.signOut(); window.location.assign('/login') }

  return <div className="password-setup">
    <div className="password-brand"><Brand/></div>
    <form className="password-card" onSubmit={submit}>
      <span className="setup-icon"><KeyRound size={24}/></span>
      <span className="eyebrow">Primeiro acesso</span>
      <h1>Crie sua senha pessoal</h1>
      <p>Olá, {name.split(' ')[0]}. A senha recebida foi temporária. Antes de acessar as aulas, escolha uma senha só sua.</p>

      <label>Nova senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" required/></label>
      <label>Confirmar nova senha<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" required/></label>

      <div className="password-rules">
        <span className={password.length>=10?'ok':''}><CheckCircle2 size={15}/> 10 ou mais caracteres</span>
        <span className={/[A-Z]/.test(password)&&/[a-z]/.test(password)?'ok':''}><CheckCircle2 size={15}/> Letras maiúsculas e minúsculas</span>
        <span className={/[0-9]/.test(password)?'ok':''}><CheckCircle2 size={15}/> Pelo menos um número</span>
      </div>

      {error&&<div className="error" role="alert">{error}</div>}
      <button className="primary wide" disabled={saving}>{saving?'Salvando…':'Salvar senha e entrar'}</button>
      <button type="button" className="button-link setup-logout" onClick={logout}>Sair desta conta</button>
    </form>
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
  const location = useLocation()
  const [data,setData]=useState<AdminDashboard|null>(null)
  const [student,setStudent]=useState<AdminStudent|null>(null)
  const [search,setSearch]=useState('')
  const [busy,setBusy]=useState('')
  const [refreshing,setRefreshing]=useState(false)
  const [modalMode,setModalMode]=useState<'create'|'credentials'|null>(null)
  const [studentForm,setStudentForm]=useState({full_name:'',cpf:'',email:'',whatsapp:''})
  const [creating,setCreating]=useState(false)
  const [credential,setCredential]=useState<{source:'create'|'reset';full_name:string;cpf:string;email?:string|null;temporary_password?:string|null;existing_account?:boolean}|null>(null)
  const [copied,setCopied]=useState('')
  const [error,setError]=useState('')

  const load=()=>api.admin().then(setData).catch(e=>setError(e.message))
  const refresh=async()=>{
    setRefreshing(true)
    setError('')
    try { setData(await api.admin()) }
    catch(e) { setError((e as Error).message) }
    finally { setRefreshing(false) }
  }
  useEffect(()=>{load()},[])
  useEffect(()=>{
    if(!modalMode) return
    const previousOverflow=document.body.style.overflow
    const close=(event:KeyboardEvent)=>{ if(event.key==='Escape') setModalMode(null) }
    document.body.style.overflow='hidden'
    window.addEventListener('keydown',close)
    return()=>{
      document.body.style.overflow=previousOverflow
      window.removeEventListener('keydown',close)
    }
  },[modalMode])
  const filtered=useMemo(()=>{
    const term=search.trim().toLowerCase()
    const digits=normalizeCpf(search)
    return data?.students.filter(s=>
      s.full_name.toLowerCase().includes(term) ||
      Boolean(digits && s.cpf?.includes(digits)) ||
      Boolean(search && s.whatsapp?.toLowerCase().includes(term))
    )||[]
  },[data,search])
  const view = location.hash.replace('#','') || 'overview'
  const publishedLessons = data?.modules.flatMap(m=>m.lessons).filter(l=>l.publish_status==='published').length || 0
  const viewCopy = {
    overview: { eyebrow:'Central da equipe', title:'Gestor de Tráfego Pago', description:'Acompanhe os indicadores essenciais e acesse rapidamente cada frente da formação.' },
    turma: { eyebrow:'Gestão da turma', title:'Turma 01', description:'Consulte alunos, progresso e abra o controle individual de cada matrícula.' },
    liberacao: { eyebrow:'Controle acadêmico', title:'Liberações', description:'Gerencie a progressão manual das aulas com segurança e rastreabilidade.' },
    estrutura: { eyebrow:'Estrutura acadêmica', title:`${data?.modules.length || 0} módulos · ${data?.course.total_lessons || 0} aulas`, description:'Acompanhe a organização da formação e o status de publicação de cada aula.' }
  } as const
  const currentCopy = viewCopy[view as keyof typeof viewCopy] || viewCopy.overview
  const canManageStudents = data?.role==='owner' || data?.role==='coordenador'
  const seatsRemaining = Math.max(0,(data?.cohort.capacity || 0)-(data?.students.length || 0))

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

  const friendlyStudentError=(code?:string,message?:string)=>{
    if(message) return message
    if(code==='cohort_full') return 'A Turma 01 já atingiu o limite de 10 alunos.'
    if(code==='staff_account_cannot_be_student') return 'Este acesso pertence à equipe e não pode ser matriculado como aluno.'
    if(code==='invalid_cpf') return 'Informe um CPF válido.'
    if(code==='cpf_already_linked_to_another_user') return 'Este CPF já está vinculado a outro acesso.'
    if(code==='auth_user_conflict') return 'Já existe um acesso técnico para este CPF. Tente novamente.'
    if(code==='student_management_permission_required') return 'Seu perfil não possui permissão para cadastrar alunos.'
    return 'Não foi possível concluir o cadastro. Tente novamente.'
  }

  const openCreate=()=>{
    setError('')
    setCredential(null)
    setStudentForm({full_name:'',cpf:'',email:'',whatsapp:''})
    setModalMode('create')
  }

  const createStudent=async(e:FormEvent)=>{
    e.preventDefault()
    setCreating(true)
    setError('')
    try{
      const result=await api.createStudent(studentForm)
      if(!result.ok) throw new Error(friendlyStudentError(result.error,result.message))
      setCredential({
        source:'create',
        full_name:result.student?.full_name || studentForm.full_name,
        cpf:result.student?.cpf || normalizeCpf(studentForm.cpf),
        email:result.student?.email || studentForm.email || null,
        temporary_password:result.auth?.temporary_password,
        existing_account:result.auth?.existing_account
      })
      setModalMode('credentials')
      setData(await api.admin())
    }catch(e){
      setError((e as Error).message)
    }finally{
      setCreating(false)
    }
  }

  const resetPassword=async()=>{
    if(!student) return
    setBusy('reset-password')
    setError('')
    try{
      const result=await api.resetStudentPassword(student.enrollment.id)
      if(!result.ok || !result.temporary_password) throw new Error('Não foi possível gerar uma nova senha temporária.')
      setCredential({
        source:'reset',
        full_name:result.full_name || student.student.full_name,
        cpf:result.cpf || '',
        email:result.email || student.student.email || null,
        temporary_password:result.temporary_password,
        existing_account:false
      })
      setModalMode('credentials')
    }catch(e){
      setError((e as Error).message)
    }finally{
      setBusy('')
    }
  }

  const copyValue=async(value:string,label:string)=>{
    try{
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(()=>setCopied(''),1600)
    }catch{
      setCopied('')
    }
  }

  const studentDialog=modalMode ? <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)setModalMode(null)}}>
    <section className="student-modal" role="dialog" aria-modal="true" aria-labelledby="student-modal-title">
      <button className="modal-close" onClick={()=>setModalMode(null)} aria-label="Fechar"><X size={18}/></button>
      {modalMode==='create' ? <>
        <span className="setup-icon small"><UserPlus size={21}/></span>
        <span className="eyebrow">Nova matrícula</span>
        <h2 id="student-modal-title">Cadastrar aluno</h2>
        <p>O aluno será vinculado à Turma 01 e receberá acesso à Central. Restam <strong>{seatsRemaining} vagas</strong>.</p>
        <form className="student-form" onSubmit={createStudent}>
          <label>Nome completo<input autoFocus value={studentForm.full_name} onChange={e=>setStudentForm({...studentForm,full_name:e.target.value})} required minLength={3} placeholder="Nome completo do aluno"/></label>
          <label>CPF<input inputMode="numeric" value={formatCpf(studentForm.cpf)} onChange={e=>setStudentForm({...studentForm,cpf:normalizeCpf(e.target.value)})} required maxLength={14} placeholder="000.000.000-00"/><small className="field-help">O CPF será o login do aluno.</small></label>
          <label>E-mail de contato <small className="optional">opcional</small><input type="email" value={studentForm.email} onChange={e=>setStudentForm({...studentForm,email:e.target.value})} placeholder="aluno@exemplo.com"/></label>
          <label>WhatsApp<input value={studentForm.whatsapp} onChange={e=>setStudentForm({...studentForm,whatsapp:e.target.value})} placeholder="(73) 99999-9999"/></label>
          <div className="form-note"><ShieldCheck size={17}/><span>O acesso será criado com o CPF do aluno e uma senha temporária. No primeiro login, a troca da senha continua obrigatória.</span></div>
          {error&&<div className="error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={()=>setModalMode(null)}>Cancelar</button>
            <button className="primary" disabled={creating||seatsRemaining===0}>{creating?'Criando acesso…':<><Plus size={17}/> Criar matrícula e acesso</>}</button>
          </div>
        </form>
      </> : <>
        <span className="setup-icon small success-icon"><CheckCircle2 size={21}/></span>
        <span className="eyebrow">{credential?.source==='reset'?'Acesso redefinido':'Matrícula concluída'}</span>
        <h2 id="student-modal-title">{credential?.source==='reset'?'Nova senha temporária':'Aluno cadastrado'}</h2>
        <p>{credential?.existing_account
          ? 'Este CPF já possuía um acesso vinculado. A matrícula foi associada sem alterar a senha existente.'
          : 'Envie CPF e senha temporária ao aluno por um canal seguro. A troca da senha continuará obrigatória no primeiro acesso.'}</p>

        <div className="credential-box">
          <span><small>Aluno</small><strong>{credential?.full_name}</strong></span>
          <span><small>CPF — login</small><strong>{formatCpf(credential?.cpf||'')}</strong><button onClick={()=>copyValue(formatCpf(credential?.cpf||''),'cpf')}><Copy size={15}/>{copied==='cpf'?'Copiado':'Copiar'}</button></span>
          {credential?.email&&<span><small>E-mail de contato</small><strong>{credential.email}</strong></span>}
          {credential?.temporary_password&&<span className="password-line"><small>Senha temporária</small><strong>{credential.temporary_password}</strong><button onClick={()=>copyValue(credential.temporary_password||'','senha')}><Copy size={15}/>{copied==='senha'?'Copiado':'Copiar'}</button></span>}
        </div>

        {!credential?.temporary_password&&<div className="form-note"><KeyRound size={17}/><span>O aluno deve entrar com o CPF e a senha que já utiliza. Se necessário, abra o cadastro dele e use “Redefinir senha”.</span></div>}
        <div className="modal-actions single"><button className="primary" onClick={()=>{setModalMode(null);setError('')}}>Concluir</button></div>
      </>}
    </section>
  </div> : null

  if (student) return <Shell mode="admin" name="Equipe Live Connect">
    <div className="admin-page">
      <button className="back button-link" onClick={()=>setStudent(null)}><ArrowLeft size={18}/> Voltar à turma</button>
      <header className="page-head">
        <div><span className="eyebrow">Acompanhamento individual</span><h1>{student.student.full_name}</h1><p>Controle o acesso às aulas e gerencie a credencial deste aluno.</p></div>
        <div className="head-actions">
          {canManageStudents&&<button className="secondary compact" onClick={resetPassword} disabled={busy==='reset-password'}><KeyRound size={16}/>{busy==='reset-password'?'Gerando…':'Redefinir senha'}</button>}
          <span className="pill">{student.lessons.filter(l=>l.status==='completed').length}/{data.course.total_lessons} concluídas</span>
        </div>
      </header>
      {studentDialog}
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
      <header className="page-head admin-head">
        <div>
          <span className="eyebrow">{currentCopy.eyebrow}</span>
          <h1>{currentCopy.title}</h1>
          <p>{currentCopy.description}</p>
        </div>
        <div className="head-actions">
          {view==='turma'&&canManageStudents&&<button className="primary compact" onClick={openCreate} disabled={seatsRemaining===0}><UserPlus size={16}/>{seatsRemaining===0?'Turma completa':'Cadastrar aluno'}</button>}
          <button className="secondary compact" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing?'spin':''}/>{refreshing?'Atualizando…':'Atualizar'}
          </button>
          <span className="pill"><ShieldCheck size={15}/> Progressão manual</span>
        </div>
      </header>
      {studentDialog}

      {view==='overview' && <>
        <section className="kpis">
          <article><UsersRound/><span><strong>{data.students.length}/{data.cohort.capacity}</strong><small>alunos na turma</small></span></article>
          <article><GraduationCap/><span><strong>{data.students.filter(s=>s.enrollment_status==='active').length}</strong><small>matrículas ativas</small></span></article>
          <article><BookOpen/><span><strong>{publishedLessons}/{data.course.total_lessons}</strong><small>aulas publicadas</small></span></article>
          <article><Clock3/><span><strong>Seg · 18h</strong><small>encontro presencial</small></span></article>
        </section>

        <section className="overview-grid">
          <article className="overview-card featured">
            <div>
              <span className="overview-icon"><UsersRound size={22}/></span>
              <span className="eyebrow">Turma 01</span>
              <h2>{data.students.length ? data.students.length+' alunos vinculados' : 'Turma pronta para receber alunos'}</h2>
              <p>Capacidade de {data.cohort.capacity} participantes. Acompanhamento individual de progresso e liberações.</p>
            </div>
            <Link className="primary" to="/admin#turma">Gerenciar turma <ArrowRight size={17}/></Link>
          </article>

          <article className="overview-card">
            <span className="overview-icon"><ShieldCheck size={22}/></span>
            <span className="eyebrow">Governança</span>
            <h3>Progressão sob controle</h3>
            <p>As aulas permanecem fechadas até uma autorização explícita da equipe.</p>
            <Link className="text-link" to="/admin#liberacao">Abrir liberações <ArrowRight size={15}/></Link>
          </article>

          <article className="overview-card">
            <span className="overview-icon"><BookOpen size={22}/></span>
            <span className="eyebrow">Conteúdo</span>
            <h3>{publishedLessons} de {data.course.total_lessons} aulas publicadas</h3>
            <p>A estrutura já está organizada em seis módulos e pronta para receber o conteúdo pedagógico.</p>
            <Link className="text-link" to="/admin#estrutura">Ver estrutura <ArrowRight size={15}/></Link>
          </article>
        </section>

        <section className="status-strip">
          <div><span className="status-dot ok"/><span><strong>Backend acadêmico</strong><small>Operacional</small></span></div>
          <div><span className="status-dot ok"/><span><strong>Progressão manual</strong><small>Ativa</small></span></div>
          <div><span className="status-dot neutral"/><span><strong>Alunos vinculados</strong><small>{data.students.length} de {data.cohort.capacity}</small></span></div>
        </section>
      </>}

      {view==='turma' && <section id="turma" className="workspace-card">
        <div className="block-head">
          <div><span className="eyebrow">Turma 01</span><h2>Alunos e progresso</h2><p>Selecione um aluno para abrir o acompanhamento individual e controlar suas liberações.</p></div>
          <div className="search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar aluno" aria-label="Buscar aluno"/></div>
        </div>
        {filtered.length ? <div className="student-table">{filtered.map(s=>
          <button className="student-row" key={s.enrollment_id} onClick={()=>openStudent(s.enrollment_id)}>
            <span className="avatar">{s.full_name.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase()}</span>
            <span className="identity"><strong>{s.full_name}</strong><small>{s.cpf?maskCpf(s.cpf):'CPF não informado'}{s.whatsapp?' · '+s.whatsapp:''}</small></span>
            <span className="metric"><strong>{s.completed_lessons}</strong><small>concluídas</small></span>
            <span className="metric"><strong>{s.available_lessons}</strong><small>liberadas</small></span>
            <ChevronRight size={19}/>
          </button>
        )}</div> : <div className="empty-state refined">
          <span className="empty-icon"><UsersRound size={32}/></span>
          <h3>A turma ainda não possui alunos vinculados</h3>
          <p>Assim que as primeiras matrículas forem associadas à Turma 01, você poderá acompanhar progresso e liberar aulas individualmente.</p>
          {canManageStudents&&seatsRemaining>0
            ? <button className="primary" onClick={openCreate}><UserPlus size={17}/> Cadastrar primeiro aluno</button>
            : <Link className="secondary" to="/admin#estrutura">Revisar estrutura do curso</Link>}
        </div>}
      </section>}

      {view==='liberacao' && <section id="liberacao" className="workspace-card">
        <div className="block-head">
          <div><span className="eyebrow">Controle de acesso</span><h2>Governança da progressão</h2><p>As regras abaixo garantem que nenhuma aula avance sem uma ação explícita da equipe.</p></div>
        </div>
        <div className="release-grid">
          <article>
            <span className="release-icon"><UsersRound size={21}/></span>
            <h3>Liberação individual</h3>
            <p>Abra um aluno da turma para liberar ou bloquear uma aula especificamente para aquela matrícula.</p>
            <Link className="secondary" to="/admin#turma">Selecionar aluno</Link>
          </article>
          <article>
            <span className="release-icon"><ShieldCheck size={21}/></span>
            <h3>Conclusão não libera a próxima</h3>
            <p>Finalizar uma aula registra o progresso, mas não altera o acesso à etapa seguinte.</p>
            <span className="release-status"><CheckCircle2 size={16}/> Regra protegida no backend</span>
          </article>
          <article>
            <span className="release-icon"><LockKeyhole size={21}/></span>
            <h3>Conteúdo não publicado permanece fechado</h3>
            <p>Mesmo a equipe não consegue liberar uma aula enquanto seu conteúdo estiver em preparação.</p>
            <span className="release-status"><CheckCircle2 size={16}/> Proteção ativa</span>
          </article>
        </div>
        {!data.students.length && <div className="inline-notice"><UsersRound size={18}/><span><strong>Nenhum aluno para gerenciar ainda.</strong> As liberações individuais ficarão disponíveis assim que houver uma matrícula vinculada.</span></div>}
      </section>}

      {view==='estrutura' && <section id="estrutura" className="workspace-card">
        <div className="structure-summary">
          <div><strong>{data.modules.length}</strong><small>módulos</small></div>
          <div><strong>{data.course.total_lessons}</strong><small>aulas</small></div>
          <div><strong>{publishedLessons}</strong><small>publicadas</small></div>
          <div><strong>{Math.max(0,data.course.total_lessons-publishedLessons)}</strong><small>em preparação</small></div>
        </div>
        <div className="module-grid">{data.modules.map(m=>
          <article className="admin-module" key={m.id}>
            <div className="module-top"><span className="number">{String(m.module_order).padStart(2,'0')}</span><span className="module-badge">{m.lessons.filter(l=>l.publish_status==='published').length}/{m.lessons.length} publicadas</span></div>
            <h3>{m.title}</h3><p>{m.summary}</p>
            {m.lessons.map(l=><div className="admin-lesson" key={l.id}><strong>{String(l.global_order).padStart(2,'0')}</strong><span>{l.title}</span><small className={l.publish_status==='published'?'published':''}>{l.publish_status==='published'?'Publicado':'Pendente'}</small></div>)}
          </article>
        )}</div>
      </section>}
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
  const mustChangePassword=Boolean(context.student?.must_change_password)

  if(student && mustChangePassword && !staff){
    return <Routes><Route path="*" element={<PasswordSetupPage name={context.student?.full_name || 'Aluno'}/>}/></Routes>
  }

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
