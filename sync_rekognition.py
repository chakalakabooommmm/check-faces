import os
import json
import subprocess
import requests
import boto3
from botocore.exceptions import ClientError

def log(msg):
    print(msg, flush=True)

# 1. Carrega as configurações do eventos.js
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

# 2. Conecta com a AWS Rekognition
rekognition = boto3.client(
    'rekognition',
    region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1'),
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY')
)

INDEX_FILE = "indexed.json"

# Carrega histórico de fotos já indexadas
indexed_db = {}
if os.path.exists(INDEX_FILE):
    try:
        with open(INDEX_FILE, "r", encoding="utf-8") as f:
            indexed_db = json.load(f)
    except Exception:
        indexed_db = {}

def garantir_colecao(collection_id):
    """Cria a coleção na AWS se ela ainda não existir."""
    try:
        rekognition.create_collection(CollectionId=collection_id)
        log(f"📦 Coleção '{collection_id}' criada na AWS com sucesso.")
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceAlreadyExistsException':
            pass
        else:
            log(f"⚠️ Erro ao verificar coleção: {e}")

def buscar_fotos_da_pasta(folder_id):
    """Busca fotos do Drive."""
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
    """Identifica subpastas."""
    query = f"'{parent_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    url = f"https://www.googleapis.com/drive/v3/files?q={requests.utils.quote(query)}&fields=files(id,name)&key={GOOGLE_API_KEY}"
    try:
        res = requests.get(url, timeout=20).json()
        return res.get("files", [])
    except Exception as e:
        log(f"   ⚠️ Erro ao listar subpastas: {e}")
        return []

# 3. Processa cada evento
for evento in EVENTOS:
    evento_id = evento.get("id")
    folder_id = evento.get("folderId")
    
    # ID da coleção na AWS (apenas letras, números, traços e underscores)
    collection_id = f"galeria_{evento_id}".replace(".", "_")

    log(f"\n📂 =========================================")
    log(f"📂 Evento: {evento.get('nome')} | Coleção AWS: {collection_id}")
    log(f"📂 =========================================")

    garantir_colecao(collection_id)

    if evento_id not in indexed_db:
        indexed_db[evento_id] = []

    subpastas = buscar_subpastas(folder_id)
    if not subpastas:
        subpastas = [{"id": folder_id, "name": "Principal"}]

    todas_fotos = []
    for sub in subpastas:
        log(f"   └ Vasculhando: {sub['name']}...")
        todas_fotos.extend(buscar_fotos_da_pasta(sub["id"]))

    fotos_unicas = {f["id"]: f for f in todas_fotos}.values()
    fotos_novas = [f for f in fotos_unicas if f["id"] not in indexed_db[evento_id]]

    log(f"   └ Total no Drive: {len(fotos_unicas)} | Novas para a AWS: {len(fotos_novas)}")

    if not fotos_novas:
        log("   ✅ Todas as fotos já catalogadas na AWS!")
        continue

    contador = 0
    for foto in fotos_novas:
        contador += 1
        foto_id = foto["id"]
        foto_nome = foto["name"]
        log(f"[{contador}/{len(fotos_novas)}] Indexando na AWS: {foto_nome}")

        try:
            # Baixa a foto do Drive (w1000 é leve e perfeito para a AWS)
            img_url = f"https://lh3.googleusercontent.com/d/{foto_id}=w1000"
            resp = requests.get(img_url, timeout=15)
            if resp.status_code != 200:
                continue

            # Envia a foto direto para a AWS Rekognition
            rek_res = rekognition.index_faces(
                CollectionId=collection_id,
                Image={'Bytes': resp.content},
                ExternalImageId=foto_id, # Associa o ID do Google Drive à foto
                DetectionAttributes=['DEFAULT'],
                QualityFilter='AUTO',
                MaxFaces=50
            )

            faces_encontradas = len(rek_res.get('FaceRecords', []))
            log(f"   └ {faces_encontradas} rosto(s) cadastrado(s) com sucesso na AWS.")
            indexed_db[evento_id].append(foto_id)

        except Exception as err:
            log(f"   ⚠️ Erro ao indexar {foto_nome}: {err}")

        # Salva o arquivo de controle a cada 20 fotos
        if contador % 20 == 0:
            with open(INDEX_FILE, "w", encoding="utf-8") as f:
                json.dump(indexed_db, f)

    # Salva o resultado final do evento
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(indexed_db, f)

log("\n🚀 Concluído! Todas as fotos estão gravadas na inteligência da AWS!")
