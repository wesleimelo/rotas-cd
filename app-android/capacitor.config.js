// O app abre o site do sistema (GitHub Pages). Assim, quando você atualiza o site, o app atualiza junto.
// O endereço vem da variável SITE_URL (veja o passo a passo em app-android/LEIA-ME.md).
const url = (process.env.SITE_URL || '').trim();
if (!url.startsWith('https://')) {
  throw new Error('Defina SITE_URL com o endereço do site, começando com https:// (ex.: https://seu-usuario.github.io/rotas-cd/)');
}
module.exports = {
  appId: 'br.com.biologistica.rotascd',
  appName: 'Rotas do CD',
  webDir: 'www',
  server: { url: url.endsWith('/') ? url : url + '/', cleartext: false },
  android: {
    // Necessário para o plugin de localização continuar enviando com a tela apagada.
    useLegacyBridge: true
  }
};
