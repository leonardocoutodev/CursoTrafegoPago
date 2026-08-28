# Central Gestor de Tráfego Pago — Live Connect

Aplicação independente para a formação **Gestor de Tráfego Pago — Formação Profissional em Performance Digital**.

## Arquitetura

- Frontend: React + TypeScript + Vite
- Autenticação: Supabase Auth
- API: Edge Function `gestor-trafego-api`
- Dados acadêmicos: schema isolado `gestor_trafego`
- O frontend **não acessa diretamente** as tabelas do schema acadêmico.
- Liberação de aulas é validada no backend.
- Concluir uma aula **não libera automaticamente** a próxima.

## Experiências

### Aluno
- visão geral da formação;
- progresso;
- 6 módulos / 24 aulas;
- estados de aula: concluída, disponível, em preparação e bloqueada;
- acesso a materiais e atividades quando publicados;
- conclusão de aula sem liberação automática da próxima etapa.

### Equipe
- visão geral da Turma 01;
- progresso dos alunos;
- inspeção individual;
- liberação/bloqueio individual de aula;
- estrutura acadêmica completa;
- proteção contra liberação de conteúdo ainda não publicado.

## Desenvolvimento local

```bash
npm install
npm run dev
```

As variáveis de frontend estão documentadas em `.env.example`. A chave utilizada é do tipo **publishable**, própria para aplicações cliente; nenhuma chave de serviço deve ser colocada no repositório.

## Estado atual

A infraestrutura acadêmica já existe no Supabase e a Central está preparada para receber o conteúdo das aulas em uma etapa posterior. Nenhuma aula nasce liberada por padrão.
## Deploy

Deploy de produção automatizado pelo Cloudflare Workers a partir da branch `main`.

