document.addEventListener(
  'DOMContentLoaded',
  () => {

    // ========================================================
    // ELEMENTOS
    // ========================================================

    const status =
      document.getElementById(
        'systemStatus'
      );

    const cards =
      document.getElementById(
        'systemCards'
      );

    const databaseTables =
      document.getElementById(
        'databaseTables'
      );

    const tableViewer =
      document.getElementById(
        'tableViewer'
      );

    const refreshButton =
      document.getElementById(
        'btnAtualizarSistema'
      );

    const backButton =
      document.getElementById(
        'btnVoltarAdmin'
      );

    const logoutButton =
      document.getElementById(
        'btnSairSistema'
      );


    // ========================================================
    // TOKEN
    // ========================================================

    function getToken() {

      const possibleKeys = [
        'token',
        'authToken',
        'accessToken',
        'jwt',
        'dragnixToken'
      ];

      for (
        const key of possibleKeys
      ) {

        const value =
          localStorage.getItem(
            key
          );

        if (
          value &&
          value.startsWith('eyJ')
        ) {

          return value;

        }

      }


      for (
        const key of Object.keys(
          localStorage
        )
      ) {

        const value =
          localStorage.getItem(
            key
          );

        if (
          value &&
          value.startsWith('eyJ')
        ) {

          return value;

        }

        try {

          const parsed =
            JSON.parse(
              value
            );

          if (
            parsed &&
            typeof parsed ===
              'object'
          ) {

            const token =
              parsed.token ||
              parsed.accessToken ||
              parsed.jwt;

            if (
              typeof token ===
                'string' &&
              token.startsWith('eyJ')
            ) {

              return token;

            }

          }

        } catch {
          // Não era JSON.
        }

      }


      return null;
    }


    // ========================================================
    // HTML SEGURO
    // ========================================================

    function escapeHtml(
      value
    ) {

      return String(
        value ?? ''
      )
        .replace(
          /&/g,
          '&amp;'
        )
        .replace(
          /</g,
          '&lt;'
        )
        .replace(
          />/g,
          '&gt;'
        )
        .replace(
          /"/g,
          '&quot;'
        )
        .replace(
          /'/g,
          '&#039;'
        );

    }


    // ========================================================
    // FORMATA VALORES
    // ========================================================

    function formatValue(
      value
    ) {

      if (
        value === null ||
        value === undefined
      ) {

        return '';

      }


      if (
        typeof value ===
        'object'
      ) {

        try {

          return JSON.stringify(
            value,
            null,
            2
          );

        } catch {

          return String(
            value
          );

        }

      }


      return String(
        value
      );

    }


    // ========================================================
    // CARDS
    // ========================================================

    function renderCards(
      database
    ) {

      if (!cards) {
        return;
      }


      const mainCards = [
        {
          title: 'Usuários',
          value:
            database.users,
          icon: '👥'
        },

        {
          title: 'Administradores',
          value:
            database.admins,
          icon: '🛡️'
        },

        {
          title: 'Trilhas',
          value:
            database.tracks,
          icon: '📚'
        },

        {
          title: 'Módulos',
          value:
            database.lessons,
          icon: '📖'
        },

        {
          title: 'Questões',
          value:
            database.questions,
          icon: '❓'
        },

        {
          title: 'Tabelas',
          value:
            database.tableCount,
          icon: '🗄️'
        },

        {
          title: 'Total de registros',
          value:
            database.totalRows,
          icon: '📊'
        }
      ];


      cards.innerHTML =
        mainCards
          .map(
            card => `
              <article class="system-card">

                <div class="system-card-icon">
                  ${card.icon}
                </div>

                <div class="system-card-content">

                  <span>
                    ${escapeHtml(
                      card.title
                    )}
                  </span>

                  <strong>
                    ${Number(
                      card.value || 0
                    ).toLocaleString(
                      'pt-BR'
                    )}
                  </strong>

                </div>

              </article>
            `
          )
          .join('');

    }


    // ========================================================
    // TABELAS
    // ========================================================

    function renderDatabaseTables(
      tables
    ) {

      if (!databaseTables) {
        return;
      }


      databaseTables.innerHTML =
        tables
          .map(
            table => `
              <button
                type="button"
                class="database-table-btn"
                data-table="${escapeHtml(
                  table.name
                )}"
              >

                <span>
                  🗄️
                </span>

                <strong>
                  ${escapeHtml(
                    table.name
                  )}
                </strong>

                <small>
                  ${Number(
                    table.rows
                  ).toLocaleString(
                    'pt-BR'
                  )}
                  registros
                </small>

              </button>
            `
          )
          .join('');


      databaseTables
        .querySelectorAll(
          '[data-table]'
        )
        .forEach(
          button => {

            button.addEventListener(
              'click',
              () => {

                loadTable(
                  button.dataset.table
                );

              }
            );

          }
        );

    }


    // ========================================================
    // VISUALIZAR TABELA
    // ========================================================

    async function loadTable(
      tableName
    ) {

      const token =
        getToken();

      if (!token) {

        alert(
          'Sessão administrativa não encontrada.'
        );

        return;

      }


      if (tableViewer) {

        tableViewer.innerHTML = `
          <div class="table-viewer-loading">
            ⏳ Carregando tabela...
          </div>
        `;

      }


      try {

        const response =
          await fetch(
            `/api/admin/system/table/${encodeURIComponent(
              tableName
            )}`,
            {
              method: 'GET',

              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );


        let data;

        try {

          data =
            await response.json();

        } catch {

          throw new Error(
            'Resposta inválida do servidor.'
          );

        }


        if (
          !response.ok ||
          !data.ok
        ) {

          throw new Error(
            data.error ||
            'Não foi possível carregar a tabela.'
          );

        }


        renderTable(
          data.table
        );

      } catch (error) {

        console.error(
          'Erro ao carregar tabela:',
          error
        );


        if (tableViewer) {

          tableViewer.innerHTML = `
            <div class="table-viewer-error">
              ❌ ${escapeHtml(
                error.message
              )}
            </div>
          `;

        }

      }

    }


    // ========================================================
    // RENDERIZAR TABELA
    // ========================================================

    function renderTable(
      table
    ) {

      if (!tableViewer) {
        return;
      }


      if (
        !table.rows.length
      ) {

        tableViewer.innerHTML = `

          <div class="table-viewer-header">

            <div>

              <h3>
                ${escapeHtml(
                  table.name
                )}
              </h3>

              <span>
                0 registros
              </span>

            </div>

          </div>


          <div class="table-viewer-empty">

            <span>
              📭
            </span>

            <p>
              Esta tabela está vazia.
            </p>

          </div>

        `;

        return;

      }


      let html = `

        <div class="table-viewer-header">

          <div>

            <h3>
              ${escapeHtml(
                table.name
              )}
            </h3>

            <span>
              ${Number(
                table.total
              ).toLocaleString(
                'pt-BR'
              )}
              registros
            </span>

          </div>

        </div>


        <div class="system-table-wrapper">

          <table class="system-data-table">

            <thead>

              <tr>

      `;


      table.columns.forEach(
        column => {

          html += `
            <th>
              ${escapeHtml(
                column
              )}
            </th>
          `;

        }
      );


      html += `
              </tr>

            </thead>

            <tbody>
      `;


      table.rows.forEach(
        row => {

          html += `
            <tr>
          `;


          table.columns.forEach(
            column => {

              html += `
                <td>
                  ${escapeHtml(
                    formatValue(
                      row[column]
                    )
                  )}
                </td>
              `;

            }
          );


          html += `
            </tr>
          `;

        }
      );


      html += `

            </tbody>

          </table>

        </div>

      `;


      if (
        table.hiddenColumns &&
        table.hiddenColumns.length
      ) {

        html += `

          <div class="protected-info">

            🔒 Colunas protegidas:
            ${table.hiddenColumns
              .map(
                column =>
                  escapeHtml(
                    column
                  )
              )
              .join(', ')}

          </div>

        `;

      }


      tableViewer.innerHTML =
        html;

    }


    // ========================================================
    // CARREGAR VISÃO GERAL
    // ========================================================

    async function loadOverview() {

      const token =
        getToken();

      if (!token) {

        if (status) {

          status.textContent =
            'Sessão administrativa não encontrada.';

        }

        return;

      }


      if (status) {

        status.textContent =
          'Carregando informações do sistema...';

      }


      try {

        const response =
          await fetch(
            '/api/admin/system/overview',
            {
              method: 'GET',

              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );


        let data;

        try {

          data =
            await response.json();

        } catch {

          throw new Error(
            'Resposta inválida do servidor.'
          );

        }


        if (
          !response.ok ||
          !data.ok
        ) {

          throw new Error(
            data.error ||
            'Não foi possível carregar o sistema.'
          );

        }


        renderCards(
          data.database
        );


        renderDatabaseTables(
          data.database.tables
        );


        if (status) {

          status.innerHTML = `
            🟢 Sistema online
            · Node.js ${escapeHtml(
              data.server.nodeVersion
            )}
            · ${data.database.tableCount}
            tabelas
            · ${Number(
              data.database.totalRows
            ).toLocaleString(
              'pt-BR'
            )}
            registros
          `;

        }

      } catch (error) {

        console.error(
          'Erro ao carregar sistema:',
          error
        );


        if (status) {

          status.textContent =
            `❌ ${error.message}`;

        }

      }

    }


    // ========================================================
    // NAVEGAÇÃO
    // ========================================================

    if (backButton) {

      backButton.addEventListener(
        'click',
        () => {

          window.location.href =
            'admin.html';

        }
      );

    }

if (logoutButton) {

  logoutButton.addEventListener(
    'click',
    () => {

      // ==============================================
      // ENCERRA A SESSÃO
      // ==============================================

      localStorage.removeItem(
        'token'
      );

      localStorage.removeItem(
        'user'
      );


      // ==============================================
      // PERMITE EXIBIR A SPLASH NOVAMENTE
      // ==============================================

      sessionStorage.removeItem(
        'splashExibida'
      );


      // ==============================================
      // SPLASH -> LOGIN/CADASTRO
      // ==============================================

      window.location.replace(
        'splash.html?destino=login.html'
      );

    }
  );

}

    if (refreshButton) {

      refreshButton.addEventListener(
        'click',
        loadOverview
      );

    }


    // ========================================================
    // INICIALIZAÇÃO
    // ========================================================

    loadOverview();

  }
);