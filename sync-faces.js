const fs = require('fs');
const path = require('path');
const faceapi = require('@vladmandic/face-api');
const tf = require('@tensorflow/tfjs');

// O robô pega a chave que você salvou no Passo 3
const GOOGLE_API_KEY = 'AIzaSyCP2F0q6eyyFskTGj3jcjkhdfLP_11Wvz8';

    // Adicione quantas pastas quiser! Cada uma vira uma aba na tela.
    const FOLDERS = [
      { id: 'redcarpet',   name: 'Red Carpet',    folderId: '1h7mKXUEA6wsdD8Mf-3n7B9V-xfnM0Pg-' },
      { id: 'coquetel',  name: 'Coquetel',   folderId: '1jx6P6ZL852ti_0v3CIozJx4IjF98BQo9' },
      { id: 'exibição', name: 'Exibição', folderId: '1whd1ealZ21Yl_W1z3kw-n_pvCPY000pJ' }
    ];

const JSON_FILE = path.join(__dirname, 'faces.json');

async function main() {
  console.log('Iniciando checagem de novas fotos...');

  let facesDb = {};
  if (fs.existsSync(JSON_FILE)) {
    try {
      facesDb = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      console.log(`Carregadas ${Object.keys(facesDb).length} fotos já mapeadas.`);
    } catch (e) {
      facesDb = {};
    }
  }

  let allDrivePhotos = [];
  for (const folder of FOLDERS) {
    const query = encodeURIComponent(`'${folder.folderId}' in parents and mimeType contains 'image/' and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.files) allDrivePhotos.push(...data.files);
  }

  const newPhotos = allDrivePhotos.filter(f => !facesDb[f.id]);
  console.log(`Fotos novas para mapear: ${newPhotos.length}`);

  if (newPhotos.length === 0) {
    console.log('Tudo em dia! Nenhuma foto nova encontrada.');
    return;
  }

  const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

  let count = 0;
  for (const file of newPhotos) {
    count++;
    console.log(`[${count}/${newPhotos.length}] Analisando rosto em: ${file.name}`);
    try {
      const img = await faceapi.fetchImage(`https://lh3.googleusercontent.com/d/${file.id}=w800`);
      const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
      facesDb[file.id] = detections.map(d => Array.from(d.descriptor));
    } catch (err) {
      console.warn(`Erro na foto ${file.name}:`, err.message);
    }
  }

  fs.writeFileSync(JSON_FILE, JSON.stringify(facesDb), 'utf8');
  console.log('faces.json salvo com sucesso!');
}

main().catch(console.error);
