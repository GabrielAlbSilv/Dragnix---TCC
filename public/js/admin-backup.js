document.addEventListener(
  'DOMContentLoaded',
  () => {
    // ========================================================
    // ELEMENTOS
    // ========================================================

    const generateButton =
      document.getElementById(
        'btnGerarBackup'
      );

    const selectButton =
      document.getElementById(
        'btnSelecionarBackup'
      );

    const fileInput =
      document.getElementById(
        'backupFileInput'
      );

    const restoreButton =
      document.getElementById(
        'btnRestaurarBackup'
      );

    const clearButton =
      document.getElementById(
        'btnLimparBanco'
      );

    const status =
      document.getElementById(
        'backupStatus'
      );

    const preview =
      document.getElementById(
        'backupPreview'
      );

    let selectedBackup =
      null;

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

      // Primeiro procura por chaves conhecidas.
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

      // Depois procura por JWTs dentro do localStorage.
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
            const possibleToken =
              parsed.token ||
              parsed.accessToken ||
              parsed.jwt;

            if (
              typeof possibleToken ===
                'string' &&
              possibleToken.startsWith(
                'eyJ'
              )
            ) {
              return possibleToken;
            }
          }
        } catch {
          // Não era JSON.
        }
      }

      return null;
    }

    // ========================================================
    // ARQUIVO -> BASE64
    // ========================================================

    async function fileToBase64(
      file
    ) {
      const buffer =
        await file.arrayBuffer();

      const bytes =
        new Uint8Array(
          buffer
        );

      let binary = '';

      const chunkSize =
        0x8000;

      for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
      ) {
        const chunk =
          bytes.subarray(
            i,
            Math.min(
              i + chunkSize,
              bytes.length
            )
          );

        binary +=
          String.fromCharCode(
            ...chunk
          );
      }

      return btoa(
        binary
      );
    }

    // ========================================================
    // SEGURANÇA HTML
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

    function formatDate(
      value
    ) {
      if (!value) {
        return 'Não informado';
      }

      const date =
        new Date(value);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return value;
      }

      return date.toLocaleString(
        'pt-BR'
      );
    }

    // ========================================================
    // PREVIEW DO BACKUP
    // ========================================================

    function showPreview(
      summary
    ) {
      if (!preview) {
        return;
      }

      preview.innerHTML = `
        <div class="backup-preview-box">

          <h3>Backup válido</h3>

          <p>
            <strong>Aplicação:</strong>
            ${escapeHtml(
              summary.application
            )}
          </p>

          <p>
            <strong>Data:</strong>
            ${formatDate(
              summary.createdAt
            )}
          </p>

          <p>
            <strong>Usuários:</strong>
            ${summary.users}
          </p>

          <p>
            <strong>Administradores:</strong>
            ${summary.admins}
          </p>

          <p>
            <strong>Trilhas:</strong>
            ${summary.tracks}
          </p>

          <p>
            <strong>Módulos:</strong>
            ${summary.lessons}
          </p>

          <p>
            <strong>Questões:</strong>
            ${summary.questions}
          </p>

          <p>
            <strong>Tabelas:</strong>
            ${summary.totalTables}
          </p>

          <p>
            <strong>Registros:</strong>
            ${summary.totalRows}
          </p>

        </div>
      `;

      if (restoreButton) {
        restoreButton.disabled =
          false;
      }
    }

    // ========================================================
    // LER BACKUP
    // ========================================================

    async function inspectBackup(
      file
    ) {
      const token =
        getToken();

      if (!token) {
        alert(
          'Sessão administrativa não encontrada. Faça login novamente.'
        );

        return;
      }

      if (
        !file.name
          .toLowerCase()
          .endsWith('.dragnix')
      ) {
        alert(
          'Selecione um arquivo de backup .dragnix.'
        );

        return;
      }

     if (
          file.size >
          200 * 1024 * 1024
      ) {
          alert(
              'O arquivo de backup é maior que 200 MB.'
          );

          return;
      }

      if (selectButton) {
        selectButton.disabled =
          true;
      }

      if (restoreButton) {
        restoreButton.disabled =
          true;
      }

      if (status) {
        status.textContent =
          'Lendo e validando o backup...';
      }

      try {
        const base64 =
          await fileToBase64(
            file
          );

        const response =
          await fetch(
            '/api/admin/backup/inspect',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',

                Authorization:
                  `Bearer ${token}`
              },

              body:
                JSON.stringify({
                  data:
                    base64
                })
            }
          );

        let data;

        try {
          data =
            await response.json();
        } catch {
          throw new Error(
            'O servidor retornou uma resposta inválida.'
          );
        }

        if (
          !response.ok
        ) {
          throw new Error(
            data?.error ||
              'Backup inválido.'
          );
        }

        selectedBackup = {
          file,
          base64,
          summary:
            data.summary
        };

        showPreview(
          data.summary
        );

        if (status) {
          status.textContent =
            `Backup validado: ${file.name}`;
        }
      } catch (error) {
        console.error(
          'Erro ao ler backup:',
          error
        );

        selectedBackup =
          null;

        if (restoreButton) {
          restoreButton.disabled =
            true;
        }

        if (preview) {
          preview.innerHTML =
            '';
        }

        if (status) {
          status.textContent =
            'Não foi possível ler o backup.';
        }

        alert(
          error.message ||
            'Não foi possível ler o backup.'
        );
      } finally {
        if (selectButton) {
          selectButton.disabled =
            false;
        }
      }
    }

    // ========================================================
    // RESTAURAR BACKUP
    // ========================================================

    async function restoreBackup() {
      if (
        !selectedBackup
      ) {
        alert(
          'Primeiro selecione um backup válido.'
        );

        return;
      }

      const confirmed =
        window.confirm(
          'ATENÇÃO!\n\nA restauração substituirá TODOS os dados atuais do banco pelos dados do backup selecionado.\n\nUsuários, trilhas, módulos, questões, progresso, XP, moedas, ranking e dados financeiros atuais serão substituídos.\n\nDeseja realmente continuar?'
        );

      if (!confirmed) {
        return;
      }

      const secondConfirmation =
        window.confirm(
          'ÚLTIMA CONFIRMAÇÃO!\n\nRestaurar este backup agora?'
        );

      if (!secondConfirmation) {
        return;
      }

      const token =
        getToken();

      if (!token) {
        alert(
          'Sua sessão administrativa expirou. Faça login novamente.'
        );

        return;
      }

      if (restoreButton) {
        restoreButton.disabled =
          true;
      }

      if (selectButton) {
        selectButton.disabled =
          true;
      }

      if (clearButton) {
        clearButton.disabled =
          true;
      }

      if (status) {
        status.textContent =
          'Restaurando banco de dados...';
      }

      try {
        const response =
          await fetch(
            '/api/admin/backup/restore',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',

                Authorization:
                  `Bearer ${token}`
              },

              body:
                JSON.stringify({
                  data:
                    selectedBackup.base64
                })
            }
          );

        let data;

        try {
          data =
            await response.json();
        } catch {
          throw new Error(
            'O servidor retornou uma resposta inválida.'
          );
        }

        if (
          !response.ok
        ) {
          throw new Error(
            data?.error ||
              'Não foi possível restaurar o backup.'
          );
        }

        if (status) {
          status.textContent =
            'Backup restaurado com sucesso.';
        }

        alert(
          'Backup restaurado com sucesso!\n\nO sistema será recarregado.'
        );

        selectedBackup =
          null;

        if (preview) {
          preview.innerHTML =
            '';
        }

        window.location.reload();

      } catch (error) {
        console.error(
          'Erro ao restaurar backup:',
          error
        );

        if (status) {
          status.textContent =
            'Erro ao restaurar o backup.';
        }

        alert(
          error.message ||
            'Erro ao restaurar o backup.'
        );

        if (restoreButton) {
          restoreButton.disabled =
            false;
        }

        if (selectButton) {
          selectButton.disabled =
            false;
        }

        if (clearButton) {
          clearButton.disabled =
            false;
        }
      }
    }

    // ========================================================
    // GERAR BACKUP
    // ========================================================

    async function generateBackup() {
      const token =
        getToken();

      if (!token) {
        alert(
          'Sessão administrativa não encontrada. Faça login novamente.'
        );

        return;
      }

      const confirmed =
        window.confirm(
          'Deseja gerar um backup completo do Dragnix?'
        );

      if (!confirmed) {
        return;
      }

      if (generateButton) {
        generateButton.disabled =
          true;

        generateButton.dataset.originalText =
          generateButton.textContent;

        generateButton.textContent =
          'Gerando backup...';
      }

      if (status) {
        status.textContent =
          'Preparando backup...';
      }

      try {
        const response =
          await fetch(
            '/api/admin/backup/export',
            {
              method: 'GET',

              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        if (
          !response.ok
        ) {
          let message =
            'Não foi possível gerar o backup.';

          try {
            const data =
              await response.json();

            if (data?.error) {
              message =
                data.error;
            }
          } catch {
            // Resposta não era JSON.
          }

          throw new Error(
            message
          );
        }

        const blob =
          await response.blob();

        if (
          !blob.size
        ) {
          throw new Error(
            'O servidor retornou um arquivo vazio.'
          );
        }

        const disposition =
          response.headers.get(
            'Content-Disposition'
          ) || '';

        const match =
          disposition.match(
            /filename="([^"]+)"/i
          );

        const filename =
          match?.[1] ||
          `dragnix-backup-${Date.now()}.dragnix`;

        const url =
          URL.createObjectURL(
            blob
          );

        const link =
          document.createElement(
            'a'
          );

        link.href =
          url;

        link.download =
          filename;

        document.body.appendChild(
          link
        );

        link.click();

        link.remove();

        URL.revokeObjectURL(
          url
        );

        if (status) {
          status.textContent =
            `Backup gerado: ${filename}`;
        }

        alert(
          'Backup gerado com sucesso!'
        );

      } catch (error) {
        console.error(
          'Erro ao gerar backup:',
          error
        );

        if (status) {
          status.textContent =
            'Erro ao gerar backup.';
        }

        alert(
          error.message ||
            'Erro ao gerar backup.'
        );
      } finally {
        if (generateButton) {
          generateButton.disabled =
            false;

          generateButton.textContent =
            generateButton.dataset.originalText ||
            '📥 Gerar backup';
        }
      }
    }

    // ========================================================
    // LIMPAR BANCO
    // ========================================================
// ========================================================
// LIMPAR BANCO
// ========================================================

async function clearDatabase() {
  const token =
    getToken();

  if (!token) {
    alert(
      'Sessão administrativa não encontrada. Faça login novamente.'
    );

    return;
  }

  const firstConfirmation =
    window.confirm(
      'ATENÇÃO!\n\n' +
      'Esta operação apagará permanentemente:\n\n' +
      '• usuários comuns\n' +
      '• trilhas\n' +
      '• módulos\n' +
      '• questões\n' +
      '• progresso\n' +
      '• respostas\n' +
      '• conquistas\n' +
      '• missões\n' +
      '• dados financeiros\n\n' +
      'As contas de administrador NÃO serão apagadas.\n\n' +
      'Deseja continuar?'
    );

  if (!firstConfirmation) {
    return;
  }

  const secondConfirmation =
    window.confirm(
      'ÚLTIMA CONFIRMAÇÃO!\n\n' +
      'Todos os dados dos alunos e conteúdos serão apagados.\n' +
      'As contas ADM serão preservadas.\n\n' +
      'Essa operação não pode ser desfeita sem um backup.\n\n' +
      'Tem certeza de que deseja LIMPAR O BANCO?'
    );

  if (!secondConfirmation) {
    return;
  }

  if (clearButton) {
    clearButton.disabled =
      true;

    clearButton.dataset.originalText =
      clearButton.textContent;

    clearButton.textContent =
      'Limpando banco...';
  }

  if (status) {
    status.textContent =
      'Limpando banco de dados...';
  }

  try {
    const response =
      await fetch(
        '/api/admin/database/clear',
        {
          method: 'POST',

          headers: {
            'Authorization':
              `Bearer ${token}`,
            'Content-Type':
              'application/json'
          }
        }
      );

    let data;

    try {
      data =
        await response.json();
    } catch {
      throw new Error(
        'O servidor retornou uma resposta inválida.'
      );
    }

    console.log(
      'Resposta da limpeza:',
      data
    );

    if (
      !response.ok ||
      !data.ok
    ) {
      throw new Error(
        data?.error ||
        data?.message ||
        `Erro HTTP ${response.status}`
      );
    }

    if (status) {
      status.textContent =
        'Banco limpo com sucesso.';
    }

    alert(
      'Banco limpo com sucesso!\n\n' +
      `Usuários comuns removidos: ${data.deletedUsers}\n` +
      `Administradores preservados: ${data.remainingAdmins}`
    );

    window.location.reload();

  } catch (error) {
    console.error(
      'Erro ao limpar banco:',
      error
    );

    if (status) {
      status.textContent =
        'Erro ao limpar banco.';
    }

    alert(
      'Não foi possível limpar o banco.\n\n' +
      `Erro: ${error.message}`
    );

    if (clearButton) {
      clearButton.disabled =
        false;

      clearButton.textContent =
        clearButton.dataset.originalText ||
        '🗑️ Limpar banco';
    }
  }
}

    // ========================================================
    // EVENTOS
    // ========================================================

    if (generateButton) {
      generateButton.addEventListener(
        'click',
        generateBackup
      );
    }

    if (
      selectButton &&
      fileInput
    ) {
      selectButton.addEventListener(
        'click',
        () => {
          fileInput.click();
        }
      );

      fileInput.addEventListener(
        'change',
        async event => {
          const file =
            event.target.files?.[0];

          if (!file) {
            return;
          }

          await inspectBackup(
            file
          );

          fileInput.value =
            '';
        }
      );
    }

    if (restoreButton) {
      restoreButton.addEventListener(
        'click',
        restoreBackup
      );
    }

    if (clearButton) {
      clearButton.addEventListener(
        'click',
        clearDatabase
      );
    }
  }
);