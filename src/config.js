// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Valores padrão. Tudo pode ser mudado na tela "Configurar" do app (fica salvo no celular).
export const PADRAO = {
  // Client ID OAuth do Google (tipo "Aplicativo da Web"). Veja o README, seção "Google".
  // Preencher aqui evita digitar no celular; não é segredo (fica visível no navegador de qualquer forma).
  clienteId: '',
  // link da planilha. Na publicação vem da variável POKESCAN_PLANILHA do repositório (não fica no código);
  // se o link tiver "gid=", a aba é escolhida sozinha depois do login (ou use POKESCAN_ABA)
  planilha: '',
  aba: '',
  estado: 'NM',
  idioma: '', // vazio = detectar pela foto
  extra: 'Normal', // coluna Extra (Foil, Reverse Foil...)
  // URL do intermediário de imagens (proxy/AppsScript_imagens.gs): permite ler o idioma das edições sugeridas
  // (não é segredo: só repassa imagens do servidor da Liga)
  proxyImagens: 'https://script.google.com/macros/s/AKfycbwjPirts9jQFRIsy3oit_d6n82RfTTh-7FJclycDKRH73ycMh5oCU4x-p69AkUM7fAF/exec',
  nomeEmIngles: false, // gravar o nome em inglês em vez do nome da Liga (português quando existe)
  salvarDireto: false, // gravar sem revisar quando a leitura tiver confiança alta
  salvarFoto: false, // salvar a foto da carta no Google Drive (na pasta abaixo)
  // link da pasta do Drive para as fotos. Na publicação vem da variável POKESCAN_PASTA_DRIVE (não fica no código)
  pastaDrive: '',
};

export const ESTADOS = ['M', 'NM', 'SP', 'MP', 'HP', 'D'];
