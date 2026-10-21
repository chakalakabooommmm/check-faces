// sync-faces.js
const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs-node');
const faceapi = require('@vladmandic/face-api/dist/face-api.node.js');

// O robô busca a chave que está salva nos Secrets do repositório
const GOOGLE_API_KEY = 'AIzaSyCP2F0q6eyyFskTGj3jcjkhdfLP_11Wvz8';

    // Adicione quantas pastas quiser! Cada uma vira uma aba na tela.
    const FOLDERS = [
      { id: 'redcarpet',   name: 'Red Carpet',    folderId: '1h7mKXUEA6wsdD8Mf-3n7B9V-xfnM0Pg-' },
      { id: 'coquetel',  name: 'Coquetel',   folderId: '1jx6P6ZL852ti_0v3CIozJx4IjF98BQo9' },
      { id: 'exibição', name: 'Exibição', folderId: '1whd1ealZ21Yl_W1z3kw-n_pvCPY000pJ' }
    ];

const JSON_FILE = path.join(__dirname, 'faces.json');

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error('❌ ERRO: A chave GOOGLE_API_KEY não foi configurada nos Secrets do GitHub!');
    process.exit(1);
  }

  console.log('🚀 Iniciando sincronização do robô...');

  // 1. Carrega o faces.json existente (para não reprocessar fotos antigas)
  let facesDb = {};
  if (fs.existsSync(JSON_FILE)) {
    try {
      facesDb = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      console.log(`📦 Carregadas ${Object.keys(facesDb).length} fotos já mapeadas no faces.json.`);
    } catch (e) {
      console.warn('faces.json vazio ou inválido. Iniciando um novo banco...');
      facesDb = {};
    }
  }

  // 2. Busca TODAS as fotos das pastas no Google Drive (sem limite de 100)
  let allDrivePhotos = [];

  for (const folder of FOLDERS) {
    if (folder.folderId.includes('COLE_O_ID')) {
      console.error(`❌ ERRO: Você esqueceu de colocar o ID real na pasta "${folder.id}" no sync-faces.js!`);
      process.exit(1);
    }

    console.log(`📂 Buscando fotos da pasta: "${folder.id}"...`);
    const query = encodeURIComponent(`'${folder.folderId}' in parents and mimeType contains 'image/' and trashed = false`);
    let pageToken = '';
    let totalNaPasta = 0;

    // Loop de paginação para varrer mais de 100 arquivos
    do {
      const pageParam = pageToken ? `&pageToken=${pageToken}` : '';
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=1000&fields=nextPageToken,files(id,name)&key=${GOOGLE_API_KEY}${pageParam}`;
      
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        console.error(`❌ Erro do Google na pasta "${folder.id}":`, data.error.message);
        process.exit(1);
      }

      if (data.files && data.files.length > 0) {
        allDrivePhotos.push(...data.files);
        totalNaPasta += data.files.length;
      }

      pageToken = data.nextPageToken; // Se tiver mais páginas, continua buscando
    } while (pageToken);

    console.log(`   └ Encontradas ${totalNaPasta} fotos na pasta "${folder.id}".`);
  }

  // 3. Filtra apenas as fotos NOVAS que ainda não estão mapeadas
  const newPhotos = allDrivePhotos.filter(f => !facesDb[f.id]);
  console.log(`\n🔎 Total geral no Drive: ${allDrivePhotos.length} fotos.`);
  console.log(`🆕 Fotos novas para mapear nesta rodada: ${newPhotos.length} fotos.`);

  if (newPhotos.length === 0) {
    console.log('✅ Tudo em dia! Nenhuma foto nova para processar.');
    return;
  }

  // 4. Carrega as Redes Neurais do Face-API
  const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
  console.log('🧠 Carregando modelos neurais de reconhecimento...');
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

  // 5. Processa cada foto nova
  let count = 0;
  for (const file of newPhotos) {
    count++;
    console.log(`[${count}/${newPhotos.length}] Analisando rosto em: ${file.name}`);

    try {
      const resImg = await fetch(`https://lh3.googleusercontent.com/d/${file.id}=w800`);
      const buffer = await resImg.arrayBuffer();
      
      // Decodifica a imagem direto na memória do servidor (sem precisar de tela/navegador)
      const tensor = tf.node.decodeImage(new Uint8Array(buffer), 3);
      const detections = await faceapi.detectAllFaces(tensor).withFaceLandmarks().withFaceDescriptors();
      tensor.dispose(); // Libera a memória imediatamente

      // Salva os vetores dos rostos encontrados nesta foto
      facesDb[file.id] = detections.map(d => Array.from(d.descriptor));
    } catch (err) {
      console.warn(`⚠️ Não foi possível processar a imagem "${file.name}":`, err.message);
    }

    // Salva o arquivo a cada 20 fotos para não perder o progresso caso demore
    if (count % 20 === 0) {
      fs.writeFileSync(JSON_FILE, JSON.stringify(facesDb), 'utf8');
    }
  }

  // 6. Grava o resultado final consolidado no faces.json
  fs.writeFileSync(JSON_FILE, JSON.stringify(facesDb), 'utf8');
  console.log(`\n🎉 Sucesso! faces.json atualizado com ${Object.keys(facesDb).length} fotos no total.`);
}

main().catch(err => {
  console.error('❌ Falha inesperada durante a execução:', err);
  process.exit(1);
});
