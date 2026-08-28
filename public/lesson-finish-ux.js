(()=>{
  const LESSON_PATH='/aluno/aula/';
  let priorFocus=null;
  let modal=null;

  const onLessonPage=()=>location.pathname.startsWith(LESSON_PATH);
  const completionButton=()=>[...document.querySelectorAll('.lesson-content > button.primary')].find(button=>button.textContent?.includes('Marcar aula como concluída'))||null;

  function closeModal(){
    if(!modal)return;
    modal.remove();
    modal=null;
    document.body.classList.remove('lesson-modal-open');
    if(priorFocus instanceof HTMLElement) priorFocus.focus();
  }

  function trapFocus(event){
    if(event.key==='Escape'){
      event.preventDefault();
      closeModal();
      return;
    }
    if(event.key!=='Tab'||!modal)return;
    const focusable=[...modal.querySelectorAll('button,a,[tabindex]:not([tabindex="-1"])')].filter(el=>!el.disabled);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }

  function openConfirmation(button){
    if(modal)return;
    priorFocus=document.activeElement;
    modal=document.createElement('div');
    modal.className='lesson-confirm-backdrop';
    modal.innerHTML=`
      <section class="lesson-confirm" role="dialog" aria-modal="true" aria-labelledby="lesson-confirm-title" aria-describedby="lesson-confirm-text">
        <span class="lesson-confirm-icon" aria-hidden="true">✓</span>
        <span class="eyebrow">Confirmar conclusão</span>
        <h2 id="lesson-confirm-title">Concluir esta aula?</h2>
        <p id="lesson-confirm-text">Seu progresso será registrado como 100% nesta aula. A próxima etapa <strong>não será liberada automaticamente</strong> e continuará aguardando autorização da equipe.</p>
        <div class="lesson-confirm-note"><strong>Antes de concluir</strong><span>Confirme que você terminou o conteúdo e revisou os materiais disponíveis.</span></div>
        <div class="lesson-confirm-actions">
          <button type="button" class="secondary" data-action="cancel">Continuar estudando</button>
          <button type="button" class="primary" data-action="confirm">Sim, concluir aula</button>
        </div>
      </section>`;
    document.body.appendChild(modal);
    document.body.classList.add('lesson-modal-open');
    modal.addEventListener('keydown',trapFocus);
    modal.addEventListener('click',event=>{
      if(event.target===modal||event.target.closest('[data-action="cancel"]')) closeModal();
      const confirm=event.target.closest('[data-action="confirm"]');
      if(confirm){
        button.dataset.lessonConfirmed='true';
        closeModal();
        button.click();
      }
    });
    modal.querySelector('[data-action="confirm"]')?.focus();
  }

  function enhanceCompletionState(){
    if(!onLessonPage())return;
    const content=document.querySelector('.lesson-content');
    if(!content)return;

    const error=content.querySelector(':scope > .error');
    if(error){
      error.setAttribute('role','alert');
      error.setAttribute('aria-live','assertive');
    }

    const success=content.querySelector(':scope > .success');
    const completedButton=[...content.querySelectorAll(':scope > button.primary')].find(button=>button.textContent?.includes('Aula concluída'));
    if((success||completedButton)&&!content.querySelector('.lesson-next-step')){
      const panel=document.createElement('section');
      panel.className='lesson-next-step';
      panel.setAttribute('aria-label','Próxima etapa');
      panel.innerHTML=`
        <div class="lesson-next-step-icon" aria-hidden="true">✓</div>
        <div>
          <span class="eyebrow">Progresso registrado</span>
          <h3>Você concluiu esta aula.</h3>
          <p>A próxima aula continua sob liberação da equipe. Quando estiver disponível, ela aparecerá em destaque na sua formação.</p>
          <a href="/aluno#formacao" class="lesson-next-link">Voltar para minha formação →</a>
        </div>`;
      if(success) success.insertAdjacentElement('afterend',panel);
      else completedButton.insertAdjacentElement('beforebegin',panel);
    }
  }

  document.addEventListener('click',event=>{
    if(!onLessonPage())return;
    const target=event.target.closest('.lesson-content > button.primary');
    if(!target||!target.textContent?.includes('Marcar aula como concluída'))return;
    if(target.dataset.lessonConfirmed==='true'){
      delete target.dataset.lessonConfirmed;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openConfirmation(target);
  },true);

  new MutationObserver(enhanceCompletionState).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  window.addEventListener('popstate',()=>setTimeout(enhanceCompletionState,0));
  enhanceCompletionState();
})();
