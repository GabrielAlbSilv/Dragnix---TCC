/* ============================================================
   DRAGNIX — js/admin-conquistas.js  (CRIAÇÃO DE CONQUISTAS)
   ============================================================

   Área "Conquistas" do admin.html (botão #t4). SÓ ADMINISTRADORES:
   o professor não vê o botão e o servidor recusa as rotas (403).

   O que dá para fazer:
     [CQ-FORM]    criar / editar: nome, descrição, ícone (emoji ou
                  imagem enviada), condição e se está ativa
     [CQ-PREVIA]  como o aluno vai ver a conquista
     [CQ-LISTA]   conquistas criadas (editar, ativar/desativar, excluir)
                  e as conquistas padrão do sistema (só leitura)

   Tudo é salvo no banco (Turso), tabela custom_badges. A imagem do
   ícone é reduzida para 128×128 no navegador e guardada no banco,
   como as fotos de perfil.

   Rotas (server.js): GET/POST /api/admin/badges,
                      PUT/DELETE /api/admin/badges/:id

   Precisa vir DEPOIS do js/admin.js ($, api, esc, comCarregando).
   ============================================================ */

(function () {
    'use strict';

    const botao = document.getElementById('t4');

    if (!botao) return;

    // Professor: o botão some e a área nunca é aberta
    if (typeof me !== 'function' || me()?.role !== 'adm') {
        botao.style.display = 'none';
        return;
    }

    const EMOJIS = [
        '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '👑', '💎',
        '⭐', '🌟', '✨', '🔥', '⚡', '🚀', '🎯', '💯',
        '📚', '📘', '🧠', '💡', '🎓', '✅', '🏁', '🗺️',
        '💰', '🪙', '💵', '🏦', '📈', '🐷', '🛡️', '🐉'
    ];

    const UNIDADE = {
        licoes: 'lições',
        perfeitas: 'lições sem erro',
        trilhas: 'trilhas',
        sequencia: 'dias seguidos',
        nivel: 'nível',
        xp: 'XP',
        moedas: 'moedas',
        desafios: 'desafios vencidos'
    };

    // Mesmo texto automático do servidor (quando a descrição fica vazia)
    const TEXTO = {
        licoes: v => `Conclua ${v} ${v === 1 ? 'lição' : 'lições'}`,
        perfeitas: v => `Termine ${v} ${v === 1 ? 'lição' : 'lições'} sem errar`,
        trilhas: v => `Conclua ${v} ${v === 1 ? 'trilha' : 'trilhas'}`,
        trilha: (v, t) => `Conclua a trilha "${t || 'escolhida'}"`,
        sequencia: v => `Estude ${v} ${v === 1 ? 'dia' : 'dias'} seguidos`,
        nivel: v => `Alcance o nível ${v}`,
        xp: v => `Acumule ${v} XP`,
        moedas: v => `Junte ${v} moedas`,
        desafios: v => `Vença ${v} ${v === 1 ? 'desafio' : 'desafios'}`
    };

    let dados = { custom: [], builtin: [], conditions: [], tracks: [] };
    let editando = null;          // conquista sendo editada (ou null)
    let modoIcone = 'emoji';      // 'emoji' | 'imagem'
    let imagemNova = null;        // data URL da imagem escolhida agora

    const ehImagem = v => /^\/api\/badge-icon\//.test(String(v || '')) || /^data:image\//.test(String(v || ''));

    const iconeHtml = (valor, classe = 'cq-ico') => ehImagem(valor)
        ? `<span class="${classe}"><img src="${esc(valor)}" alt=""></span>`
        : `<span class="${classe}">${esc(valor || '🏆')}</span>`;


    /* ============================================================
       IMAGEM: reduz para 128×128 PNG (mantém transparência)
       ============================================================ */

    function reduzirImagem(arquivo) {
        return new Promise((resolve, reject) => {
            if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) {
                reject(new Error('Use uma imagem PNG, JPG ou WebP.'));
                return;
            }

            if (arquivo.size > 10 * 1024 * 1024) {
                reject(new Error('A imagem deve ter no máximo 10 MB.'));
                return;
            }

            const url = URL.createObjectURL(arquivo);
            const img = new Image();

            img.onload = () => {
                try {
                    const lado = 128;
                    const escala = Math.min(lado / img.naturalWidth, lado / img.naturalHeight);
                    const w = Math.max(1, Math.round(img.naturalWidth * escala));
                    const h = Math.max(1, Math.round(img.naturalHeight * escala));
                    const canvas = document.createElement('canvas');

                    canvas.width = lado;
                    canvas.height = lado;
                    canvas.getContext('2d').drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);

                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    reject(e);
                } finally {
                    URL.revokeObjectURL(url);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Não foi possível ler a imagem.'));
            };

            img.src = url;
        });
    }


    /* ============================================================
       TELA
       ============================================================ */

    async function conquistasView() {
        dados = await api('/admin/badges');
        editando = null;
        imagemNova = null;
        modoIcone = 'emoji';
        desenhar();
    }

    function desenhar() {
        const opcoesCondicao = dados.conditions
            .map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`)
            .join('');

        const opcoesTrilha = dados.tracks
            .map(t => `<option value="${Number(t.id)}">${esc(t.title)}</option>`)
            .join('');

        /* dentro da tela Regras de negócio (aba Conquistas), se ela estiver aberta */
        (document.getElementById('rnAlvo') || $('main')).innerHTML = `
            <div class="cq">

                <section class="cq-topo">
                    <div>
                        <p class="mut">Crie conquistas para motivar os alunos. Elas são concedidas sozinhas
                        quando o aluno cumpre a condição, inclusive para quem já tinha cumprido antes.</p>
                    </div>
                    <span class="cq-total">${dados.custom.length} criada(s) · ${dados.builtin.length} padrão</span>
                </section>

                <div class="cq-grade">

                    <!-- [CQ-FORM] -->
                    <form class="card cq-form" id="cqForm" novalidate>
                        <h3 id="cqFormTitulo">Nova conquista</h3>

                        <label class="cq-campo">
                            <span>Nome</span>
                            <input id="cqNome" maxlength="60" required placeholder="Ex.: Poupador iniciante">
                        </label>

                        <label class="cq-campo">
                            <span>Descrição <small>(opcional)</small></span>
                            <input id="cqDesc" maxlength="200" placeholder="Se ficar vazia, usamos o texto da condição">
                        </label>

                        <fieldset class="cq-campo cq-icone">
                            <legend>Ícone</legend>

                            <div class="cq-abas" role="tablist" aria-label="Tipo de ícone">
                                <button type="button" role="tab" class="cq-aba" data-cq-modo="emoji">😀 Emoji</button>
                                <button type="button" role="tab" class="cq-aba" data-cq-modo="imagem">🖼️ Imagem</button>
                            </div>

                            <div class="cq-painel" data-cq-painel="emoji">
                                <input id="cqEmoji" maxlength="16" placeholder="Digite ou escolha abaixo" aria-label="Emoji do ícone">
                                <div class="cq-emojis" role="group" aria-label="Sugestões de emoji">
                                    ${EMOJIS.map(e => `<button type="button" class="cq-emoji" data-cq-emoji="${e}" aria-label="Usar ${e}">${e}</button>`).join('')}
                                </div>
                            </div>

                            <div class="cq-painel" data-cq-painel="imagem" hidden>
                                <label class="cq-upload">
                                    <input type="file" id="cqArquivo" accept="image/png,image/jpeg,image/webp">
                                    <span class="cq-upload__ico" id="cqUploadIco">⬆️</span>
                                    <span><b>Escolher imagem</b><small>PNG, JPG ou WebP · fica com 128×128 (PNG transparente fica melhor)</small></span>
                                </label>
                            </div>
                        </fieldset>

                        <div class="cq-linha">
                            <label class="cq-campo">
                                <span>Condição</span>
                                <select id="cqCond">${opcoesCondicao}</select>
                            </label>

                            <label class="cq-campo" id="cqValorBox">
                                <span>Quantidade <small id="cqUnidade"></small></span>
                                <input id="cqValor" type="number" min="1" max="1000000" step="1" value="1">
                            </label>

                            <label class="cq-campo" id="cqTrilhaBox" hidden>
                                <span>Trilha</span>
                                <select id="cqTrilha">
                                    ${opcoesTrilha || '<option value="">Nenhuma trilha cadastrada</option>'}
                                </select>
                            </label>
                        </div>

                        <label class="cq-check">
                            <input type="checkbox" id="cqAtiva" checked>
                            <span>Disponível para os alunos</span>
                        </label>

                        <p class="cq-erro" id="cqErro" role="alert"></p>

                        <div class="cq-acoes">
                            <button type="button" class="btn sec" id="cqCancelar" hidden>Cancelar edição</button>
                            <button type="submit" class="btn" id="cqSalvar">Criar conquista</button>
                        </div>
                    </form>

                    <!-- [CQ-PREVIA] -->
                    <aside class="card cq-previa" aria-label="Prévia">
                        <h3>Como o aluno vê</h3>

                        <div class="cq-medalha" id="cqPrevia">
                            <span class="cq-medalha__brilho" aria-hidden="true"></span>
                            <span class="cq-ico cq-ico--grande" id="cqPreviaIco">🏆</span>
                            <b id="cqPreviaNome">Nome da conquista</b>
                            <small id="cqPreviaDesc">Conclua 1 lição</small>
                        </div>

                        <div class="cq-estados">
                            <div class="cq-mini">
                                <span class="cq-ico" id="cqPreviaGanha">🏆</span>
                                <small>Ganha</small>
                            </div>
                            <div class="cq-mini is-off">
                                <span class="cq-ico" id="cqPreviaBloq">🏆</span>
                                <small>Ainda bloqueada</small>
                            </div>
                        </div>
                    </aside>
                </div>

                <!-- [CQ-LISTA] -->
                <section class="card cq-lista">
                    <h3>Conquistas criadas</h3>
                    <div class="cq-itens">
                        ${dados.custom.length ? dados.custom.map(itemHtml).join('') : `
                            <p class="mut cq-vazio">Nenhuma conquista criada ainda. Use o formulário acima para criar a primeira.</p>
                        `}
                    </div>
                </section>

                <details class="card cq-lista cq-padrao">
                    <summary><h3>Conquistas padrão do sistema</h3><small class="mut">fixas no servidor, não podem ser editadas</small></summary>
                    <div class="cq-itens cq-itens--compacto">
                        ${dados.builtin.map(b => `
                            <article class="cq-item">
                                ${iconeHtml(b.icon)}
                                <div class="cq-item__txt">
                                    <b>${esc(b.name)}</b>
                                    <small>${esc(b.desc)}</small>
                                </div>
                                <span class="cq-ganhos">${Number(b.earned)} aluno(s)</span>
                            </article>
                        `).join('')}
                    </div>
                </details>
            </div>
        `;

        ligar();
        preencherForm(editando);
    }

    function itemHtml(b) {
        return `
            <article class="cq-item${b.active ? '' : ' is-inativa'}">
                ${iconeHtml(b.icon)}
                <div class="cq-item__txt">
                    <b>${esc(b.name)}</b>
                    <small>${esc(b.desc)}</small>
                    <span class="cq-item__meta">
                        <span class="cq-chip ${b.active ? 'is-ok' : 'is-off'}">${b.active ? 'Ativa' : 'Inativa'}</span>
                        <span class="cq-ganhos">${Number(b.earned)} aluno(s) ganharam</span>
                    </span>
                </div>
                <div class="cq-item__acoes">
                    <button type="button" class="btn sm sec" data-cq-editar="${Number(b.id)}">Editar</button>
                    <button type="button" class="btn sm sec" data-cq-alternar="${Number(b.id)}">${b.active ? 'Desativar' : 'Ativar'}</button>
                    <button type="button" class="btn sm red" data-cq-excluir="${Number(b.id)}">Excluir</button>
                </div>
            </article>
        `;
    }


    /* ============================================================
       FORMULÁRIO
       ============================================================ */

    const el = id => document.getElementById(id);

    function trocarModo(modo) {
        modoIcone = modo;

        document.querySelectorAll('[data-cq-modo]').forEach(b => {
            const on = b.dataset.cqModo === modo;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });

        document.querySelectorAll('[data-cq-painel]').forEach(p => {
            p.hidden = p.dataset.cqPainel !== modo;
        });

        atualizarPrevia();
    }

    function iconeAtual() {
        if (modoIcone === 'imagem') {
            return imagemNova || (editando && editando.icon_is_image ? editando.icon : '');
        }

        return el('cqEmoji').value.trim();
    }

    function atualizarPrevia() {
        const cond = el('cqCond').value;
        const meta = dados.conditions.find(c => c.id === cond);
        const comTrilha = !!(meta && meta.track);
        const valor = Math.max(1, Number(el('cqValor').value) || 1);
        const trilha = el('cqTrilha');
        const tituloTrilha = trilha.selectedOptions[0] ? trilha.selectedOptions[0].textContent : '';

        el('cqValorBox').hidden = comTrilha;
        el('cqTrilhaBox').hidden = !comTrilha;
        el('cqUnidade').textContent = UNIDADE[cond] ? '(' + UNIDADE[cond] + ')' : '';

        const icone = iconeAtual() || '🏆';
        const nome = el('cqNome').value.trim() || 'Nome da conquista';
        const desc = el('cqDesc').value.trim() || (TEXTO[cond] ? TEXTO[cond](valor, tituloTrilha) : '');

        ['cqPreviaIco', 'cqPreviaGanha', 'cqPreviaBloq'].forEach(id => {
            el(id).innerHTML = ehImagem(icone) ? `<img src="${esc(icone)}" alt="">` : esc(icone);
        });

        el('cqPreviaNome').textContent = nome;
        el('cqPreviaDesc').textContent = desc;
        el('cqDesc').placeholder = TEXTO[cond] ? 'Automática: ' + TEXTO[cond](valor, tituloTrilha) : '';

        document.querySelectorAll('[data-cq-emoji]').forEach(b => {
            b.classList.toggle('is-on', modoIcone === 'emoji' && b.dataset.cqEmoji === el('cqEmoji').value.trim());
        });

        const upIco = el('cqUploadIco');
        if (upIco) {
            const img = modoIcone === 'imagem' && iconeAtual();
            upIco.innerHTML = img ? `<img src="${esc(img)}" alt="">` : '⬆️';
        }
    }

    function preencherForm(b) {
        el('cqFormTitulo').textContent = b ? 'Editar conquista' : 'Nova conquista';
        el('cqSalvar').textContent = b ? 'Salvar alterações' : 'Criar conquista';
        el('cqCancelar').hidden = !b;
        el('cqErro').textContent = '';

        el('cqNome').value = b ? b.name : '';
        el('cqDesc').value = b ? b.description : '';
        el('cqEmoji').value = b && !b.icon_is_image ? b.emoji : '🏆';
        el('cqCond').value = b ? b.condition_type : (dados.conditions[0] && dados.conditions[0].id) || 'licoes';
        el('cqValor').value = b ? b.condition_value : 1;
        if (b && b.track_id) el('cqTrilha').value = String(b.track_id);
        el('cqAtiva').checked = b ? b.active : true;

        imagemNova = null;
        el('cqArquivo').value = '';
        trocarModo(b && b.icon_is_image ? 'imagem' : 'emoji');
    }

    async function salvar(e) {
        e.preventDefault();

        const erro = el('cqErro');
        const btn = el('cqSalvar');
        const cond = el('cqCond').value;
        const meta = dados.conditions.find(c => c.id === cond);

        erro.textContent = '';

        const corpo = {
            name: el('cqNome').value.trim(),
            description: el('cqDesc').value.trim(),
            condition_type: cond,
            condition_value: Number(el('cqValor').value),
            active: el('cqAtiva').checked
        };

        if (meta && meta.track) corpo.track_id = Number(el('cqTrilha').value);

        if (modoIcone === 'imagem') {
            if (imagemNova) corpo.icon_data = imagemNova;
            else if (!(editando && editando.icon_is_image)) {
                erro.textContent = 'Escolha uma imagem para o ícone (ou use um emoji).';
                return;
            }
        } else {
            corpo.icon = el('cqEmoji').value.trim();
        }

        if (!corpo.name) {
            erro.textContent = 'Dê um nome para a conquista.';
            el('cqNome').focus();
            return;
        }

        btn.disabled = true;

        const eraEdicao = !!editando;

        try {
            if (editando) {
                await api('/admin/badges/' + editando.id, 'PUT', corpo);
            } else {
                await api('/admin/badges', 'POST', corpo);
            }

            await conquistasView();
            aviso(eraEdicao ? 'Conquista atualizada.' : 'Conquista criada! Ela já vale para os alunos.');
        } catch (err) {
            erro.textContent = (err && err.message) || 'Não foi possível salvar a conquista.';
            btn.disabled = false;
        }
    }

    function aviso(texto) {
        const lista = document.querySelector('.cq-lista h3');
        if (!lista) return;

        const p = document.createElement('p');
        p.className = 'cq-aviso';
        p.setAttribute('role', 'status');
        p.textContent = texto;
        lista.after(p);
        setTimeout(() => p.remove(), 3500);
    }

    function ligar() {
        const form = el('cqForm');

        form.addEventListener('submit', salvar);
        form.addEventListener('input', atualizarPrevia);
        form.addEventListener('change', atualizarPrevia);

        el('cqCancelar').onclick = () => {
            editando = null;
            preencherForm(null);
        };

        document.querySelectorAll('[data-cq-modo]').forEach(b => {
            b.onclick = () => trocarModo(b.dataset.cqModo);
        });

        document.querySelectorAll('[data-cq-emoji]').forEach(b => {
            b.onclick = () => {
                el('cqEmoji').value = b.dataset.cqEmoji;
                atualizarPrevia();
            };
        });

        el('cqArquivo').addEventListener('change', async e => {
            const arquivo = e.target.files && e.target.files[0];
            el('cqErro').textContent = '';

            if (!arquivo) return;

            try {
                imagemNova = await reduzirImagem(arquivo);
            } catch (err) {
                imagemNova = null;
                e.target.value = '';
                el('cqErro').textContent = err.message;
            }

            atualizarPrevia();
        });

        document.querySelector('.cq').addEventListener('click', async e => {
            const editar = e.target.closest('[data-cq-editar]');
            const alternar = e.target.closest('[data-cq-alternar]');
            const excluir = e.target.closest('[data-cq-excluir]');
            const achar = id => dados.custom.find(b => b.id === Number(id));

            if (editar) {
                editando = achar(editar.dataset.cqEditar) || null;
                preencherForm(editando);
                el('cqForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
                el('cqNome').focus({ preventScroll: true });
            }

            if (alternar) {
                const b = achar(alternar.dataset.cqAlternar);
                if (!b) return;
                alternar.disabled = true;
                try {
                    await api('/admin/badges/' + b.id, 'PUT', { active: !b.active });
                    await conquistasView();
                } catch (err) {
                    alternar.disabled = false;
                    alert((err && err.message) || 'Não foi possível mudar a conquista.');
                }
            }

            if (excluir) {
                const b = achar(excluir.dataset.cqExcluir);
                if (!b) return;

                const msg = b.earned
                    ? `Excluir "${b.name}"? ${b.earned} aluno(s) já ganharam e vão perdê-la. Isso não pode ser desfeito.\n\nDica: "Desativar" esconde dos novos alunos sem tirar de quem já ganhou.`
                    : `Excluir "${b.name}"? Isso não pode ser desfeito.`;

                if (!confirm(msg)) return;

                excluir.disabled = true;
                try {
                    await api('/admin/badges/' + b.id, 'DELETE');
                    await conquistasView();
                } catch (err) {
                    excluir.disabled = false;
                    alert((err && err.message) || 'Não foi possível excluir a conquista.');
                }
            }
        });
    }


    /* ============================================================
       BOTÃO DO MENU
       ============================================================ */

    const abrir = () => conquistasView().catch(err => {
        alert((err && err.message) || 'Não foi possível carregar as conquistas.');
    });

    botao.onclick = typeof comCarregando === 'function'
        ? comCarregando('Carregando conquistas…', abrir)
        : abrir;

    window.conquistasView = conquistasView;
})();
