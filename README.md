# Rotas do CD

Sistema para os motoristas do CD iniciarem e finalizarem a rota informando o km do painel e a foto do odômetro. Funciona no celular, pelo navegador.

São duas páginas separadas:

| Página | Quem usa | O que faz |
|---|---|---|
| `index.html` | Motoristas | Entram com usuário e senha, iniciam e finalizam a rota, veem as próprias rotas |
| `coordenacao.html` | Coordenação | Painel do dia, histórico com fotos, resumo do mês, planilha CSV, cadastro de motoristas e veículos |

## Quem pode o quê

| | Motorista | Coordenação |
|---|---|---|
| Iniciar e finalizar a própria rota | Sim | Sim |
| Finalizar a rota de outra pessoa | Não | Sim |
| Ver as rotas e fotos dos outros | Não | Sim |
| Corrigir km, excluir rota | Não | Sim |
| Cadastrar motoristas, redefinir senhas, desativar acessos | Não | Sim |
| Cadastrar e editar veículos | Não | Sim |

Isso é garantido no banco de dados, e não só escondido na tela. Um motorista que tentasse chamar o sistema por fora também seria barrado.

O login é só **usuário e senha**, sem e-mail. Quem cadastra os usuários é você, na página da coordenação.

---

## Passo a passo para publicar

Você vai usar duas contas gratuitas: **Supabase** (guarda os dados e as fotos) e **GitHub** (publica as páginas). Reserve cerca de 30 minutos.

### 1. Criar o projeto no Supabase

1. Entre em supabase.com, crie a conta e clique em **New project**.
2. Dê um nome (por exemplo `rotas-cd`), crie uma senha forte para o banco e guarde-a. Em região, escolha **South America (São Paulo)**.
3. Espere o projeto terminar de criar (cerca de 2 minutos).

### 2. Criar as tabelas

1. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/schema.sql`, copie **tudo** e cole no editor.
3. Clique em **Run**. Deve aparecer "Success".

Isso cria as tabelas, as regras de acesso, o espaço das fotos e os três veículos iniciais (SEY, UBG e UCI, com a placa incompleta, que você corrige depois).

### 3. Criar o seu acesso de coordenação

1. Menu **Authentication → Users → Add user → Create new user**.
2. Em Email, digite `seu.usuario@cd.example.com`, trocando `seu.usuario` pelo usuário que você quer usar para entrar (letras minúsculas, números, ponto, hífen ou sublinhado). Esse e-mail é só um formato interno: nenhuma mensagem é enviada.
3. Digite uma senha, **marque "Auto Confirm User"** e clique em **Create user**.
4. Volte ao **SQL Editor**, abra o arquivo `supabase/primeiro-coordenador.sql`, troque `SEU-USUARIO` (nas duas linhas) e `Seu Nome` e rode.

### 4. Impedir cadastro por conta própria

Em **Authentication**, procure a opção **Allow new users to sign up** (fica em Sign In / Providers) e **desligue**. Assim só você cria acessos.

### 5. Publicar a função que cadastra motoristas

1. Menu **Edge Functions → Deploy a new function → Via Editor**.
2. Dê exatamente o nome `manage-users`.
3. Apague o texto de exemplo, abra `supabase/functions/manage-users/index.ts`, copie tudo e cole.
4. Clique em **Deploy**.

### 6. Copiar as chaves para o `config.js`

1. Menu **Project Settings → API** (ou **API Keys**).
2. Copie o **Project URL** e a chave pública (**anon** ou **publishable**).
3. Abra o `config.js` e troque `https://SEU-PROJETO.supabase.co` e `COLE-AQUI-A-CHAVE-PUBLICA`.

> **Nunca** cole a chave `service_role` (secreta) nesse arquivo. A chave pública pode ficar à vista: quem protege os dados são as regras de acesso do passo 2.

Se você mudar o `cd.example.com` (não precisa), troque também em `config.js` (`LOGIN_DOMAIN`), em `manage-users/index.ts` e nos e-mails do passo 3. Tem de ser igual nos três.

### 7. Publicar as páginas no GitHub

1. Entre em github.com e crie um repositório **público** (por exemplo `rotas-cd`). O plano gratuito só publica páginas a partir de repositório público.
2. Envie os arquivos `index.html`, `coordenacao.html`, `common.js`, `motorista.js`, `coordenacao.js`, `style.css` e `config.js` (botão **Add file → Upload files**). A pasta `supabase` pode ir junto ou ficar só com você.
3. Abra **Settings → Pages**, em **Build and deployment** escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`, e clique em **Save**.
4. Em alguns minutos o endereço aparece no topo da mesma tela, algo como `https://seu-usuario.github.io/rotas-cd/`.

Endereços finais:
- Motoristas: `https://seu-usuario.github.io/rotas-cd/`
- Coordenação: `https://seu-usuario.github.io/rotas-cd/coordenacao.html`

### 8. Configurar e testar

1. Abra a página da coordenação e entre com o seu usuário.
2. Aba **Veículos**: abra cada um, complete a placa e troque o nome (por exemplo "Van 1", "Van 2", "Caminhão") e salve.
3. Aba **Motoristas**: cadastre cada motorista com nome, usuário e uma senha. **Anote a senha para entregar a ele**: ela não pode ser consultada depois, só redefinida.
4. No celular, abra o endereço dos motoristas, entre com um motorista de teste e faça uma rota completa (iniciar, finalizar). Confira o resultado no Histórico da coordenação e depois exclua a rota de teste.

---

## Uso no dia a dia

**Motorista**
1. Abre o endereço e entra (o navegador pode guardar o login).
2. Toca no veículo, digita o km do painel, tira a foto do odômetro e toca em **Iniciar rota**.
3. No fim do dia toca no mesmo veículo, digita o km final, tira a foto e toca em **Finalizar rota**. Pode escrever uma observação.
4. Errou o km ao iniciar? Dentro da rota aberta há **Errei o início: cancelar esta rota**.

A hora da saída e da chegada é a do servidor, e não a do celular. A foto também leva data e hora escritas no canto.

**Coordenação**
- **Painel:** quem está em rota agora, rotas do dia, km do mês.
- **Histórico:** filtros por mês, veículo e motorista, fotos, correção de km e planilha CSV.
- **Resumo:** km e número de rotas por veículo e por motorista em cada mês.
- **Rota que ficou aberta:** um motorista não finaliza a rota de outro. Para fechar uma rota esquecida, entre com o seu usuário de coordenação na página dos motoristas (`index.html`), toque no veículo e finalize. Se a rota nem deveria existir, exclua-a no Histórico da coordenação.

## Localização da foto

Ao tirar a foto do odômetro, o celular pede a localização (GPS). As coordenadas são escritas na foto, ao lado da data e hora, e guardadas na rota. No Histórico da coordenação aparecem os botões **Mapa da saída** e **Mapa da chegada**, e a planilha CSV traz os links.

- O motorista precisa **permitir a localização** para o site quando o navegador perguntar, e estar com o GPS ligado.
- Se não conseguir a localização, o aviso aparece e ele pode continuar. A rota fica marcada como "Sem localização".
- A localização é registrada só no momento da foto, e não acompanha o veículo durante a rota.
- Avise os motoristas que a posição é registrada nesses dois momentos.
- Quem já rodou o `schema.sql` antes desta versão precisa rodar também `supabase/atualizacao-localizacao.sql` (uma vez, sem apagar dados).

## Veículo de cada motorista

Na aba **Motoristas**, ao cadastrar (ou depois, abrindo o motorista e tocando em **Salvar veículo**), você escolhe o veículo dele.

- Com veículo definido, o motorista só **vê** e só consegue **iniciar rota** nesse veículo. Isso vale no banco de dados, e não só na tela.
- Com **Todos os veículos**, ele vê todos (serve para quem reveza). Os motoristas que já existem ficam assim até você definir.
- Se você trocar o veículo de quem está com a rota aberta, ele continua vendo a rota dele para poder finalizar.
- Quem já rodou o `schema.sql` antes desta versão precisa rodar também `supabase/atualizacao-veiculo-do-motorista.sql` (uma vez, sem apagar dados).

## Planilha de controle de KM (.xlsx)

No **Histórico**, escolha o mês e toque em **Preencher minha planilha de controle (.xlsx)**. Selecione o arquivo da sua planilha (uma aba por mês, uma coluna por veículo, como o modelo da frota). O sistema devolve o mesmo arquivo com o **KM Início** e o **KM Final** de cada dia preenchidos. Formato, fórmulas, totais e as outras abas ficam como estavam.

- A planilha é lida e gerada no seu computador. Ela não é enviada para o site nem para o Supabase.
- Cada veículo é ligado à coluna dele pela **placa**: a placa cadastrada na aba **Veículos** precisa aparecer no cabeçalho da coluna (por exemplo `SEY4A76` casa com `RPR085 VAN SEY4A76`). Cadastre as placas completas.
- Dia com mais de uma rota: vale o km inicial da primeira e o km final da última. Se a última ainda estiver aberta, só o início é preenchido.
- A rota entra no dia em que **começou**.
- Veículos que não estão no sistema (por exemplo Fiorino e Saveiro, se os motoristas não lançarem neles) não são mexidos: a coluna deles fica como você preencheu.
- Se a planilha já tinha um valor diferente numa célula que o sistema vai preencher, o sistema troca pelo dele e avisa quantos valores trocou. Guarde o arquivo original antes de usar.
- Exige internet na primeira vez, para carregar o leitor de planilhas.

## Ícone na tela inicial do celular

As páginas já trazem o ícone (pasta `icons`) e o nome do atalho: **Rotas CD** para os motoristas e **Coord. Rotas** para a coordenação. Para o ícone aparecer, suba também a pasta `icons` e os arquivos `manifest.webmanifest` e `manifest-coordenacao.webmanifest` no GitHub.

- **Android (Chrome):** abra o endereço, toque nos três pontinhos **⋮** e em **Adicionar à tela inicial** (ou **Instalar app**).
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** e em **Adicionar à Tela de Início**.
- Quem já criou o atalho antes precisa apagá-lo e criar de novo para o ícone novo aparecer.
- Os ícones são diferentes: o dos motoristas é verde com um mostrador, o da coordenação é escuro com barras. Os desenhos originais estão em `icons/icone.svg` e `icons/coord-icone.svg`, caso queira alterar as cores.

## Cuidados

- **Senhas:** o sistema pede no mínimo 6 caracteres. Use senhas que o motorista não repita em outros lugares e redefina quando alguém sair da empresa (ou desative o acesso).
- **Repositório público:** quem encontrar o endereço vê as telas, mas não vê nenhum dado sem entrar.
- **Plano gratuito do Supabase:** o projeto pode ser pausado depois de cerca de uma semana sem nenhum uso (é só reativar no painel), o espaço das fotos é de 1 GB (cada foto fica em torno de 100 KB, então comporta milhares) e não há cópia de segurança para baixar. Baixe a planilha CSV todo mês.

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "O sistema ainda não foi configurado" | O `config.js` ainda tem os textos de exemplo. Refaça o passo 6 |
| "Usuário ou senha incorretos" | Confira o usuário (minúsculas, sem espaço). A coordenação pode redefinir a senha |
| "Este acesso está desativado" | A coordenação desativou o acesso. Reative na aba Motoristas |
| "Esta área é só para a coordenação" | O usuário é de motorista. Use a página `index.html` |
| Erro ao cadastrar motorista | A função `manage-users` não foi publicada ou o nome está diferente (passo 5) |
| "Failed to fetch" ou "Sem conexão" | Sem internet no celular, ou a URL no `config.js` está errada |
| Página em branco no GitHub | Espere alguns minutos depois de ativar o Pages e recarregue |

## Lançamento manual pela coordenação (quando o motorista não consegue usar o app)

Na aba **Painel**, cada veículo tem uma seção que abre ao tocar:

- Veículo **no CD**: "Lançar início manual". Escolha o motorista, digite o km, confira a data e a hora da saída, escolha a foto que ele mandou pelo WhatsApp e toque em **Lançar início**.
- Veículo **em rota**: "Lançar fechamento manual". Digite o km final, a data e hora da chegada, escolha a foto e toque em **Lançar fechamento**.

A rota aparece normalmente no Histórico, no Resumo e na planilha, com a marca "Lançado pela coordenação". A foto recebe a data/hora informada e o texto "Lançado pela coordenação" (sem localização). O motorista vê a foto da própria rota, mas não pode cancelar uma rota lançada por você.

Regras: a data não pode estar no futuro nem ter mais de 62 dias, o fechamento não pode ser antes do início, e o km final não pode ser menor que o inicial.

**Atualização:** rode `supabase/atualizacao-lancamento-manual.sql` no SQL Editor do Supabase (uma vez) e depois troque os arquivos do site.

## Planilha do Google atualizada sozinha

1. Supabase > SQL Editor: rode `supabase/atualizacao-planilha-google.sql`. No final ele mostra a `senha_da_planilha`; copie.
2. Abra a planilha no Google Planilhas (precisa ser Planilhas Google, não .xlsx). Extensões > Apps Script. Apague o que houver e cole o conteúdo de `google-planilha/Codigo.gs`. Salve.
3. Engrenagem (Configurações do projeto) > Propriedades do script > adicione: `SUPABASE_URL` (a mesma do config.js), `SUPABASE_KEY` (a chave anon do config.js) e `SHEET_TOKEN` (a senha da etapa 1).
4. Volte à planilha, recarregue a página: aparece o menu **Rotas do CD**. Use "Atualizar agora" (aceite as permissões do Google na primeira vez) e depois "Ligar atualização automática (10 min)".

O script só preenche células vazias, procura a coluna de cada veículo pela placa no cabeçalho e ignora abas de meses futuros.

## Escala de rotas

Aba **Escala** na coordenação: escolha a semana (‹ ›). Cada dia (segunda a sábado) já vem com os blocos prontos: **CAF 11H, CAF 15H, CAF 17H, REGIÃO, ALMOX MANHÃ e ALMOX TARDE**. Em cada bloco, escolha o veículo (ou "Sem veículo" para tirar). O motorista é preenchido sozinho: é o que está vinculado àquele veículo na aba **Motoristas**. Se o veículo não tiver motorista vinculado, aparece um aviso. Para um destino fora dos blocos, use "+ Outro destino". "Copiar a semana anterior" começa de uma semana pronta, e você ajusta só o que mudou.

Os motoristas veem a aba **Escala** no app, com hoje e os próximos 14 dias. As rotas que são deles aparecem destacadas, com "Sua rota".

**Atualização:** rode `supabase/atualizacao-escala.sql` no SQL Editor (uma vez). Ele cria a tabela da escala e também completa as placas cadastradas só com 3 letras (SEY4A76, UBG2B99, UCI3F14). Depois troque os arquivos do site.

### Imagem do veículo e aceite da rota

- Na aba **Veículos** da coordenação, cada veículo tem um **Tipo** (Van, Caminhão ou Moto). Ele define a imagem na escala. Para usar as imagens do seu Canva, troque os arquivos `img/van.svg`, `img/caminhao.svg` e `img/moto.svg` (mesmo nome e formato SVG, ou ajuste o nome no código).
- Na aba **Escala** do motorista, as rotas dele têm o botão **Aceitar rota**. Na tela de Veículos também aparece um aviso quando há rota de hoje para aceitar.
- No **Painel** da coordenação aparece "Escala de hoje · X de Y aceitas", com "✔ Aceita HH:MM" ou "Aguardando aceite" em cada rota que tem motorista definido.
