// sync-faces.js
const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs-node');
const faceapi = require('@vladmandic/face-api/dist/face-api.node.js');

// 1. Carrega as configurações e eventos cadastrados no eventos.js
let EVENTOS = [];
let CONFIG_KEY = '';

try {
  const config = require('./eventos.js');
  EVENTOS = config.EVENTOS || [];
  CONFIG_KEY = config.GOOGLE_API_KEY || '';
} catch (e) {
  console.error('❌ ERRO: Não foi possível ler o arquivo eventos.js:', e.message);
  process.exit(1);
}

// Prioriza a chave segura dos Secrets do GitHub; se não achar, usa a do eventos.js
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || CONFIG_KEY;
const JSON_FILE = path.join(__dirname, 'faces.json');

async function main() {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY === 'SUA_CHAVE_API_AQUI') {
    console.error('❌ ERRO: Chave GOOGLE_API_KEY não configurada no GitHub Secrets nem no eventos.js!');
    process.exit(1);
  }

  console.log('🚀 Iniciando sincronização inteligente do robô...');

  // 2. Extrai todas as pastas de todos os eventos cadastrados
  const FOLDERS = EVENTOS.flatMap(evento => {
    return (evento.folders || []).map(f => ({
      ...f,
      eventoNome: evento.nome,
      eventoId: evento.id
    }));
  });

  if (FOLDERS.length === 0) {
    console.warn('⚠️ Nenhuma pasta cadastrada no eventos.js. Encerrando execução.');
    return;
  }

  console.log(`📋 Encontrados ${EVENTOS.length} evento(s) com um total de ${FOLDERS.length} pasta(s) para monitorar.`);

  // 3. Carrega o faces.json existente (para reaproveitar fotos já mapeadas)
  let facesDb = {};
  if (fs.existsSync(JSON_FILE)) {
    try {
      facesDb = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      console.log(`📦 Carregadas ${Object.keys(facesDb).length} fotos já mapeadas no faces.json.`);
    } catch (e) {
      console.warn('faces.json vazio ou inválido. Criando uma nova base...');
      facesDb = {};
    }
  }

  // 4. Varre todas as pastas no Google Drive com suporte a mais de 100 fotos (Paginação)
  let allDrivePhotos = [];

  for (const folder of FOLDERS) {
    if (!folder.folderId || folder.folderId.includes('COLE_O_ID')) {
      console.warn(`⚠️ Pulando pasta "${folder.name}" (${folder.eventoNome}): ID da pasta não configurado.`);
      continue;
    }

    console.log(`📂 Lendo pasta "${folder.name}" do evento "${folder.eventoNome}"...`);
    const query = encodeURIComponent(`'${folder.folderId}' in parents and mimeType contains 'image/' and trashed = false`);
    let pageToken = '';
    let countPasta = 0;

    do {
      const pageParam = pageToken ? `&pageToken=${pageToken}` : '';
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=1000&fields=nextPageToken,files(id,name)&key=${GOOGLE_API_KEY}${pageParam}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        console.error(`❌ Erro na pasta "${folder.name}":`, data.error.message);
        break;
      }

      if (data.files && data.files.length > 0) {
        allDrivePhotos.push(...data.files);
        countPasta += data.files.length;
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    console.log(`   └ ${countPasta} foto(s) encontrada(s).`);
  }

  // Remove eventuais fotos duplicadas se a mesma foto/pasta for listada duas vezes
  const uniquePhotosMap = new Map();
  allDrivePhotos.forEach(p => uniquePhotosMap.set(p.id, p));
  const uniquePhotos = Array.from(uniquePhotosMap.values());

  // 5. Filtra SOMENTE as fotos novas que ainda não estão mapeadas
  const newPhotos = uniquePhotos.filter(f => !facesDb[f.id]);
  console.log(`\n🔎 Total geral no Google Drive: ${uniquePhotos.length} fotos.`);
  console.log(`🆕 Fotos novas para analisar agora: ${newPhotos.length} fotos.`);

  if (newPhotos.length === 0) {
    console.log('✅ Tudo atualizado! Nenhuma foto nova para processar.');
    return;
  }

  // 6. Carrega os Modelos Neurais do Face-API
  const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
  console.log('\n🧠 Carregando inteligência artificial facial...');
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

  // 7. Processa foto por foto
  let count = 0;
  for (const file of newPhotos) {
    count++;
    console.log(`[${count}/${newPhotos.length}] Analisando rosto em: ${file.name}`);

    try {
      const resImg = await fetch(`https://lh3.googleusercontent.com/d/${file.id}=w800`);
      const buffer = await resImg.arrayBuffer();

      // Decodifica a imagem direto na memória do servidor
      const tensor = tf.node.decodeImage(new Uint8Array(buffer), 3);
      const detections = await faceapi.detectAllFaces(tensor).withFaceLandmarks().withFaceDescriptors();
      tensor.dispose(); // Libera memória RAM imediatamente

      // Salva os vetores encontrados
      facesDb[file.id] = detections.map(d => Array.from(d.descriptor));
    } catch (err) {
      console.warn(`⚠️ Não foi possível processar "${file.name}":`, err.message);
    }

    // Grava no disco a cada 20 fotos para garantir progresso seguro
    if (count % 20 === 0) {
      fs.writeFileSync(JSON_FILE, JSON.stringify(facesDb), 'utf8');
      console.log(`💾 Progresso salvo (${count}/${newPhotos.length})...`);
    }
  }

  // 8. Salva o faces.json final consolidado
  fs.writeFileSync(JSON_FILE, JSON.stringify(facesDb), 'utf8');
  console.log(`\n🎉 Concluído com sucesso! faces.json agora contém ${Object.keys(facesDb).length} fotos mapeadas.`);
}

main().catch(err => {
  console.error('❌ Falha inesperada durante a execução:', err);
  process.exit(1);
});
