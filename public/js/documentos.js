/* ============================================================
   DRAGNIX — js/documentos.js  (POLÍTICA DE PRIVACIDADE E TERMOS DE USO)
   ============================================================

   Os links "Política de privacidade" e "Termos de uso" do rodapé abrem
   um card (janela), no mesmo estilo do "Quem somos" (css/quem-somos.css).
   Também abrem pelo endereço: #politica-de-privacidade e #termos-de-uso.

     [DOC-TEXTOS]  textos dos dois documentos (edite aqui)
     [DOC-CARD]    monta a janela (<dialog>)
     [DOC-LINKS]   liga os links do rodapé e do cadastro (data-doc)

   Para abrir por código ou comando de voz:
     window.dgxDocumentos.abrir('privacidade' | 'termos')

   Observação: textos baseados na LGPD (Lei nº 13.709/2018), no formato
   usado pela maioria dos sites. Por ser um projeto acadêmico (TCC), é
   bom que o orientador ou um profissional da área revise antes de uso
   comercial.
   ============================================================ */

(() => {
    'use strict';
    if (window.dgxDocumentos) return;

    /* o visual é o mesmo do "Quem somos" */
    if (!document.querySelector('link[href^="css/quem-somos.css"]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'css/quem-somos.css';
        document.head.appendChild(css);
    }

    const ATUALIZADO = '18 de novembro de 2026';
    const CONTATO = '<a href="mailto:suporte@dragnix.com">suporte@dragnix.com</a>';

    /* ============================================================
       [DOC-TEXTOS]
       ============================================================ */

    const DOCUMENTOS = {
        privacidade: {
            hash: 'politica-de-privacidade',
            selo: 'LGPD · Lei nº 13.709/2018',
            titulo: 'Política de privacidade',
            resumo: 'Como a Dragnix coleta, usa, guarda e protege os seus dados pessoais.',
            secoes: [
                ['1. Quem somos', `
                    <p>A Dragnix é uma plataforma de educação financeira desenvolvida como projeto acadêmico (TCC).
                    A equipe Dragnix é a <b>controladora</b> dos dados pessoais tratados na plataforma, nos termos da
                    Lei Geral de Proteção de Dados (LGPD).</p>`],
                ['2. Dados que coletamos', `
                    <ul>
                        <li><b>Cadastro:</b> nome, e-mail e senha (guardada de forma criptografada, nunca em texto puro).</li>
                        <li><b>Perfil:</b> foto ou avatar, se você escolher um.</li>
                        <li><b>Uso da plataforma:</b> progresso nas trilhas, respostas, XP, moedas, conquistas, avaliações e dúvidas enviadas.</li>
                        <li><b>Controle financeiro:</b> receitas e gastos que você mesmo registrar.</li>
                        <li><b>Perguntas ao Nix:</b> o texto das perguntas feitas ao assistente com IA.</li>
                        <li><b>Dados técnicos:</b> informações básicas de acesso necessárias para segurança, como tentativas de login.</li>
                    </ul>
                    <p>Não coletamos dados bancários, documentos (como CPF) nem dados sensíveis.</p>`],
                ['3. Para que usamos', `
                    <ul>
                        <li>Criar e manter sua conta e permitir o login.</li>
                        <li>Mostrar seu progresso, ranking, conquistas e missões.</li>
                        <li>Responder suas dúvidas (professores e o assistente Nix).</li>
                        <li>Enviar e-mails necessários, como o código de recuperação de senha.</li>
                        <li>Manter a segurança da plataforma e melhorar o conteúdo.</li>
                    </ul>
                    <p>Não vendemos seus dados e não usamos para publicidade.</p>`],
                ['4. Base legal', `
                    <p>Tratamos os dados para a <b>execução do serviço</b> que você solicitou ao se cadastrar
                    (art. 7º, V da LGPD), com o seu <b>consentimento</b> quando necessário (art. 7º, I) e por
                    <b>legítimo interesse</b> para a segurança da plataforma (art. 7º, IX).</p>`],
                ['5. Compartilhamento', `
                    <p>Seus dados só são compartilhados com serviços necessários para a plataforma funcionar,
                    que também devem protegê-los:</p>
                    <ul>
                        <li>hospedagem do site e banco de dados;</li>
                        <li>serviço de envio de e-mails (recuperação de senha);</li>
                        <li>serviço de inteligência artificial que gera as respostas do Nix (recebe apenas o texto da pergunta e da conversa, sem seu nome ou e-mail).</li>
                    </ul>
                    <p>O seu nome, foto, nível e XP aparecem para outros alunos no <b>ranking</b>. Dúvidas enviadas
                    ao fórum ficam visíveis para professores e administradores.</p>`],
                ['6. Cookies e armazenamento no navegador', `
                    <p>Usamos o armazenamento do seu navegador apenas para manter você conectado e guardar
                    preferências (como o tema claro/escuro e a conversa com o Nix). Não usamos cookies de
                    publicidade nem de rastreamento.</p>`],
                ['7. Por quanto tempo guardamos', `
                    <p>Os dados ficam guardados enquanto sua conta existir. Se a conta for excluída, os dados
                    ligados a ela são apagados, exceto quando a lei exigir que sejam mantidos.</p>`],
                ['8. Segurança', `
                    <p>Adotamos medidas como senhas criptografadas, conexão segura (HTTPS), controle de acesso
                    por perfil e cópias de segurança protegidas. Nenhum sistema é 100% seguro; se ocorrer algum
                    incidente relevante, os usuários afetados serão avisados.</p>`],
                ['9. Menores de idade', `
                    <p>A Dragnix é voltada a jovens. Se você tem menos de 18 anos, use a plataforma com o
                    conhecimento de um responsável. Menores de 12 anos só podem usar com o consentimento de
                    um dos pais ou responsável legal (art. 14 da LGPD).</p>`],
                ['10. Seus direitos', `
                    <p>Pela LGPD (art. 18), você pode, a qualquer momento:</p>
                    <ul>
                        <li>confirmar se tratamos seus dados e ter acesso a eles;</li>
                        <li>corrigir dados incompletos ou desatualizados (nome e foto podem ser alterados no seu Perfil);</li>
                        <li>pedir a exclusão da conta e dos dados;</li>
                        <li>revogar o consentimento e pedir informações sobre o compartilhamento.</li>
                    </ul>
                    <p>Para isso, escreva para ${CONTATO}.</p>`],
                ['11. Alterações e contato', `
                    <p>Esta política pode ser atualizada. Mudanças importantes serão avisadas na plataforma.
                    Dúvidas sobre privacidade: ${CONTATO}.</p>`]
            ]
        },

        termos: {
            hash: 'termos-de-uso',
            selo: 'Regras de uso da plataforma',
            titulo: 'Termos de uso',
            resumo: 'Ao criar uma conta ou usar a Dragnix, você concorda com estes termos.',
            secoes: [
                ['1. Sobre a Dragnix', `
                    <p>A Dragnix é uma plataforma gratuita e gamificada de <b>educação financeira</b>, com trilhas de
                    conteúdo, exercícios, desafios, ranking, controle financeiro e um assistente com IA (Nix).
                    É um projeto acadêmico (TCC) e pode passar por mudanças.</p>`],
                ['2. Cadastro e conta', `
                    <ul>
                        <li>Informe dados verdadeiros e mantenha sua senha em segredo.</li>
                        <li>A conta é pessoal: você é responsável pelo que for feito com ela.</li>
                        <li>Menores de 18 anos devem usar a plataforma com o conhecimento de um responsável.</li>
                    </ul>`],
                ['3. Conteúdo educativo, não é consultoria', `
                    <p>Todo o conteúdo tem finalidade <b>exclusivamente educativa</b>. A Dragnix <b>não oferece
                    consultoria financeira, de investimentos ou bancária</b> e não recomenda produtos, bancos ou
                    investimentos. Decisões financeiras são suas e, quando necessário, devem ser tomadas com um
                    responsável ou profissional habilitado.</p>`],
                ['4. Assistente Nix (inteligência artificial)', `
                    <p>O Nix responde com base no conteúdo das trilhas e <b>pode cometer erros</b>. Ele não pesquisa
                    na internet, não dá respostas de questões ou desafios e não aconselha investimentos ou operações
                    bancárias. Em caso de dúvida, revise o conteúdo das trilhas ou pergunte no Fórum de dúvidas.</p>`],
                ['5. Regras de convivência', `
                    <p>No fórum de dúvidas, no perfil e em qualquer área da plataforma, não é permitido:</p>
                    <ul>
                        <li>ofender, ameaçar, discriminar ou expor outras pessoas;</li>
                        <li>publicar conteúdo ilegal, impróprio, spam ou propaganda;</li>
                        <li>usar foto de perfil inadequada ou de outra pessoa;</li>
                        <li>tentar burlar o sistema (XP, ranking, prêmios) ou acessar contas e áreas sem permissão.</li>
                    </ul>
                    <p>Mensagens inadequadas podem ser removidas por professores e administradores.</p>`],
                ['6. Gamificação e prêmios', `
                    <p>XP, moedas, níveis, conquistas e vidas existem apenas dentro da plataforma e <b>não têm valor
                    em dinheiro</b>. Prêmios do ranking semanal dependem de disponibilidade e das regras divulgadas
                    na própria plataforma; contas com uso indevido podem perder a premiação.</p>`],
                ['7. Propriedade intelectual', `
                    <p>Textos, trilhas, ilustrações, marca e logo da Dragnix pertencem à equipe Dragnix. Você pode
                    usá-los para estudar, mas não pode copiar ou distribuir para fins comerciais sem autorização.</p>`],
                ['8. Suspensão da conta', `
                    <p>Contas que desrespeitarem estes termos podem ser suspensas ou excluídas. Você também pode
                    pedir a exclusão da sua conta a qualquer momento por ${CONTATO}.</p>`],
                ['9. Responsabilidades', `
                    <p>Fazemos o possível para manter a plataforma no ar e o conteúdo correto, mas ela pode ficar
                    indisponível ou conter falhas. A Dragnix não se responsabiliza por decisões financeiras tomadas
                    com base no conteúdo ou nas respostas do Nix.</p>`],
                ['10. Privacidade', `
                    <p>O uso dos seus dados segue a nossa
                    <button type="button" class="qs-doc__link" data-doc="privacidade">Política de privacidade</button>,
                    de acordo com a LGPD.</p>`],
                ['11. Alterações e lei aplicável', `
                    <p>Estes termos podem ser atualizados; continuar usando a plataforma depois de uma mudança
                    significa concordar com a nova versão. Valem as leis brasileiras. Contato: ${CONTATO}.</p>`]
            ]
        }
    };

    /* ============================================================
       [DOC-CARD]
       ============================================================ */

    const janelas = {};
    let quemAbriu = null;

    function montar(tipo) {
        const doc = DOCUMENTOS[tipo];
        const janela = document.createElement('dialog');
        janela.className = 'qs qs--doc';
        janela.setAttribute('aria-labelledby', `docTitulo-${tipo}`);

        janela.innerHTML = `
            <div class="qs__caixa">
                <button type="button" class="qs__fechar" aria-label="Fechar ${doc.titulo}">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>

                <div class="qs__topo">
                    <span class="qs__selo">${doc.selo}</span>
                    <h2 id="docTitulo-${tipo}">${doc.titulo}</h2>
                    <p>${doc.resumo}</p>
                    <small class="qs-doc__data">Última atualização: ${ATUALIZADO}</small>
                </div>

                <div class="qs-doc">
                    ${doc.secoes.map(([titulo, corpo]) => `
                        <section class="qs-doc__secao">
                            <h3>${titulo}</h3>
                            ${corpo}
                        </section>
                    `).join('')}
                </div>

                <div class="qs-doc__rodape">
                    <button type="button" class="qs-doc__ok">Entendi</button>
                </div>
            </div>
        `;

        document.body.appendChild(janela);

        janela.querySelector('.qs__fechar').addEventListener('click', () => fechar(tipo));
        janela.querySelector('.qs-doc__ok').addEventListener('click', () => fechar(tipo));
        janela.addEventListener('click', e => { if (e.target === janela) fechar(tipo); });
        janela.addEventListener('cancel', e => { e.preventDefault(); fechar(tipo); });

        janelas[tipo] = janela;
        return janela;
    }

    function depoisDeFechar() {
        if (Object.values(janelas).some(j => j.open)) return;
        document.documentElement.classList.remove('qs-aberto');
        if (quemAbriu && quemAbriu.focus && document.contains(quemAbriu)) quemAbriu.focus();
        quemAbriu = null;
    }

    function fechar(tipo) {
        const janela = janelas[tipo];
        if (!janela || !janela.open) return;
        if (typeof janela.close === 'function') janela.close();
        else janela.removeAttribute('open');
        depoisDeFechar();
    }

    function abrir(tipo) {
        if (!DOCUMENTOS[tipo]) return false;

        // um documento por vez (o link "Política de privacidade" dentro dos Termos troca de janela)
        Object.keys(janelas).forEach(outro => {
            if (outro !== tipo && janelas[outro].open) {
                janelas[outro].close();
            }
        });

        const janela = janelas[tipo] || montar(tipo);
        if (janela.open) return true;

        if (!quemAbriu) quemAbriu = document.activeElement;
        document.documentElement.classList.add('qs-aberto');

        if (typeof janela.showModal === 'function') janela.showModal();
        else janela.setAttribute('open', '');

        janela.querySelector('.qs__caixa').scrollTop = 0;
        janela.querySelector('.qs__fechar').focus();
        return true;
    }

    window.dgxDocumentos = { abrir, fechar: tipo => fechar(tipo) };

    /* ============================================================
       [DOC-LINKS]
       ============================================================ */

    const TEXTO_PARA_TIPO = {
        'politica de privacidade': 'privacidade',
        'termos de uso': 'termos'
    };

    const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

    // link do rodapé (pelo texto) ou qualquer elemento com data-doc="privacidade|termos"
    function tipoDoElemento(el) {
        if (!el) return null;
        if (el.dataset && el.dataset.doc) return el.dataset.doc;
        if (el.tagName === 'A' && el.closest('.dgx-footer-links')) return TEXTO_PARA_TIPO[semAcento(el.textContent)] || null;
        return null;
    }

    function ligarLinks() {
        document.querySelectorAll('.dgx-footer-links a').forEach(a => {
            const tipo = tipoDoElemento(a);
            if (!tipo) return;
            a.setAttribute('href', '#' + DOCUMENTOS[tipo].hash);
            a.setAttribute('role', 'button');
            a.setAttribute('aria-haspopup', 'dialog');
        });

        // endereço direto: index.html#termos-de-uso, #politica-de-privacidade
        const pedido = Object.keys(DOCUMENTOS).find(t => location.hash === '#' + DOCUMENTOS[t].hash);
        if (pedido) abrir(pedido);
    }

    document.addEventListener('click', e => {
        const el = e.target.closest && e.target.closest('a, button, [data-doc]');
        const tipo = tipoDoElemento(el);
        if (!tipo) return;
        e.preventDefault();
        e.stopPropagation();
        abrir(tipo);
    }, true);

    document.addEventListener('keydown', e => {
        if (e.key === ' ' && document.activeElement && document.activeElement.tagName === 'A' && tipoDoElemento(document.activeElement)) {
            e.preventDefault();
            abrir(tipoDoElemento(document.activeElement));
        }
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligarLinks);
    else ligarLinks();
})();
