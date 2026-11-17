# App Android do Rotas do CD (com localização durante a rota)

O app é uma "casca" que abre o seu site do GitHub Pages e liga a localização em segundo plano
enquanto a rota do motorista está iniciada. Como ele abre o site, **toda atualização do site
chega ao app sozinha**, sem reinstalar. Só é preciso gerar um APK novo se mudar algo desta pasta.

## 1. Atualizar o banco (uma vez)

No Supabase, abra **SQL Editor**, cole o arquivo `atualizacao-localizacao.sql` e clique em **Run**.
Isso cria a tabela de pontos, o aviso de aceite e a limpeza automática de 30 dias.
(Se o Supabase avisar que o `pg_cron` não está disponível, tudo bem: use o botão
"Apagar pontos com mais de 30 dias" na aba **Mapa**, de vez em quando.)

## 2. Subir os arquivos no GitHub

Suba para o mesmo repositório do site, mantendo as pastas:

- os arquivos do site que mudaram: `index.html`, `coordenacao.html`, `motorista.js`,
  `coordenacao.js`, `tracking.js` (novo), `style.css`
- a pasta `app-android/` inteira
- o arquivo `.github/workflows/gerar-apk.yml`

Depois diga ao GitHub qual é o endereço do seu site:

1. No repositório: **Settings > Secrets and variables > Actions > aba Variables > New repository variable**
2. Nome: `SITE_URL`
3. Valor: o endereço do site dos motoristas, terminando em barra, por exemplo
   `https://seu-usuario.github.io/rotas-cd/`

## 3. Gerar o APK

1. No repositório, abra a aba **Actions**.
2. Escolha **Gerar APK** na lista da esquerda e clique em **Run workflow**.
3. Espere uns 5 a 10 minutos até aparecer o visto verde.
4. Abra a execução e, no fim da página, em **Artifacts**, baixe **rotas-cd-apk**. Dentro do zip
   está o `app-debug.apk`.

Se aparecer um X vermelho, abra a execução, copie a mensagem do passo que falhou e me envie.

## 4. Instalar nos celulares

1. Envie o `app-debug.apk` aos motoristas (WhatsApp ou Drive).
2. No celular, abrir o arquivo. O Android pede para permitir a instalação "de fontes desconhecidas"
   para aquele app (WhatsApp, Drive ou Chrome). Permitir. O Play Protect pode avisar que o app
   não é conhecido: escolher **Instalar mesmo assim**.
3. Abrir o **Rotas do CD**, entrar com o login de sempre.
4. Ao iniciar a primeira rota aparece o **aviso de localização**. Tocar em **Entendi e aceito**
   e **permitir a localização** quando o Android perguntar (se aparecer "Permitir o tempo todo",
   escolher essa).
5. Desligar a economia de bateria do app (veja o PDF dos motoristas). É o passo que mais evita
   falhas em celulares Xiaomi, Realme, Samsung e Motorola.

## Como funciona

- A posição é gravada **no máximo 1 vez por minuto**, e só enquanto a rota está aberta.
  Ao finalizar a rota, a gravação para.
- Aparece uma notificação fixa "Rotas do CD: rota em andamento". É exigência do Android
  e não pode ser escondida.
- Sem internet, os pontos ficam guardados no celular e são enviados quando a conexão volta.
- A coordenação vê tudo na aba **Mapa**: posição de cada veículo em rota, há quanto tempo foi
  enviada e o trajeto. Mais antigo que 30 dias é apagado.
- Quem usa o site no navegador (sem o app) também grava, mas só com a tela ligada e o
  site aberto.

## Primeiro teste (importante)

Não consegui testar em celular de verdade. Antes de liberar para todos, instale em **um**
celular e faça uma rota curta (10 a 15 minutos): bloqueie a tela, abra o Waze, ande um pouco.
Depois veja na aba **Mapa** se o trajeto ficou contínuo. Se tiver buracos, me diga a marca e
o modelo do celular.
