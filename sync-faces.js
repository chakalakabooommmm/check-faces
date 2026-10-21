// sync-faces.js
const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs-node');
const faceapi = require('@vladmandic/face-api/dist/face-api.node.js');

// 1. Carrega o eventos.js
let EVENTOS = [];
let CONFIG_KEY = '';

try {
  const config = require('./eventos.js');
  EVENTOS = config.EVENTOS || [];
  CONFIG_KEY = config.GOOGLE_API_KEY || '';
} catch (e) {
  console.error('❌ ERRO ao carregar eventos.js:', e.message);
  process.exit(1);
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || CONFIG_KEY;
const JSON_FILE = path.join(__dirname, 'faces.json');

async function main() {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY === 'AIzaSyCP2F0q6eyyFskTGj3jcjkhdfLP_11Wvz8') {
    console.error('❌ ERRO: Chave GOOGLE_API_KEY não configurada!');
    process.exit(1);
  }

  console.log('🚀 Iniciando o robô de mapeamento facial...');

  // 2. Carrega o faces.json existente
  let facesDb = {};
  if (fs.existsSync(JSON_FILE)) {
    try {
      facesDb = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      console.log(`📦 Carregadas ${Object.keys(facesDb).length} fotos já mapeadas no faces.json.`);
    } catch (e) {
      facesDb = {};
    }
  }

  // 3. Varre cada evento e descobre as subpastas automaticamente
  let allDrivePhotos = [];

  for (const evento of EVENTOS) {
    if (!evento.folderId || evento.folderId.includes('COLE_')) {
      console.warn(`⚠️ Pulando evento "${evento.nome}": folderId não configurado.`);
      continue;
    }

    console.log(`\n📂 Verificando evento: "${evento.nome}"...`);

    // Busca as subpastas que existem dentro da pasta do evento
    const queryPastas = encodeURIComponent(`'${evento.folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const urlPastas = `https://www.googleapis.com/drive/v3/files?q=${queryPastas}&fields=files(id,name)&key=${GOOGLE_API_KEY}`;
    
    let subpastas = [];
    try {
      const resPastas = await fetch(urlPastas);
      const dataPastas = await resPastas.json();
      subpastas = dataPastas.files || [];
    } catch (err) {
      console.error(`Erro ao buscar subpastas do evento "${evento.nome}":`, err.message);
    }

    // Se não houver subpastas, busca fotos soltas na pasta do evento
    if (subpastas.length === 0) {
      subpastas = [{ id: evento.folderId, name: 'Geral' }];
    }

    console.log(`   └ Encontradas ${subpastas.length} galeria(s) neste evento.`);

    // Busca todas as fotos de cada subpasta com paginação
    for (const pasta of subpastas) {
      console.log(`   └ Lendo fotos de: "${pasta.name}"...`);
      const queryFotos = encodeURIComponent(`'${pasta.id}' in parents and mimeType contains 'image/' and trashed = false`);
      let pageToken = '';
      let totalNaPasta = 0;

      do {
        const pageParam = pageToken ? `&pageToken=${pageToken}` : '';
        const urlFotos = `https://www.googleapis.com/drive/v3/files?q=${queryFotos}&pageSize=1000&fields=nextPageToken,files(id,name)&key=${GOOGLE_API_KEY}${pageParam}`;
        
        try {
          const resFotos = await fetch(urlFotos);
          const dataFotos = await resFotos.json();
          if (dataFotos.files && dataFotos.files.length > 0) {
            allDrivePhotos.push(...dataFotos.files);
            totalNaPasta += dataFotos.files.length;
          }
          pageToken = dataFotos.nextPageToken;
        } catch (e) {
          console.warn(`Erro na leitura de fotos de "${pasta.name}":`, e.message);
          break;
        }
      } while (pageToken);

      console.log(`      └ ${totalNaPasta} foto(s) encontrada(s).`);
    }
  }

  // Remove eventuais fotos repetidas
  const uniquePhotosMap = new Map();
  allDrivePhotos.forEach(p => uniquePhotosMap.set(p.id, p));
  const uniquePhotos = Array.from(uniquePhotosMap.values());

  // 4. Filtra fotos pendentes
  const newPhotos = uniquePhotos.filter(f => !facesDb[f.id]);
  console.log(`\n🔎 Total geral no Google Drive: ${uniquePhotos.length} fotos.`);
  console.log(`🆕 Fotos novas para analisar: ${newPhotos.length} fotos.`);

  if (newPhotos.length === 0) {
    console.log('✅ Tudo em dia! Nenhuma foto nova para processar.');
    return;
  }

  // 5. Carrega os modelos neurais
  const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
  console.log('\n🧠 Carregando IA facial...');
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

  // 6. Processa cada foto nova
  let count = 0;
  for (const file of newPhotos) {
    count++;
    console.log(`[${count}/${newPhotos.length}] Analisando rosto em: ${file.name}`);

    try {
      const resImg = await fetch(`https://lh3.googleusercontent.com/d/${file.id}=w800`);
      const buffer = await resImg.arrayBuffer();

      const tensor = tf.node.decodeImage(new Uint8Array(buffer), 3);
      const detections = await faceapi.detectAllFaces(tensor).withFaceLandmarks().withFaceDescriptors();
      tensor.dispose();

      facesDb[file.id] = detections.map(d => Array.from(d.descriptor));
    } catch (err) {
      console.warn(`⚠️ Não foi possível processar "${file.name}":`, err.message);
    }

    if (count % 20 === 0) {
      fs.writeFileSync(JSON_FILE, JSON.stringify(facesDb), 'utf8');
      console.log(`💾 Progresso salvo (${count}/${newPhotos.length})...`);
    }
  }

  // 7. Salva o resultado final
  fs.writeFileSync(JSON_FILE, JSON.stringify(facesDb), 'utf8');
  console.log(`\n🎉 Concluído com sucesso! faces.json atualizado com ${Object.keys(facesDb).length} fotos no total.`);
}

main().catch(err => {
  console.error('❌ Falha inesperada:', err);
  process.exit(1);
});
