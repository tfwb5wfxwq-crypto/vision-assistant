# Vision Assistant - Assistant Pédagogique Visuel

## Architecture

```
Flic 2 (poche) ──BLE keyboard──→ iPhone (poche)
                                      │
                               PWA écoute keydown
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                                   │
              CLIC SIMPLE                         APPUI LONG 2s+
                    │                                   │
           1 photo JPEG                          burst photos
                    │                            + audio micro
                    │                                   │
                    └──────────────┬────────────────────┘
                                   │
                            POST /analyze (4G)
                                   ↓
                         Serveur (Render)
                         Claude Vision + TTS
                                   │
                                 MP3
                                   ↓
                    iPhone ──Bluetooth──→ Oreillette
```

## Composants

| # | Composant | Dossier | Hébergement |
|---|-----------|---------|-------------|
| 1 | Serveur Node.js | `/server` | Render |
| 2 | PWA | `/pwa` | GitHub Pages |
| 3 | Firmware Arduino | `/firmware` | Flash XIAO |

## Matériel (~66€)

- **XIAO ESP32S3 Sense** (~18€) - caméra + micro inclus
- **Batterie LiPo 250mAh** (~8€)
- **Flic 2 Button** (~30€)
- **SZHTFX Mini Earbud** (~10€)

## Déploiement

### 1. Serveur (Render)

```bash
cd server
# Créer un repo GitHub
git init && git add . && git commit -m "init"
git remote add origin https://github.com/USER/vision-assistant-server.git
git push -u origin main

# Sur Render.com:
# - New Web Service → Connect GitHub repo
# - Environment: Node
# - Build: npm install
# - Start: npm start
# - Variables:
#   ANTHROPIC_API_KEY=sk-ant-...
#   OPENAI_API_KEY=sk-...
```

### 2. PWA (GitHub Pages)

```bash
cd pwa
git init && git add . && git commit -m "init"
git remote add origin https://github.com/USER/vision-assistant-pwa.git
git push -u origin main

# Settings → Pages → Source: main branch
```

### 3. Firmware (Arduino IDE)

1. Installer Arduino IDE 2.x
2. File → Preferences → Additional Board URLs:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Board Manager → Installer "esp32" by Espressif
4. Sélectionner: **XIAO_ESP32S3**
5. Ouvrir `firmware/main.ino`
6. Upload

## Configuration Flic 2

1. App Flic → Pairer le bouton
2. Settings → **Flic Universal** → **Keyboard Command**
3. Trigger: **Push** → Mode: **Real-time**
4. Key: **Return** (ou autre)
5. **Save & Disconnect**
6. iOS Settings → Bluetooth → Connecter "Flic 2"
7. Supprimer l'app Flic

## Usage

1. Connecter iPhone au WiFi `VA_CAM` (mdp: `va123456`)
2. Ouvrir la PWA → Tap pour démarrer
3. Pairer l'oreillette Bluetooth
4. **Clic simple** = photo + réponse rapide (~4-5s)
5. **Appui long 2s+** = burst photos + audio prof (~7-12s)

## Endpoints Serveur

| Endpoint | Input | Output |
|----------|-------|--------|
| `GET /health` | - | `{ status: "ok" }` |
| `POST /analyze` | `{ image: "base64" }` | `{ audio: "base64 mp3", text: "..." }` |
| `POST /analyze` | `{ images: [...], audio: "base64 wav" }` | `{ audio: "base64 mp3", text: "..." }` |

## Endpoints XIAO

| Endpoint | Fonction |
|----------|----------|
| `GET /capture` | Photo JPEG |
| `GET /audio/start` | Démarre enregistrement |
| `GET /audio/stop` | Arrête + retourne WAV |
| `GET /health` | Status |

## Variables d'environnement (Render)

```
GOOGLE_API_KEY=AIza...       # Google AI Studio
OPENAI_API_KEY=sk-...        # Pour Whisper + TTS
PORT=3000
```

## Obtenir les clés API

1. **Google AI Studio** (gratuit) : https://aistudio.google.com/apikey
2. **OpenAI** : https://platform.openai.com/api-keys

## TODO

- [ ] Déployer serveur sur Render
- [ ] Déployer PWA sur GitHub Pages
- [ ] Flasher firmware sur XIAO
- [ ] Acheter matériel
- [ ] Souder batterie
- [ ] Configurer Flic 2
- [ ] Tester end-to-end
