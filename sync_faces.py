import os
import json
import subprocess
import requests
import numpy as np
import cv2
import insightface
from insightface.app import FaceAnalysis

# 1. Carrega as configurações do eventos.js automaticamente
try:
    cmd = ["node", "-e", "console.log(JSON.stringify(require('./eventos.js')) )"]
    resultado = subprocess.run(cmd, capture_output=True, text=True, check=True)
    config = json.loads(resultado.stdout)
    EVENTOS = config.get("EVENTOS", [])
    CONFIG_KEY = config.get("GOOGLE_API_KEY", "")
except Exception as e:
    print(f"❌ Erro ao ler eventos.js: {e}")
    exit(1)

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY") or CONFIG_KEY

if not GOOGLE_API_KEY or "COLE_" in GOOGLE_API_KEY:
    print("❌ GOOGLE_API_KEY não configurada!")
    exit(1)

# 2. Inicializa o InsightFace (RetinaFace + ArcFace)
print("🧠 Carregando modelo do InsightFace (Buffalo_L)...")
app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

def buscar_fotos_da_pasta(folder_id):
    """Busca todas as imagens dentro de uma pasta do Google Drive."""
    query = f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false"
    url_base = f"https://www.googleapis.com/drive/v3/files?q={requests.utils.quote(query)}&pageSize=1000&fields=nextPageToken,files(id,name)&key={GOOGLE_API_KEY}"
    
    fotos = []
    page_token = ""
    while True:
        url = url_base + (f"&pageToken={page_token}" if page_token else "")
        res = requests.get(url).json()
        if "files" in res:
            fotos.extend(res["files"])
        page_token = res.get("nextPageToken")
        if not page_token:
            break
    return fotos

def buscar_subpastas(parent_id):
    """Identifica subpastas (ex: galerias) dentro da pasta do evento."""
    query = f"'{parent_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    url = f"https://www.googleapis.com/drive/v3/files?q={requests.utils.quote(query)}&fields=files(id,name)&key={GOOGLE_API_KEY}"
    res = requests.get(url).json()
    return res.get("files", [])

# 3. Processa cada evento separadamente
for evento in EVENTOS:
    evento_id = evento.get("id")
    folder_id = evento.get("folderId")
    json_path = f"faces-{evento_id}.json"

    print(f"\n📂 =========================================")
    print(f"📂 Processando Evento: {evento.get('nome')} ({evento_id})")
    print(f"📂 =========================================")

    # Carrega banco existente para não reprocessar fotos já analisadas
    faces_db = {}
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                faces_db = json.load(f)
            print(f"📦 {len(faces_db)} fotos já cadastradas anteriormente.")
        except Exception:
            faces_db = {}

    subpastas = buscar_subpastas(folder_id)
    if not subpastas:
        subpastas = [{"id": folder_id, "name": "Principal"}]

    todas_fotos = []
    for sub in subpastas:
        print(f"   └ Vasculhando galeria: {sub['name']}...")
        fotos_sub = buscar_fotos_da_pasta(sub["id"])
        todas_fotos.extend(fotos_sub)

    # Remove possíveis duplicadas
    fotos_unicas = {f["id"]: f for f in todas_fotos}.values()
    fotos_novas = [f for f in fotos_unicas if f["id"] not in faces_db]

    print(f"   └ Total no Drive: {len(fotos_unicas)} | Fotos novas a analisar: {len(fotos_novas)}")

    if not fotos_novas:
        print("   ✅ Todas as fotos deste evento já estão analisadas!")
        continue

    # Analisa cada foto nova com o InsightFace
    contador = 0
    for foto in fotos_novas:
        contador += 1
        foto_id = foto["id"]
        foto_nome = foto["name"]
        print(f"[{contador}/{len(fotos_novas)}] Analisando: {foto_nome}")

        try:
            # Baixa imagem em resolução w1200
            img_url = f"https://lh3.googleusercontent.com/d/{foto_id}=w1200"
            resp = requests.get(img_url, timeout=15)
            if resp.status_code != 200:
                print(f"   ⚠️ Falha ao baixar {foto_nome} (HTTP {resp.status_code})")
                continue

            # Decodifica para formato OpenCV
            img_array = np.frombuffer(resp.content, dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

            if img is None:
                continue

            # Extrai os rostos com InsightFace
            faces = app.get(img)
            print(f"   └ {len(faces)} rosto(s) encontrado(s).")

            # Salva os 512 números arredondados para 4 casas decimais (arquivo super leve!)
            faces_db[foto_id] = [
                [round(float(val), 4) for val in face.normed_embedding]
                for face in faces
            ]

        except Exception as err:
            print(f"   ⚠️ Erro ao processar {foto_nome}: {err}")

        # Salva o arquivo a cada 15 fotos para não perder progresso
        if contador % 15 == 0:
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(faces_db, f)
            print(f"💾 Progresso parcial salvo em {json_path}...")

    # Salva o arquivo final do evento
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(faces_db, f)
    print(f"🎉 Evento {evento_id} concluído! Salvo em {json_path}.")

print("\n🚀 Todos os eventos foram sincronizados com sucesso!")
