/* ============================================================
   DRAGNIX — js/admin-regras.js  (TELA "REGRAS DE NEGÓCIO")
   ============================================================

   Área do admin.html (botão #t6, SÓ ADMINISTRADORES) onde se define
   como o Dragnix recompensa os alunos. Abas:

     [RN-NIVEIS]   XP mínimo e nome de cada nível (ex.: Nível 4 —
                   Dragão estudioso), gerador de curva, simulador e
                   quantos alunos estão em cada nível
     [RN-XP]       XP padrão de módulo, XP por acerto, bônus de lição
                   perfeita, % ao refazer; moedas por módulo e missão
     [RN-VIDAS]    vidas (máximo, tempo para recuperar, custo) e metas
                   das missões diárias
     Conquistas    (js/admin-conquistas.js, desenhado aqui dentro)
     Avatares      (js/admin.js → avatarsView, desenhado aqui dentro)

   As três primeiras abas são salvas juntas no botão "Salvar regras"
   (PUT /api/admin/regras). Conquistas e avatares salvam sozinhos.

   Endereços: admin.html#regras, #conquistas e #avatares.
   Precisa vir DEPOIS do js/admin.js ($, api, esc, comCarregando).
   ============================================================ */

(function () {
    'use strict';

    const botao = document.getElementById('t6');
    if (!botao) return;

    if (typeof me !== 'function' || me()?.role !== 'adm') {
        botao.hidden = true;
        return;
    }

    const ABAS = [
        ['niveis', 'Níveis'],
        ['xp', 'XP e moedas'],
        ['vidas', 'Vidas e missões'],
        ['conquistas', 'Conquistas'],
        ['avatares', 'Avatares']
    ];

    const ABAS_DE_REGRA = ['niveis', 'xp', 'vidas'];

    let dados = null;          // resposta do servidor
    let rascunho = null;       // regras sendo editadas
    let aba = 'niveis';
    let abaPedida = null;
    let alterado = false;

    const copia = o => JSON.parse(JSON.stringify(o));
    const num = v => Number(v || 0).toLocaleString('pt-BR');
    const el = id => document.getElementById(id);

    /* nível de um XP com as regras do rascunho */
    const nivelDe = xp => {
        let n = 1;
        rascunho.niveis.forEach((l, i) => { if (xp >= Number(l.xp)) n = i + 1; });
        return n;
    };

    function marcarAlterado() {
        alterado = true;
        const barra = el('rnBarra');
        if (barra) barra.hidden = false;
    }

    /* ============================================================
       ESTRUTURA
       ============================================================ */

    async function regrasView(abaInicial) {
        dados = await api('/admin/regras');
        rascunho = copia(dados.regras);
        alterado = false;
        if (abaInicial) aba = abaInicial;
        desenhar();
    }

    function desenhar() {
        const quando = dados.atualizado_em
            ? 'Salvas em ' + new Date(dados.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
            : 'Usando os valores padrão do sistema';

        $('main').innerHTML = `
            <div class="rn">
                <div class="rn-topo">
                    <p class="mut">Defina como o Dragnix recompensa os alunos. Ao salvar, as regras valem na hora para todos.</p>
                    <span class="rn-quando">${esc(quando)}</span>
                    <button type="button" class="btn sm sec" id="rnRestaurar">Restaurar padrão</button>
                </div>

                <div class="rn-abas" role="tablist" aria-label="Regras de negócio">
                    ${ABAS.map(([id, nome]) => `
                        <button type="button" role="tab" class="rn-aba${id === aba ? ' is-on' : ''}"
                                aria-selected="${id === aba}" data-rn-aba="${id}">${nome}</button>
                    `).join('')}
                </div>

                <div id="rnAlvo" class="rn-conteudo"></div>

                <div class="rn-barra" id="rnBarra" ${alterado ? '' : 'hidden'}>
                    <span>${ic('info')} Há alterações não salvas nas regras.</span>
                    <div class="rn-barra__acoes">
                        <button type="button" class="btn sec" id="rnDescartar">Descartar</button>
                        <button type="button" class="btn" id="rnSalvar">Salvar regras</button>
                    </div>
                </div>
                <p class="rn-erro" id="rnErro" role="alert"></p>
            </div>
        `;

        document.querySelectorAll('[data-rn-aba]').forEach(b => {
            b.onclick = () => abrirAba(b.dataset.rnAba);
        });

        el('rnSalvar').onclick = salvar;
        el('rnDescartar').onclick = () => {
            rascunho = copia(dados.regras);
            alterado = false;
            el('rnBarra').hidden = true;
            abrirAba(aba);
        };

        abrirAba(aba);
    }

    const ic = nome => (typeof window.icon === 'function' ? window.icon(nome) : '');

    function abrirAba(id) {
        aba = id;

        document.querySelectorAll('[data-rn-aba]').forEach(b => {
            const on = b.dataset.rnAba === id;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-selected', String(on));
        });

        const alvo = el('rnAlvo');
        el('rnErro').textContent = '';

        if (id === 'conquistas') {
            alvo.innerHTML = window.dgxCarregando ? window.dgxCarregando.html('Carregando conquistas…') : '';
            if (typeof window.conquistasView === 'function') window.conquistasView();
            return;
        }

        if (id === 'avatares') {
            alvo.innerHTML = window.dgxCarregando ? window.dgxCarregando.html('Carregando avatares…') : '';
            if (typeof avatarsView === 'function') avatarsView();
            return;
        }

        if (id === 'niveis') desenharNiveis(alvo);
        if (id === 'xp') desenharXp(alvo);
        if (id === 'vidas') desenharVidas(alvo);
    }

    /* campo numérico ligado ao rascunho: caminho tipo "xp.por_acerto" */
    function campo(caminho, rotulo, ajuda, opcoes = {}) {
        const partes = caminho.split('.');
        let v = rascunho;
        partes.forEach(p => { v = v?.[p]; });

        return `
            <label class="rn-campo">
                <span class="rn-campo__rotulo">${rotulo}</span>
                <span class="rn-campo__linha">
                    <input type="number" min="${opcoes.min ?? 0}" max="${opcoes.max ?? 100000}" step="1"
                           value="${esc(v)}" data-rn-campo="${caminho}">
                    ${opcoes.unidade ? `<span class="rn-unidade">${opcoes.unidade}</span>` : ''}
                </span>
                ${ajuda ? `<small>${ajuda}</small>` : ''}
            </label>
        `;
    }

    function ligarCampos(alvo, aoMudar) {
        alvo.querySelectorAll('[data-rn-campo]').forEach(inp => {
            inp.addEventListener('input', () => {
                const partes = inp.dataset.rnCampo.split('.');
                let o = rascunho;
                partes.slice(0, -1).forEach(p => { o = o[p]; });
                const chave = partes[partes.length - 1];
                const valor = inp.value === '' ? '' : Number(inp.value);
                if (Array.isArray(o)) o[Number(chave)] = valor; else o[chave] = valor;
                marcarAlterado();
                if (aoMudar) aoMudar();
            });
        });
    }

    /* ============================================================
       [RN-NIVEIS]
       ============================================================ */

    function desenharNiveis(alvo) {
        const alunos = Array.isArray(dados.alunos_xp) ? dados.alunos_xp : [];
        const porNivel = rascunho.niveis.map(() => 0);
        alunos.forEach(xp => { porNivel[nivelDe(xp) - 1] += 1; });
        const maior = Math.max(1, ...porNivel);

        alvo.innerHTML = `
            <section class="card rn-card">
                <h3>${ic('trending-up')} Níveis</h3>
                <p class="mut">Quanto XP total o aluno precisa para chegar a cada nível e o nome que ele ganha. O nível 1 sempre começa em 0 XP.</p>

                <div class="rn-curva">
                    <span>Gerar automaticamente:</span>
                    <label>Nº de níveis <input type="number" id="rnQtd" min="2" max="50" value="${rascunho.niveis.length}"></label>
                    <label>XP base <input type="number" id="rnBase" min="1" max="100000" value="40"></label>
                    <button type="button" class="btn sm sec" id="rnGerar">Gerar curva</button>
                    <small class="mut">Nível N precisa de (N − 1)² × base XP. Os nomes são mantidos.</small>
                </div>

                <div class="rn-tabela" role="table" aria-label="Níveis">
                    <div class="rn-tabela__cab" role="row">
                        <span role="columnheader">Nível</span>
                        <span role="columnheader">XP mínimo</span>
                        <span role="columnheader">Nome do nível</span>
                        <span role="columnheader">Alunos</span>
                        <span role="columnheader"><span class="rn-sr">Remover</span></span>
                    </div>
                    ${rascunho.niveis.map((n, i) => `
                        <div class="rn-tabela__linha" role="row">
                            <b role="cell">${i + 1}</b>
                            <span role="cell">
                                <input type="number" min="0" step="1" value="${esc(n.xp)}" data-rn-nivel-xp="${i}"
                                       aria-label="XP mínimo do nível ${i + 1}" ${i === 0 ? 'readonly title="O nível 1 começa em 0 XP"' : ''}>
                            </span>
                            <span role="cell">
                                <input type="text" maxlength="40" value="${esc(n.nome)}" data-rn-nivel-nome="${i}"
                                       aria-label="Nome do nível ${i + 1}">
                            </span>
                            <span role="cell" class="rn-alunos">
                                <span class="rn-alunos__barra"><span style="width:${(porNivel[i] / maior) * 100}%"></span></span>
                                ${num(porNivel[i])}
                            </span>
                            <span role="cell">
                                ${i === 0 ? '' : `<button type="button" class="btn sm red" data-rn-remover="${i}" aria-label="Remover nível ${i + 1}">✕</button>`}
                            </span>
                        </div>
                    `).join('')}
                </div>

                <button type="button" class="btn sm sec" id="rnAdd">+ Adicionar nível</button>
            </section>

            <section class="card rn-card rn-simulador">
                <h3>${ic('calculator')} Simulador</h3>
                <label class="rn-campo">
                    <span class="rn-campo__rotulo">Um aluno com</span>
                    <span class="rn-campo__linha"><input type="number" id="rnSimXp" min="0" value="500"><span class="rn-unidade">XP</span></span>
                </label>
                <p id="rnSimRes" class="rn-sim-res"></p>
            </section>
        `;

        const simular = () => {
            const xp = Math.max(0, Number(el('rnSimXp').value) || 0);
            const n = nivelDe(xp);
            const prox = rascunho.niveis[n];
            el('rnSimRes').innerHTML = `fica no <b>nível ${n} — ${esc(rascunho.niveis[n - 1].nome)}</b>` +
                (prox ? `. Faltam <b>${num(Number(prox.xp) - xp)} XP</b> para o nível ${n + 1} (${esc(prox.nome)}).` : '. É o nível máximo.');
        };

        alvo.querySelectorAll('[data-rn-nivel-xp]').forEach(inp => inp.addEventListener('input', () => {
            rascunho.niveis[Number(inp.dataset.rnNivelXp)].xp = inp.value === '' ? '' : Number(inp.value);
            marcarAlterado(); simular();
        }));

        alvo.querySelectorAll('[data-rn-nivel-nome]').forEach(inp => inp.addEventListener('input', () => {
            rascunho.niveis[Number(inp.dataset.rnNivelNome)].nome = inp.value;
            marcarAlterado(); simular();
        }));

        alvo.querySelectorAll('[data-rn-remover]').forEach(b => b.addEventListener('click', () => {
            if (rascunho.niveis.length <= 2) return;
            rascunho.niveis.splice(Number(b.dataset.rnRemover), 1);
            marcarAlterado(); desenharNiveis(alvo);
        }));

        el('rnAdd').onclick = () => {
            const lista = rascunho.niveis;
            const ult = Number(lista[lista.length - 1].xp) || 0;
            const pen = Number(lista[lista.length - 2]?.xp) || 0;
            lista.push({ xp: ult + Math.max(50, ult - pen), nome: `Nível ${lista.length + 1}` });
            marcarAlterado(); desenharNiveis(alvo);
        };

        el('rnGerar').onclick = () => {
            const qtd = Math.max(2, Math.min(50, Number(el('rnQtd').value) || rascunho.niveis.length));
            const base = Math.max(1, Number(el('rnBase').value) || 40);
            const nomes = rascunho.niveis.map(n => n.nome);
            const padrao = dados.padrao.niveis.map(n => n.nome);
            rascunho.niveis = Array.from({ length: qtd }, (_, i) => ({
                xp: i * i * base,
                nome: nomes[i] || padrao[i] || `Nível ${i + 1}`
            }));
            marcarAlterado(); desenharNiveis(alvo);
        };

        el('rnSimXp').addEventListener('input', simular);
        simular();
    }

    /* ============================================================
       [RN-XP] — XP e moedas
       ============================================================ */

    function desenharXp(alvo) {
        alvo.innerHTML = `
            <section class="card rn-card">
                <h3>${ic('star')} XP dos módulos</h3>
                <div class="rn-grade">
                    ${campo('xp.modulo_padrao', 'XP padrão de um módulo novo', 'Cada trilha pode ter o próprio valor, definido no formulário da trilha.', { unidade: 'XP' })}
                    ${campo('xp.por_acerto', 'XP por questão certa', 'Somado ao XP do módulo.', { unidade: 'XP' })}
                    ${campo('xp.bonus_perfeito', 'Bônus por lição perfeita', 'Quando o aluno termina sem errar.', { unidade: 'XP' })}
                </div>

                <h4>Ao refazer um módulo já concluído</h4>
                <div class="rn-grade">
                    ${campo('xp.repeticao.0', '2ª conclusão', 'Porcentagem do XP normal.', { unidade: '%', max: 100 })}
                    ${campo('xp.repeticao.1', '3ª conclusão', '', { unidade: '%', max: 100 })}
                    ${campo('xp.repeticao.2', '4ª em diante', '', { unidade: '%', max: 100 })}
                </div>
            </section>

            <section class="card rn-card">
                <h3>${ic('coins')} Moedas</h3>
                <div class="rn-grade">
                    ${campo('moedas.por_modulo', 'Moedas por módulo concluído', 'Só na primeira conclusão.', { unidade: 'moedas' })}
                    ${campo('moedas.bonus_perfeito', 'Bônus por lição perfeita', '', { unidade: 'moedas' })}
                    ${campo('moedas.missao', 'Prêmio de cada missão diária', 'Ao resgatar a missão concluída.', { unidade: 'moedas' })}
                </div>
            </section>

            <section class="card rn-card rn-exemplo" aria-live="polite">
                <h3>${ic('lightbulb')} Exemplo</h3>
                <p id="rnExemplo"></p>
            </section>
        `;

        const exemplo = () => {
            const x = rascunho.xp, m = rascunho.moedas;
            const base = Number(x.modulo_padrao) || 0;
            const total = base + 5 * (Number(x.por_acerto) || 0) + (Number(x.bonus_perfeito) || 0);
            const rep = Math.floor(total * (Number(x.repeticao[0]) || 0) / 100);
            el('rnExemplo').innerHTML =
                `Um módulo de <b>${num(base)} XP</b> com 5 questões, todas certas, dá <b>${num(total)} XP</b> e ` +
                `<b>${num((Number(m.por_modulo) || 0) + (Number(m.bonus_perfeito) || 0))} moedas</b> na 1ª vez. ` +
                `Refazendo, dá <b>${num(rep)} XP</b> e nenhuma moeda.`;
        };

        ligarCampos(alvo, exemplo);
        exemplo();
    }

    /* ============================================================
       [RN-VIDAS] — vidas e missões diárias
       ============================================================ */

    function desenharVidas(alvo) {
        alvo.innerHTML = `
            <section class="card rn-card">
                <h3>${ic('heart')} Vidas</h3>
                <p class="mut">O aluno perde uma vida a cada resposta errada. Sem vidas, ele não começa módulos novos até recuperar.</p>
                <div class="rn-grade">
                    ${campo('vidas.maximo', 'Máximo de vidas', '', { min: 1, max: 99, unidade: 'vidas' })}
                    ${campo('vidas.minutos_recarga', 'Tempo para recuperar 1 vida', '', { min: 1, max: 1440, unidade: 'min' })}
                    ${campo('vidas.custo_recarga', 'Custo para encher as vidas', 'Na loja do perfil.', { unidade: 'moedas' })}
                </div>
            </section>

            <section class="card rn-card">
                <h3>${ic('target')} Missões diárias</h3>
                <p class="mut">Metas do dia. Ao concluir, o aluno resgata as moedas definidas na aba "XP e moedas".</p>
                <div class="rn-grade">
                    ${campo('missoes.licoes', 'Lições concluídas', '', { min: 1, max: 100, unidade: 'lições' })}
                    ${campo('missoes.acertos', 'Questões certas', '', { min: 1, max: 1000, unidade: 'acertos' })}
                    ${campo('missoes.xp', 'XP ganho no dia', '', { min: 1, unidade: 'XP' })}
                </div>
            </section>

            <section class="card rn-card rn-exemplo" aria-live="polite">
                <h3>${ic('lightbulb')} Como fica</h3>
                <p id="rnExemploVidas"></p>
            </section>
        `;

        const exemplo = () => {
            const v = rascunho.vidas, m = rascunho.missoes;
            const horas = (Number(v.maximo) || 0) * (Number(v.minutos_recarga) || 0) / 60;
            el('rnExemploVidas').innerHTML =
                `Sem vidas, o aluno volta a ter todas em <b>${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h</b> ` +
                `ou na hora, por <b>${num(v.custo_recarga)} moedas</b>. ` +
                `Missões de hoje: concluir ${num(m.licoes)} lição(ões), acertar ${num(m.acertos)} questões e ganhar ${num(m.xp)} XP.`;
        };

        ligarCampos(alvo, exemplo);
        exemplo();
    }

    /* ============================================================
       SALVAR
       ============================================================ */

    async function salvar() {
        const b = el('rnSalvar');
        el('rnErro').textContent = '';
        b.disabled = true;

        try {
            const r = await api('/admin/regras', 'PUT', { regras: rascunho });
            dados.regras = r.regras;
            dados.atualizado_em = new Date().toISOString();
            rascunho = copia(r.regras);
            alterado = false;
            desenhar();
            if (window.dgxAviso) window.dgxAviso('Regras salvas. Já valem para todos os alunos.', 'ok');
        } catch (e) {
            el('rnErro').textContent = (e && e.message) || 'Não foi possível salvar as regras.';
            b.disabled = false;
        }
    }

    /* botão "Restaurar padrão" no topo das abas de regra */
    document.addEventListener('click', e => {
        if (!e.target.closest('#rnRestaurar')) return;
        if (!confirm('Voltar todas as regras (níveis, XP, moedas, vidas e missões) para os valores padrão? Você ainda precisa clicar em "Salvar regras".')) return;
        rascunho = copia(dados.padrao);
        marcarAlterado();
        abrirAba(ABAS_DE_REGRA.includes(aba) ? aba : 'niveis');
    });

    /* ============================================================
       BOTÃO DO MENU E ENDEREÇOS
       ============================================================ */

    const abrir = () => regrasView(abaPedida).catch(err => {
        alert((err && err.message) || 'Não foi possível carregar as regras.');
    }).finally(() => { abaPedida = null; });

    botao.onclick = typeof comCarregando === 'function'
        ? comCarregando('Carregando regras de negócio…', abrir)
        : abrir;

    // admin.js usa isto para #regras, #conquistas e #avatares
    window.abrirRegras = abaInicial => {
        abaPedida = abaInicial || null;
        botao.click();
    };
})();
