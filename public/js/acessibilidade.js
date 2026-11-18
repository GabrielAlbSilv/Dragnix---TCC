/* ============================================================
   DRAGNIX — js/acessibilidade.js  (ACESSIBILIDADE: SURDOS E COMANDO POR VOZ)
   ============================================================

   Coloque em toda página, por último:  <script src="js/acessibilidade.js"></script>

   [A11Y-AVISO]    avisos VISUAIS (nada depende de som): window.dgxAviso('texto', 'ok'|'erro'|'info')
   [A11Y-NOMES]    nome acessível = texto visível (WCAG 2.5.3), para comando de voz "clicar <texto>"
   [A11Y-VOZ]      botão de microfone com comandos em português (Chrome/Edge) + legenda do que foi ouvido
   [A11Y-LIBRAS]   tradutor VLibras (Libras) do governo federal — carrega sozinho, se houver internet
   [A11Y-CHECAGEM] avisa na tela se algum arquivo da página não carregou (ex.: shell-extra.js)
   ============================================================ */

(() => {
    'use strict';
    if (window.__a11yIniciado) return;
    window.__a11yIniciado = true;

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const limpar = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const visivel = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));


    /* ============================================================
       [A11Y-AVISO] — AVISOS VISUAIS (substituem qualquer aviso sonoro)
       ============================================================ */

    let caixaAviso, tempoAviso;

    function criarCaixaAviso() {
        caixaAviso = document.createElement('div');
        caixaAviso.className = 'a11y-aviso';
        caixaAviso.setAttribute('role', 'status');          /* leitores de tela também anunciam */
        caixaAviso.setAttribute('aria-live', 'polite');
        caixaAviso.hidden = true;
        document.body.appendChild(caixaAviso);
    }

    window.dgxAviso = (texto, tipo = 'info', fixo = false) => {
        if (!caixaAviso) criarCaixaAviso();
        const icone = { ok: '✔', erro: '⚠', info: 'ℹ' }[tipo] || 'ℹ';     /* ícone + texto: nunca só cor */
        caixaAviso.className = `a11y-aviso a11y-aviso--${tipo}`;
        caixaAviso.textContent = `${icone} ${texto}`;
        caixaAviso.hidden = false;
        clearTimeout(tempoAviso);
        if (!fixo) tempoAviso = setTimeout(() => { caixaAviso.hidden = true; }, 6000);
    };


    /* ============================================================
       [A11Y-NOMES] — NOME ACESSÍVEL IGUAL AO TEXTO VISÍVEL
       ============================================================ */

    function ajustarNomes() {
        /* botão do perfil: o texto visível é o nome da pessoa */
        const perfil = $('#profileToggle');
        const nome = $('#userName')?.textContent.trim();
        if (perfil && nome) perfil.setAttribute('aria-label', `${nome}, abrir perfil e conquistas`);

        /* tema: texto curto e falável */
        const tema = $('#themeToggle');
        if (tema && !tema.textContent.trim()) tema.setAttribute('aria-label', 'Trocar tema');

        /* controles sem nome: usa o título */
        $$('button, a').forEach(el => {
            if (!el.textContent.trim() && !el.getAttribute('aria-label') && el.title) el.setAttribute('aria-label', el.title);
        });
    }


    /* ============================================================
       [A11Y-VOZ] — COMANDOS POR VOZ
       ============================================================ */

    const clicar = el => { if (el) { el.scrollIntoView({ block: 'center', behavior: 'auto' }); el.click(); return true; } return false; };

    /* telas do controle financeiro: na própria página troca o #hash; em outra página abre o controle já na tela */
    const aba = v => () => {
        if (document.getElementById('view-' + v)) location.hash = v;
        else location.href = 'controle-financeiro.html#' + v;
        return true;
    };
    const porTexto = texto => {
        const alvo = limpar(texto);
        if (!alvo) return null;
        const itens = $$('a, button, [role="button"], [role="tab"], summary, label').filter(visivel);
        const nomeDe = el => limpar(el.getAttribute('aria-label') || el.textContent || el.value);
        return itens.find(el => nomeDe(el) === alvo) || itens.find(el => nomeDe(el).includes(alvo));
    };

    /* abre uma tela do app.html: na própria página troca a tela; fora dela, abre a página */
    const telaApp = (hash, fn) => () => {
        if (/app\.html$/i.test(location.pathname) && typeof window[fn] === 'function') { window[fn](); return true; }
        location.href = 'app.html' + (hash ? '#' + hash : '');
        return true;
    };
    const ir = url => () => { location.href = url; return true; };
    const papel = () => { try { return JSON.parse(localStorage.getItem('user') || 'null')?.role || ''; } catch { return ''; } };
    const ehEquipe = () => ['adm', 'professor'].includes(papel());

    /* "próximo"/"voltar" dentro da lição e dos formulários: procura o botão pelo texto */
    const botaoComTexto = (...textos) => () => {
        const alvos = textos.map(limpar);
        const el = $$('#main button, main button, [role="dialog"] button').filter(visivel)
            .find(b => alvos.some(t => limpar(b.textContent).startsWith(t)));
        return clicar(el);
    };

    const COMANDOS = [
        { dizer: 'início',                frases: ['inicio', 'pagina inicial', 'ir para o inicio', 'home'], fazer: ir('pag-inicial.html') },
        { dizer: 'trilhas',               frases: ['trilhas', 'minhas trilhas', 'estudar'],          fazer: telaApp('', 'home') },
        { dizer: 'Nix',                   frases: ['nix', 'abrir nix', 'falar com o nix', 'perguntar ao nix', 'assistente', 'chatbot'], fazer: telaApp('nix', 'nix') },
        { dizer: 'ranking',               frases: ['ranking', 'abrir ranking', 'classificacao'],    fazer: telaApp('ranking', 'rank') },
        { dizer: 'conquistas',            frases: ['conquistas', 'minhas conquistas'],               fazer: telaApp('conquistas', 'badges') },
        { dizer: 'missões',               frases: ['missoes', 'missoes de hoje', 'missao'],          fazer: ir('educacao-financeira.html') },
        { dizer: 'próximo',               frases: ['proximo', 'continuar', 'avancar', 'proxima'],    fazer: botaoComTexto('continuar', 'proxim', 'avancar', 'comecar', 'verificar', 'concluir') },
        { dizer: 'voltar',                frases: ['voltar', 'anterior', 'tela anterior'],           fazer: () => botaoComTexto('voltar', 'anterior')() || (history.length > 1 ? (history.back(), true) : false) },
        { dizer: 'gastos do mês',         frases: ['gastos do mes', 'gastos', 'controle financeiro'], fazer: aba('gastos') },
        { dizer: 'educação financeira', frases: ['educacao financeira'],                           fazer: ir('educacao-financeira.html') },
        { dizer: 'CDB',                   frases: ['cdb', 'calculadora de cdb', 'investimento'],     fazer: ir('cdb.html') },
        { dizer: 'simulador',             frases: ['simulador', 'simular'],                          fazer: aba('simulador') },
        { dizer: 'reserva de emergência', frases: ['reserva de emergencia', 'reserva'],              fazer: aba('reserva') },
        { dizer: 'regra cinquenta trinta vinte', frases: ['regra', 'regra 50 30 20', 'cinquenta trinta vinte'], fazer: aba('regra') },
        { dizer: 'abrir perfil',          frases: ['abrir perfil', 'perfil', 'meu perfil'],          fazer: () => clicar($('#profileToggle') || $('.user-profile')) },
        { dizer: 'painel',                frases: ['painel', 'painel adm', 'painel professor', 'painel administrativo'], equipe: true, fazer: ir('admin.html') },
        { dizer: 'regras de negócio',     frases: ['regras de negocio', 'regras do jogo', 'niveis'], adm: true, fazer: ir('admin.html#regras') },
        { dizer: 'fechar',                frases: ['fechar', 'fechar perfil', 'fechar duvidas', 'fechar ajuda'], fazer: () => { mostrarAjuda(false); window.dgxQuemSomos && window.dgxQuemSomos.fechar(); if (window.dgxDocumentos) { window.dgxDocumentos.fechar('privacidade'); window.dgxDocumentos.fechar('termos'); } document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; } },
        { dizer: 'abrir dúvidas',         frases: ['abrir duvidas', 'duvidas', 'chat'],              fazer: () => clicar($('.sx-chat-fab')) },
        { dizer: 'pesquisa por data',     frases: ['pesquisa por data', 'calendario', 'abrir calendario'], fazer: () => clicar($('#cfDataBtn')) },
        { dizer: 'novo lançamento',       frases: ['novo lancamento', 'adicionar registro', 'adicionar lancamento'], fazer: () => { const f = $('#formLanc'); if (!f) return false; f.scrollIntoView({ block: 'center' }); f.elements.valor.focus(); return true; } },
        { dizer: 'ver tabela',            frases: ['ver tabela', 'tabela'],                          fazer: () => clicar($('#cfTabelaBtn')) },
        { dizer: 'quem somos',            frases: ['quem somos', 'equipe', 'equipe dragnix', 'sobre nos'], fazer: () => !!(window.dgxQuemSomos && window.dgxQuemSomos.abrir()) },
        { dizer: 'política de privacidade', frases: ['politica de privacidade', 'privacidade', 'lgpd'], fazer: () => !!(window.dgxDocumentos && window.dgxDocumentos.abrir('privacidade')) },
        { dizer: 'termos de uso',         frases: ['termos de uso', 'termos', 'regras de uso'], fazer: () => !!(window.dgxDocumentos && window.dgxDocumentos.abrir('termos')) },
        { dizer: 'trocar tema',          frases: ['trocar tema', 'tema', 'modo escuro', 'modo claro'], fazer: () => clicar($('#themeToggle')) },
        { dizer: 'topo',                  frases: ['topo', 'voltar ao topo', 'subir'],               fazer: () => { window.scrollTo({ top: 0 }); return true; } },
        { dizer: 'fim da página',         frases: ['fim', 'final', 'fim da pagina'],                 fazer: () => { window.scrollTo({ top: document.body.scrollHeight }); return true; } },
        { dizer: 'descer',                frases: ['descer', 'rolar para baixo', 'mais'],            fazer: () => { window.scrollBy({ top: window.innerHeight * 0.8 }); return true; } },
        { dizer: 'subir',                 frases: ['subir um pouco', 'rolar para cima'],             oculto: true, fazer: () => { window.scrollBy({ top: -window.innerHeight * 0.8 }); return true; } },
        { dizer: 'ajuda',                 frases: ['ajuda', 'comandos', 'o que posso dizer'],        fazer: () => { mostrarAjuda(true); return true; } },
        { dizer: 'parar de ouvir',        frases: ['parar de ouvir', 'desligar microfone', 'parar'], fazer: () => { parar(); return true; } }
    ];

    const comandosDoPapel = () => COMANDOS.filter(c => (!c.adm || papel() === 'adm') && (!c.equipe || ehEquipe()));

    let reconhecimento = null, ouvindo = false, botao, legenda, painelAjuda;

    function executar(fala) {
        const t = limpar(fala);
        /* 1) comando exato da lista */
        const cmd = comandosDoPapel().find(c => c.frases.some(f => t === limpar(f)));
        if (cmd) return cmd.fazer() !== false ? `Comando: ${cmd.dizer}` : null;
        /* 2) "clicar/abrir/ir para <texto do botão ou link>" */
        const m = /^(clicar em|clicar|abrir|ir para|ir pra|selecionar|tocar em|tocar) (.+)$/.exec(t);
        if (m) {
            const el = porTexto(m[2]);
            if (el) { clicar(el); return `Cliquei em: ${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40)}`; }
        }
        /* 3) o texto inteiro bate com um botão */
        const direto = porTexto(t);
        if (direto && t.length > 3) { clicar(direto); return `Cliquei em: ${(direto.getAttribute('aria-label') || direto.textContent).trim().slice(0, 40)}`; }
        return null;
    }

    window.dgxVoz = { executar };          /* útil para testar: dgxVoz.executar('simulador') */

    function criarVoz() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

        botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'a11y-voz';
        botao.setAttribute('aria-pressed', 'false');
        botao.innerHTML = '<span class="a11y-voz__ico" aria-hidden="true">🎤</span><span class="a11y-voz__txt">Comando de voz</span>';
        botao.title = 'Comando de voz (Alt + V)';
        botao.setAttribute('aria-keyshortcuts', 'Alt+V');
        document.body.appendChild(botao);

        legenda = document.createElement('div');                 /* legenda: mostra o que foi entendido */
        legenda.className = 'a11y-legenda';
        legenda.setAttribute('role', 'status');
        legenda.setAttribute('aria-live', 'polite');
        legenda.hidden = true;
        document.body.appendChild(legenda);

        painelAjuda = document.createElement('div');
        painelAjuda.className = 'a11y-ajuda';
        painelAjuda.hidden = true;
        painelAjuda.setAttribute('role', 'dialog');
        painelAjuda.setAttribute('aria-label', 'Comandos de voz');
        painelAjuda.innerHTML = `
            <button type="button" class="a11y-ajuda__x" aria-label="Fechar">&times;</button>
            <h2>Comandos de voz</h2>
            <p>Clique no microfone e fale:</p>
            <ul>${comandosDoPapel().filter(c => !c.oculto).map(c => `<li>“${c.dizer}”</li>`).join('')}
            <li>“clicar” + nome de qualquer botão ou link</li></ul>
            <p class="a11y-ajuda__dica">Teclado: <kbd>Alt</kbd> + <kbd>V</kbd> liga e desliga o microfone. <kbd>Esc</kbd> fecha esta janela.</p>`;
        document.body.appendChild(painelAjuda);
        painelAjuda.querySelector('.a11y-ajuda__x').addEventListener('click', () => mostrarAjuda(false));

        if (!SR) {
            botao.querySelector('.a11y-voz__txt').textContent = 'Ajuda de voz';
            botao.title = 'Este navegador não reconhece voz. Use o Chrome ou o Edge, ou o Controle por Voz do seu sistema.';
            botao.addEventListener('click', () => mostrarAjuda(true));
            return;
        }

        reconhecimento = new SR();
        reconhecimento.lang = 'pt-BR';
        reconhecimento.continuous = true;
        reconhecimento.interimResults = true;

        reconhecimento.onresult = e => {
            const r = e.results[e.results.length - 1];
            const fala = r[0].transcript.trim();
            mostrarLegenda(`🎤 “${fala}”`);
            if (!r.isFinal) return;
            const resp = executar(fala);
            mostrarLegenda(resp ? `✔ ${resp}` : `❔ Não entendi “${fala}”. Diga “ajuda”.`);
        };
        reconhecimento.onerror = e => {
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                window.dgxAviso('Permita o microfone no navegador para usar comandos de voz.', 'erro');
                parar();
            }
        };
        reconhecimento.onend = () => { if (ouvindo) { try { reconhecimento.start(); } catch { /* já iniciado */ } } };

        botao.addEventListener('click', () => (ouvindo ? parar() : iniciar()));
    }

    function iniciar() {
        try { reconhecimento.start(); } catch { /* já estava ouvindo */ }
        ouvindo = true;
        botao.setAttribute('aria-pressed', 'true');
        botao.classList.add('is-ouvindo');
        botao.querySelector('.a11y-voz__txt').textContent = 'Ouvindo… (clique para parar)';
        mostrarLegenda('🎤 Ouvindo. Diga “ajuda” para ver os comandos.');
    }

    function parar() {
        ouvindo = false;
        try { reconhecimento && reconhecimento.stop(); } catch { /* ignora */ }
        if (!botao) return;
        botao.setAttribute('aria-pressed', 'false');
        botao.classList.remove('is-ouvindo');
        botao.querySelector('.a11y-voz__txt').textContent = 'Comando de voz';
        legenda.hidden = true;
    }

    let tempoLegenda;
    function mostrarLegenda(txt) {
        legenda.textContent = txt;
        legenda.hidden = false;
        clearTimeout(tempoLegenda);
        tempoLegenda = setTimeout(() => { if (!ouvindo) legenda.hidden = true; }, 5000);
    }

    let focoAntesDaAjuda = null;
    function mostrarAjuda(abrir) {
        if (!painelAjuda) return;
        if (abrir && painelAjuda.hidden) {
            focoAntesDaAjuda = document.activeElement;
            painelAjuda.hidden = false;
            painelAjuda.setAttribute('tabindex', '-1');
            painelAjuda.focus();
        } else if (!abrir && !painelAjuda.hidden) {
            painelAjuda.hidden = true;
            if (focoAntesDaAjuda && focoAntesDaAjuda.focus && !ouvindo) focoAntesDaAjuda.focus();
        }
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && painelAjuda && !painelAjuda.hidden) mostrarAjuda(false);
    });

    /* tecla de atalho: Alt + V liga/desliga o microfone */
    document.addEventListener('keydown', e => {
        if (e.altKey && e.key.toLowerCase() === 'v' && botao) { e.preventDefault(); botao.click(); }
    });


    /* ============================================================
       [A11Y-LIBRAS] — VLIBRAS (tradução para Libras)
       ============================================================ */

    /* O botão do VLibras ficava no meio da lateral direita, por cima do
       conteúdo (abas da lição, botões do painel). Ele fica dentro de um
       shadow DOM, então o ajuste vai num <style> lá dentro: o botão desce
       para baixo, logo acima do botão de dúvidas. */
    function posicionarBotaoLibras(tentativa = 0) {
        const raiz = document.getElementById('vlibras-access-wrapper')?.shadowRoot;
        if (!raiz) {
            if (tentativa < 20) setTimeout(() => posicionarBotaoLibras(tentativa + 1), 500);
            return;
        }
        if (raiz.getElementById('dgx-libras-pos')) return;
        const estilo = document.createElement('style');
        estilo.id = 'dgx-libras-pos';
        estilo.textContent = `
            #vlibras-access { top: auto !important; bottom: 92px !important; right: 29px !important; }
            @media (max-width: 600px) { #vlibras-access { bottom: 80px !important; right: 21px !important; } }`;
        raiz.appendChild(estilo);
    }

    function carregarVLibras() {
        if (document.querySelector('[vw]')) return;
        const raiz = document.createElement('div');
        raiz.setAttribute('vw', '');
        raiz.className = 'enabled';
        raiz.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
        document.body.appendChild(raiz);
        const s = document.createElement('script');
        s.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
        s.async = true;
        s.onload = () => {
            try { new window.VLibras.Widget('https://vlibras.gov.br/app'); } catch { /* sem internet: ignora */ }
            posicionarBotaoLibras();
        };
        s.onerror = () => raiz.remove();
        document.body.appendChild(s);
    }


    /* ============================================================
       [A11Y-CHECAGEM] — AVISA SE ALGO NÃO CARREGOU
       ============================================================ */

    /* Só avisa sobre arquivos que a PRÓPRIA página pede no HTML.
       Páginas sem shell-extra (login, index...) não recebem aviso nenhum. */
    function checarArquivos() {
        const faltando = [];
        if ($$('script[src*="shell-extra.js"]').length && !window.__sxIniciado) faltando.push('js/shell-extra.js (perfil e dúvidas)');
        if ($$('link[href*="shell-extra.css"]').length && !getComputedStyle(document.documentElement).getPropertyValue('--sx-ok')) faltando.push('css/shell-extra.css');
        if (faltando.length) window.dgxAviso('Não carregou: ' + faltando.join(', ') + '. Confira o caminho e aperte Ctrl+F5.', 'erro', true);
    }


    /* ============================================================
       INÍCIO
       ============================================================ */

    const iniciarTudo = () => {
        ajustarNomes();
        criarVoz();
        carregarVLibras();
        setTimeout(ajustarNomes, 1500);                      /* o nome do usuário chega depois do /me */
        setTimeout(checarArquivos, 1200);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarTudo);
    else iniciarTudo();
})();