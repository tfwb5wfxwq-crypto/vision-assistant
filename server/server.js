const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Claude Opus - le plus intelligent pour le raisonnement
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Prompts
const PROMPT_SIMPLE = `RAVEN MATRIX EXPERT. Protocole OBLIGATOIRE :

1. PERCEPTION - Décris CHAQUE cellule [ligne,colonne] :
   - Formes présentes
   - Nombre d'éléments
   - Taille (petit/moyen/grand)
   - Remplissage (noir/blanc/gris/hachuré)
   - Orientation (angle)
   - Position dans la cellule

2. RÈGLES PAR LIGNE - Pour chaque ligne, teste :
   - Constante ? (attribut identique)
   - Progression ? (+1, +2, etc.)
   - Distribution de 3 ? (3 valeurs différentes)
   - Addition/Soustraction ? (C1+C2=C3)
   - XOR ? (éléments communs disparaissent)
   - AND/OR ? (superposition)
   - Rotation ? (angle constant)

3. RÈGLES PAR COLONNE - Mêmes tests verticalement

4. PRÉDICTION - Combine règles lignes + colonnes pour prédire [3,3]

5. RÉPONSE FINALE - Compare avec les options, choisis la meilleure

RÈGLES CRITIQUES :
- TOUJOURS décrire AVANT de raisonner
- Plusieurs règles coexistent (une par attribut)
- Chaque attribut est INDÉPENDANT

FORMAT OUTPUT FINAL (dernière ligne) :
"Question [numéro] réponse [lettre]"

Si vraiment pas sûr après analyse complète : "Pas sûr"
Si illisible : "Recommence"`;

const PROMPT_COMPLEX = `EXPERT EN RÉSOLUTION. Le prof parle peut-être.

Si c'est une MATRICE DE RAVEN :
1. Décris CHAQUE cellule (formes, nombre, taille, remplissage, orientation)
2. Trouve les règles par LIGNE (constante, progression, distribution, XOR, rotation...)
3. Trouve les règles par COLONNE
4. Prédit la cellule manquante
5. Compare avec les options

Si c'est une AUTRE QUESTION : réponds directement

FORMAT OUTPUT FINAL :
"Question [numéro] réponse [lettre]" ou réponse courte
Si pas sûr : "Pas sûr"
Si illisible : "Recommence"`;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', model: 'claude-opus-4-20250514', tts: 'browser', modes: ['simple', 'complex'] });
});

// Main analyze endpoint
app.post('/analyze', async (req, res) => {
  const startTime = Date.now();

  try {
    const { image, images, transcription } = req.body;

    // Detect mode
    const isComplex = (images && images.length > 1) || transcription;
    const imageList = images || (image ? [image] : []);

    if (imageList.length === 0) {
      return res.status(400).json({ error: 'No image provided' });
    }

    console.log(`[${new Date().toISOString()}] Mode: ${isComplex ? 'COMPLEX' : 'SIMPLE'}, Images: ${imageList.length}, Transcription: ${transcription ? 'yes' : 'no'}`);

    // Build Claude request
    const content = [];

    // Add images
    for (const imgData of imageList) {
      const base64Data = imgData.replace(/^data:image\/\w+;base64,/, '');
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: base64Data
        }
      });
    }

    // Add prompt
    let prompt = isComplex ? PROMPT_COMPLEX : PROMPT_SIMPLE;
    if (transcription) {
      prompt += `\n\nLe professeur dit : "${transcription}"`;
    }
    content.push({ type: 'text', text: prompt });

    // Call Claude
    console.log('Calling Claude Opus...');
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content }]
    });

    const fullResponse = response.content[0].text;
    console.log(`Claude full response: "${fullResponse.substring(0, 200)}..."`);

    // Extraire seulement la réponse finale (dernière ligne avec "Question X réponse Y" ou "Pas sûr" ou "Recommence")
    const lines = fullResponse.trim().split('\n').filter(l => l.trim());
    let finalAnswer = lines[lines.length - 1]; // Dernière ligne par défaut

    // Chercher la ligne avec la réponse
    for (const line of lines.reverse()) {
      if (line.match(/question\s*\d+\s*réponse\s*[a-e]/i) ||
          line.match(/pas sûr/i) ||
          line.match(/recommence/i)) {
        finalAnswer = line.trim();
        break;
      }
    }

    console.log(`Final answer: "${finalAnswer}"`);

    const totalTime = Date.now() - startTime;
    console.log(`Total time: ${totalTime}ms`);

    res.json({
      success: true,
      text: finalAnswer,
      fullAnalysis: fullResponse, // Garder l'analyse complète si besoin
      mode: isComplex ? 'complex' : 'simple',
      timing: totalTime
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vision Assistant Server running on port ${PORT}`);
  console.log('Model: Claude Opus 4 (Anthropic)');
  console.log('TTS: Browser-based (Web Speech API)');
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /analyze');
});
