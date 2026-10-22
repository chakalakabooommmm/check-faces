import os
import json
import subprocess
import requests
import numpy as np
import cv2
import insightface
from insightface.app import FaceAnalysis

# Força o print a aparecer no log do GitHub Actions na mesma hora
def log(msg):
    print(msg, flush=True)

# 1. Carrega as configurações do eventos.js automaticamente
try:
    cmd = ["node", "-e", "console.log(JSON.stringify(require('./eventos.js')) )"]
    resultado = subprocess.run(cmd, capture_output=True, text=True, check=True)
    config = json.loads(resultado.stdout)
    EVENTOS = config.get("EVENTOS", [])
    CONFIG_KEY = config.get("GOOGLE_API_KEY", "")
except Exception as e:
    log(f"❌ Erro ao ler eventos.js: {e}")
    exit(1)

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY") or CONFIG_KEY

if not GOOGLE_API_KEY or "COLE_" in GOOGLE_API_KEY:
    log("❌ GOOGLE_API_KEY não configurada!")
    exit(1)

# 2. Inicializa o InsightFace OTIMIZADO PARA CPU (buffalo_sc + apenas detecção e reconhecimento)
log("🧠 Carregando modelo ultrarrápido do InsightFace (buffalo_sc)...")
app = FaceAnalysis(
    name='buffalo_sc',
    allowed_modules=['detection', 'recognition'],
    providers=['CPUExecutionProvider']
)
app.prepare(ctx_id=0, det_size=(640, 640))

def buscar_fotos_da_pasta(folder_id):
    """Busca todas as imagens dentro de uma pasta do Google Drive."""
    query = f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false"
    url_base = f"https://www.googleapis.com/drive/v3/files?q={requests.utils.quote(query)}&pageSize=1000&fields=nextPageToken,files(id,name)&key={GOOGLE_API_KEY}"
    
    fotos = []
    page_token = ""
    while True:
        url = url_base + (f"&pageToken={page_token}" if page_token else "")
        try:
            res = requests.get(url, timeout=20).json()
            if "files" in res:
                fotos.extend(res["files"])
            page_token = res.get("nextPageToken")
            if not page_token:
                break
        except Exception as e:
            log(f"   ⚠️ Erro ao listar fotos da pasta {folder_id}: {e}")
            break
    return fotos

def buscar_subpastas(parent_id):
    """Identifica subpastas (ex: galerias) dentro da pasta do evento."""
    query = f"'{parent_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    url = f"https://www.googleapis.com/drive/v3/files?q={requests.utils.quote(query)}&fields=files(id,name)&key={GOOGLE_API_KEY}"
    try:
        res = requests.get(url, timeout=20).json()
        return res.get("files", [])
    except Exception as e:
        log(f"   ⚠️ Erro ao listar subpastas: {e}")
        return []

# 3. Processa cada evento separadamente
for evento in EVENTOS:
    evento_id = evento.get("id")
    folder_id = evento.get("folderId")
    json_path = f"faces-{evento_id}.json"

    log(f"\n📂 =========================================")
    log(f"📂 Processando Evento: {evento.get('nome')} ({evento_id})")
    log(f"📂 =========================================")

    # Carrega banco existente para não reprocessar fotos já analisadas
    faces_db = {}
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                faces_db = json.load(f)
            log(f"📦 {len(faces_db)} fotos já cadastradas anteriormente.")
        except Exception:
            faces_db = {}

    subpastas = buscar_subpastas(folder_id)
    if not subpastas:
        subpastas = [{"id": folder_id, "name": "Principal"}]

    todas_fotos = []
    for sub in subpastas:
        log(f"   └ Vasculhando galeria: {sub['name']}...")
        fotos_sub = buscar_fotos_da_pasta(sub["id"])
        todas_fotos.extend(fotos_sub)

    # Remove fotos duplicadas
    fotos_unicas = {f["id"]: f for f in todas_fotos}.values()
    fotos_novas = [f for f in fotos_unicas if f["id"] not in faces_db]

    log(f"   └ Total no Drive: {len(fotos_unicas)} | Fotos novas a analisar: {len(fotos_novas)}")

    if not fotos_novas:
        log("   ✅ Todas as fotos deste evento já estão analisadas!")
        continue

    # Analisa cada foto nova com o InsightFace otimizado
    contador = 0
    for foto in fotos_novas:
        contador += 1
        foto_id = foto["id"]
        foto_nome = foto["name"]
        log(f"[{contador}/{len(fotos_novas)}] Analisando: {foto_nome}")

        try:
            # Baixa imagem em tamanho ideal para a IA
            img_url = f"https://lh3.googleusercontent.com/d/{foto_id}=w1000"
            resp = requests.get(img_url, timeout=15)
            if resp.status_code != 200:
                log(f"   ⚠️ Falha ao baixar {foto_nome} (HTTP {resp.status_code})")
                continue

            # Decodifica para formato de imagem
            img_array = np.frombuffer(resp.content, dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

            if img is None:
                continue

            # Extrai os rostos com InsightFace
            faces = app.get(img)
            log(f"   └ {len(faces)} rosto(s) encontrado(s).")

            # Salva os 512 números arredondados para 4 casas decimais
            faces_db[foto_id] = [
                [round(float(val), 4) for val in face.normed_embedding]
                for face in faces
            ]

        except Exception as err:
            log(f"   ⚠️ Erro ao processar {foto_nome}: {err}")

        # Salva o arquivo a cada 15 fotos para garantir progresso seguro
        if contador % 15 == 0:
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(faces_db, f)
            log(f"💾 Progresso parcial salvo em {json_path}...")

    # Salva o arquivo final do evento
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(faces_db, f)
    log(f"🎉 Evento {evento_id} concluído! Salvo em {json_path}.")

log("\n🚀 Todos os eventos foram sincronizados com sucesso!")
