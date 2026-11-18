/* ============================================================
   DRAGNIX — js/assistente.js  (ASSISTENTE DE DÚVIDAS COM IA)
   ============================================================

   Chat do Nix, o assistente com IA da tela de Dúvidas (app.html#duvidas ou #nix).
   Responde com base no conteúdo das trilhas (servidor: chatbot.js).

     [AS-MONTAR]     window.dgxAssistente.montar(elemento, opcoes)
     [AS-MENSAGENS]  bolhas do aluno e do assistente (markdown simples)
     [AS-ENVIAR]     POST /api/chatbot e leitura da resposta aos poucos
     [AS-CONVERSA]   conversa guardada neste navegador (por usuário)

   opcoes.aoPerguntarProfessor(texto): chamado pelo botão
   "Perguntar no fórum" de cada resposta (leva a dúvida ao Fórum de dúvidas).
   Visual: css/assistente.css (carregado sozinho por este arquivo).
   ============================================================ */

(() => {
    'use strict';
    if (window.dgxAssistente) return;

    if (!document.querySelector('link[href^="css/assistente.css"]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'css/assistente.css?v=1';
        document.head.appendChild(css);
    }

    const MAX_HISTORICO = 6;      // mensagens enviadas como contexto
    const MAX_SALVAS = 30;        // mensagens guardadas no navegador
    const SUGESTOES_INICIAIS = [
        'O que são juros compostos?',
        'Como saio das dívidas do cartão?',
        'Qual a diferença entre necessidade e desejo?',
        'O que vou aprender na Trilha 2?'
    ];

    const ICONE = {
        enviar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>',
        nova: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>',
        livro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
        copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
        ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
        professor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>',
        alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>'
    };

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* markdown simples e seguro: negrito, itálico, listas e parágrafos */
    function markdown(texto) {
        const linhas = esc(texto).split('\n');
        let html = '';
        let lista = null;
        const inline = t => t
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|\s)\*(?!\s)(.+?)\*(?=\s|$|[.,;:!?])/g, '$1<em>$2</em>');
        const fechar = () => { if (lista) { html += `</${lista}>`; lista = null; } };

        for (const linha of linhas) {
            const titulo = linha.match(/^\s*#{1,6}\s+(.*)/);
            if (titulo) { fechar(); html += `<p><strong>${inline(titulo[1])}</strong></p>`; continue; }
            const ul = linha.match(/^\s*[-*•]\s+(.*)/);
            const ol = linha.match(/^\s*\d+[.)]\s+(.*)/);
            if (ul || ol) {
                const tipo = ul ? 'ul' : 'ol';
                if (lista !== tipo) { fechar(); html += `<${tipo}>`; lista = tipo; }
                html += `<li>${inline((ul || ol)[1])}</li>`;
            } else if (!linha.trim()) {
                fechar();
            } else {
                fechar();
                html += `<p>${inline(linha)}</p>`;
            }
        }
        fechar();
        return html;
    }

    /* tira as marcas [1], [2, 3] enquanto o texto ainda está chegando */
    const limparCitacoes = t => t
        .replace(/\s?[[【]\s*\d{1,2}(?:\s*[,;–-]\s*\d{1,2})*\s*(?:†[^\]】]*)?[\]】]/g, '')
        .replace(/\s?[[【][\d\s,;–†-]*$/, '');

    const nomeTrilha = t => String(t || '').replace(/^Trilha\s+(\d+)\s*-\s*/i, 'Trilha $1 · ');

    function htmlFontes(fontes) {
        if (!Array.isArray(fontes) || !fontes.length) return '';
        const chips = fontes.slice(0, 5).map(f => {
            const texto = `${esc(nomeTrilha(f.trilha))} › ${esc(f.titulo || f.modulo)}`;
            return f.lesson_id
                ? `<a class="as-fonte" href="app.html?lesson=${Number(f.lesson_id)}" title="Abrir este módulo">${ICONE.livro}${texto}</a>`
                : `<span class="as-fonte">${ICONE.livro}${texto}</span>`;
        });
        return `<div class="as-fontes"><span class="as-fontes__titulo">Baseado em</span>${chips.join('')}</div>`;
    }

    /* ============================================================
       [AS-MONTAR]
       ============================================================ */

    function montar(alvo, opcoes = {}) {
        if (!alvo) return;

        const usuario = (typeof me === 'function' && me()) || {};
        const CHAVE = 'dgx-assistente-' + (usuario.id || 'anon');

        let mensagens = [];      // [{ papel: 'user'|'assistant', texto, fontes, sugestoes }]
        let enviando = false;
        let ativo = true;

        alvo.innerHTML = `
            <div class="as" aria-label="Nix, assistente com IA">
                <header class="as-topo">
                    <span class="as-avatar" aria-hidden="true"><img src="css/images/dranix_icon_white_nobackground.png" alt=""></span>
                    <div class="as-topo__txt">
                        <strong>Nix</strong>
                        <small id="asStatus"><span class="as-ponto"></span> Assistente com IA · responde com base nas trilhas</small>
                    </div>
                    <button type="button" class="as-btn-nova" id="asNova" title="Começar uma conversa nova">${ICONE.nova}<span>Nova conversa</span></button>
                </header>

                <div class="as-msgs" id="asMsgs" role="log" aria-live="polite" aria-label="Conversa com o Nix"></div>

                <form class="as-form" id="asForm">
                    <label class="as-sr" for="asCampo">Sua dúvida para o Nix</label>
                    <textarea id="asCampo" rows="1" maxlength="1000" placeholder="Pergunte ao Nix sobre juros, orçamento, investimentos…"></textarea>
                    <button type="submit" class="as-enviar" id="asEnviar" aria-label="Enviar pergunta">${ICONE.enviar}</button>
                </form>
                <p class="as-aviso">${ICONE.alerta} <span>O Nix é uma IA e pode cometer erros. Ele não pesquisa na internet, não dá respostas de questões ou desafios e <b>não dá conselhos de investimento nem de operações bancárias</b>. Para saber mais, revise o conteúdo das trilhas; se a dúvida continuar, pergunte no <b>Fórum de dúvidas</b>.</span></p>
            </div>
        `;

        const area = alvo.querySelector('#asMsgs');
        const form = alvo.querySelector('#asForm');
        const campo = alvo.querySelector('#asCampo');
        const botao = alvo.querySelector('#asEnviar');
        const status = alvo.querySelector('#asStatus');

        /* ---------- [AS-CONVERSA] ---------- */
        const salvar = () => {
            try { localStorage.setItem(CHAVE, JSON.stringify(mensagens.slice(-MAX_SALVAS))); } catch { /* sem espaço: ignora */ }
        };

        const carregar = () => {
            try {
                const lista = JSON.parse(localStorage.getItem(CHAVE) || '[]');
                return Array.isArray(lista) ? lista.filter(m => m && m.texto && (m.papel === 'user' || m.papel === 'assistant')) : [];
            } catch { return []; }
        };

        /* ---------- [AS-MENSAGENS] ---------- */
        const rolar = () => { area.scrollTop = area.scrollHeight; };

        function boasVindas() {
            area.innerHTML = `
                <div class="as-boas">
                    <span class="as-boas__ico" aria-hidden="true"><img src="css/images/dranix_icon_white_nobackground.png" alt=""></span>
                    <h3>Olá${usuario.name ? ', ' + esc(String(usuario.name).split(' ')[0]) : ''}! Eu sou o Nix.</h3>
                    <p>Sou o assistente com IA da Dragnix. Tiro dúvidas sobre o conteúdo das trilhas: dinheiro, orçamento, juros, dívidas, investimentos e muito mais. Experimente:</p>
                    <div class="as-chips">${SUGESTOES_INICIAIS.map(s => `<button type="button" class="as-chip" data-as-pergunta="${esc(s)}">${esc(s)}</button>`).join('')}</div>
                </div>`;
        }

        function bolhaAluno(texto) {
            const div = document.createElement('div');
            div.className = 'as-msg as-msg--eu';
            div.innerHTML = `<div class="as-bolha">${esc(texto).replace(/\n/g, '<br>')}</div>`;
            area.appendChild(div);
            return div;
        }

        function bolhaBot() {
            const div = document.createElement('div');
            div.className = 'as-msg as-msg--bot';
            div.innerHTML = `
                <span class="as-msg__avatar" aria-hidden="true"><img src="css/images/dranix_icon_white_nobackground.png" alt=""></span>
                <div class="as-msg__corpo">
                    <div class="as-bolha"></div>
                    <div class="as-extras"></div>
                </div>`;
            area.appendChild(div);
            return { div, bolha: div.querySelector('.as-bolha'), extras: div.querySelector('.as-extras') };
        }

        function completarBot(partes, dados, pergunta) {
            partes.bolha.innerHTML = markdown(dados.texto);
            partes.extras.innerHTML = `
                ${htmlFontes(dados.fontes)}
                <div class="as-acoes">
                    <button type="button" class="as-acao" data-as-copiar>${ICONE.copiar}<span>Copiar</span></button>
                    ${pergunta && typeof opcoes.aoPerguntarProfessor === 'function'
                        ? `<button type="button" class="as-acao" data-as-professor>${ICONE.professor}<span>Perguntar no fórum</span></button>`
                        : ''}
                </div>`;

            const copiar = partes.extras.querySelector('[data-as-copiar]');
            copiar.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(dados.texto);
                    copiar.innerHTML = `${ICONE.ok}<span>Copiado</span>`;
                    setTimeout(() => { copiar.innerHTML = `${ICONE.copiar}<span>Copiar</span>`; }, 1800);
                } catch { /* sem permissão: ignora */ }
            });

            const prof = partes.extras.querySelector('[data-as-professor]');
            if (prof) prof.addEventListener('click', () => opcoes.aoPerguntarProfessor(pergunta));
        }

        function mostrarSugestoes(lista) {
            area.querySelectorAll('.as-seguir').forEach(el => el.remove());
            if (!Array.isArray(lista) || !lista.length) return;
            const div = document.createElement('div');
            div.className = 'as-seguir';
            div.innerHTML = `<span>Continue perguntando:</span><div class="as-chips">${lista.map(s => `<button type="button" class="as-chip" data-as-pergunta="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
            area.appendChild(div);
        }

        function mostrarErro(texto) {
            const div = document.createElement('div');
            div.className = 'as-erro';
            div.setAttribute('role', 'alert');
            div.innerHTML = `${ICONE.alerta}<span>${esc(texto)}</span>`;
            area.appendChild(div);
        }

        function redesenhar() {
            area.innerHTML = '';
            if (!mensagens.length) return boasVindas();
            mensagens.forEach((m, i) => {
                if (m.papel === 'user') bolhaAluno(m.texto);
                else {
                    const anterior = mensagens[i - 1];
                    completarBot(bolhaBot(), m, anterior && anterior.papel === 'user' ? anterior.texto : '');
                }
            });
            const ultima = mensagens[mensagens.length - 1];
            if (ultima && ultima.papel === 'assistant') mostrarSugestoes(ultima.sugestoes);
            rolar();
        }

        const atualizarBotao = () => {
            botao.disabled = enviando || !ativo || !campo.value.trim();
            campo.disabled = !ativo;
        };

        const ajustarAltura = () => {
            campo.style.height = 'auto';
            campo.style.height = Math.min(campo.scrollHeight, 160) + 'px';
        };

        /* ---------- [AS-ENVIAR] ---------- */
        async function lerEventos(resposta, aoReceber) {
            const leitor = resposta.body.getReader();
            const decodificador = new TextDecoder();
            let buffer = '';
            for (;;) {
                const { value, done } = await leitor.read();
                if (done) break;
                buffer += decodificador.decode(value, { stream: true });
                let quebra;
                while ((quebra = buffer.indexOf('\n')) >= 0) {
                    const linha = buffer.slice(0, quebra).trim();
                    buffer = buffer.slice(quebra + 1);
                    if (linha) aoReceber(JSON.parse(linha));
                }
            }
            if (buffer.trim()) aoReceber(JSON.parse(buffer));
        }

        async function perguntar(pergunta) {
            pergunta = String(pergunta || '').trim();
            if (!pergunta || enviando || !ativo) return;

            enviando = true;
            area.querySelector('.as-boas')?.remove();
            area.querySelectorAll('.as-seguir, .as-erro').forEach(el => el.remove());

            const historico = mensagens.slice(-MAX_HISTORICO).map(({ papel, texto }) => ({ papel, texto }));
            bolhaAluno(pergunta);
            campo.value = '';
            ajustarAltura();
            atualizarBotao();

            const partes = bolhaBot();
            partes.bolha.innerHTML = '<span class="as-digitando" aria-label="O Nix está escrevendo"><span></span><span></span><span></span></span>';
            area.setAttribute('aria-busy', 'true');
            rolar();

            let texto = '';
            let final = null;
            let erro = null;
            let quadro = 0;

            const desenharParcial = () => {
                quadro = 0;
                partes.bolha.innerHTML = markdown(limparCitacoes(texto)) + '<span class="as-cursor" aria-hidden="true"></span>';
                const perto = area.scrollHeight - area.scrollTop - area.clientHeight < 140;
                if (perto) rolar();
            };

            try {
                const r = await fetch('/api/chatbot', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
                    },
                    body: JSON.stringify({ pergunta, historico })
                });

                if (!r.ok || !r.body) {
                    const d = await r.json().catch(() => ({}));
                    erro = d.error || 'Não foi possível falar com o assistente agora.';
                } else {
                    await lerEventos(r, ev => {
                        if (ev.tipo === 'texto') {
                            texto += ev.conteudo;
                            if (!quadro) quadro = requestAnimationFrame(desenharParcial);
                        } else if (ev.tipo === 'fim') {
                            final = ev;
                        } else if (ev.tipo === 'erro') {
                            erro = ev.mensagem;
                        }
                    });
                    if (!final && !erro) erro = 'A resposta foi interrompida. Tente novamente.';
                }
            } catch {
                erro = 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
            }

            if (quadro) cancelAnimationFrame(quadro);
            area.removeAttribute('aria-busy');

            if (final && final.resposta) {
                const dados = { papel: 'assistant', texto: final.resposta, fontes: final.fontes || [], sugestoes: final.sugestoes || [] };
                completarBot(partes, dados, pergunta);
                mensagens.push({ papel: 'user', texto: pergunta }, dados);
                salvar();
                mostrarSugestoes(dados.sugestoes);
            } else {
                partes.div.remove();
                mostrarErro(erro || 'Não foi possível gerar a resposta. Tente novamente.');
            }

            enviando = false;
            atualizarBotao();
            rolar();
            if (!window.matchMedia('(pointer: coarse)').matches) campo.focus();
        }

        /* ---------- eventos ---------- */
        form.addEventListener('submit', e => {
            e.preventDefault();
            perguntar(campo.value);
        });

        campo.addEventListener('input', () => { ajustarAltura(); atualizarBotao(); });

        campo.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) {
                e.preventDefault();
                perguntar(campo.value);
            }
        });

        area.addEventListener('click', e => {
            const chip = e.target.closest('[data-as-pergunta]');
            if (chip) perguntar(chip.getAttribute('data-as-pergunta'));
        });

        alvo.querySelector('#asNova').addEventListener('click', () => {
            if (enviando) return;
            if (mensagens.length && !confirm('Começar uma conversa nova? A conversa atual será apagada.')) return;
            mensagens = [];
            try { localStorage.removeItem(CHAVE); } catch { /* ignora */ }
            redesenhar();
            campo.focus();
        });

        /* ---------- início ---------- */
        mensagens = carregar();
        redesenhar();
        atualizarBotao();

        /* o servidor tem a chave da IA configurada? */
        (typeof window.api === 'function' ? window.api('/chatbot/status') : Promise.reject())
            .then(s => {
                if (s && s.ativo) return;
                ativo = false;
                const ehAdm = usuario.role === 'adm';
                status.innerHTML = '<span class="as-ponto as-ponto--off"></span> Indisponível no momento';
                area.querySelector('.as-boas p')?.insertAdjacentHTML('afterend',
                    `<p class="as-indisponivel">${ICONE.alerta} O Nix ainda não está disponível.${ehAdm && s && s.motivo ? ' ' + esc(s.motivo) : ' Enquanto isso, pergunte no Fórum de dúvidas.'}</p>`);
                if (!area.querySelector('.as-boas')) mostrarErro('O Nix não está disponível no momento.');
                atualizarBotao();
            })
            .catch(() => { /* sem resposta: tenta mesmo assim ao enviar */ })
            .finally(() => {
                /* pergunta feita no campo do Nix da tela inicial (js/nix-destaque.js) */
                let pendente = '';
                try {
                    pendente = sessionStorage.getItem('dgx-nix-pergunta') || '';
                    sessionStorage.removeItem('dgx-nix-pergunta');
                } catch { /* ignora */ }
                if (!pendente) return;
                if (ativo) {
                    perguntar(pendente);
                } else {
                    campo.value = pendente;
                    ajustarAltura();
                    atualizarBotao();
                }
            });

        return { perguntar };
    }

    window.dgxAssistente = { montar };
})();
