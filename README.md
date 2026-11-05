# COMANDO DE CONTROLE — Operação Última Asa
## Build 0.5 — Disciplina Operacional

Esta atualização adiciona quatro etapas:
1. **Cronômetro operacional sempre visível:** início, pausa, retomada e encerramento; sessão salva localmente.
2. **Registro de interrupções:** categoria, observação e duração estimada ou encerramento posterior.
3. **Painel diário e relatório semanal:** tempo efetivo, meta, interrupções e exportação JSON.
4. **Ameaças e missões de contenção:** três ameaças temáticas e recompensas em créditos, sem punição automática.

### Instalação no GitHub Pages
1. Faça backup dos dados atuais pelo botão **Exportar backup** na versão antiga.
2. Extraia este ZIP.
3. Envie `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg` e `README.md` para a raiz do repositório, substituindo os arquivos antigos.
4. Faça commit na branch publicada pelo GitHub Pages.
5. Abra o site e atualize. Se o navegador mantiver a versão antiga, feche e reabra a PWA ou limpe os dados de cache do site.
6. Confirme que o cronômetro aparece, teste iniciar/pausar/retomar/encerrar e exporte um novo backup.

### Preservação dos dados
- O banco IndexedDB mantém o nome e o object store existentes (`comandoControleDB` / `records`).
- A versão do banco foi elevada para 2. Os dados da campanha existentes são mesclados com os novos campos de Disciplina Operacional.
- A importação de backup antigo continua aceita.
- Recomenda-se manter uma cópia do backup antigo antes de atualizar.

### Limitações conhecidas
- Os dados são locais ao navegador/dispositivo; não existe sincronização em nuvem.
- O cronômetro calcula segmentos de tempo e persiste os registros, mas não comprova atenção real.
- Se o navegador for fechado ou suspenso por período prolongado, a sessão é recuperada pausada no último ponto salvo; o tempo com o app fechado não é contado.
- Lembretes recorrentes e alerta de sessão esquecida funcionam enquanto a PWA/página estiver aberta. Notificações dependem de HTTPS e permissão do navegador. Não há garantia de disparo com o aplicativo completamente encerrado.
- A PWA não lê automaticamente o tempo de uso de outros aplicativos Android. Use Bem-estar Digital como fonte externa, se desejar.
- Uma interrupção com duração estimada é registrada com o tempo informado; se deixar em branco, ela permanece aberta até ser encerrada pela retomada/uso da página.
- Missões de disciplina concedem créditos, não XP, e não aplicam penalidades por ausência ou descanso.

### Testes recomendados após publicação
- Abrir o app e conferir dados antigos, XP, inventário e missão.
- Iniciar uma sessão, navegar entre abas, pausar, retomar e encerrar.
- Fechar/reabrir a PWA durante uma sessão e verificar recuperação do estado.
- Registrar uma interrupção e conferir painel/histórico.
- Salvar horário e dias de alerta; conceder permissão de notificação.
- Exportar backup e relatório semanal.
