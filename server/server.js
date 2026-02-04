const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Claude Sonnet 3.5 - meilleur en raisonnement logique
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Prompts
const PROMPT_SIMPLE = `Tu es un expert en résolution de problèmes. RÉSOUS et DONNE LA RÉPONSE.

POUR LES MATRICES DE LOGIQUE (grilles avec patterns) :
1. Analyse chaque LIGNE : quel pattern se répète ou évolue ?
2. Analyse chaque COLONNE : quel pattern se répète ou évolue ?
3. Cherche : rotation, addition, soustraction, inversion des éléments
4. La case manquante doit respecter BOTH la règle de ligne ET de colonne
5. Vérifie ta réponse avant de répondre

FORMAT STRICT :
QCM/Matrices → "Question X réponse Y"
CALCUL → Résultat direct (ex: "42")
PROBLÈME → Solution courte

SI TU NE PEUX PAS LIRE → Dis "Recommence"

RÈGLES :
- JAMAIS d'emoji
- JAMAIS de justification
- JAMAIS poser de question
- Français uniquement
- Maximum 2 phrases`;

const PROMPT_COMPLEX = `Tu es un expert. Le prof parle, réponds à sa question.

POUR LES MATRICES DE LOGIQUE :
1. Analyse lignes et colonnes
2. Cherche rotation, addition, soustraction, inversion
3. Vérifie ta réponse

FORMAT :
QCM/Matrices → "Question X réponse Y"
CALCUL → Résultat direct
PROBLÈME → Solution courte

SI ILLISIBLE → "Recommence"

RÈGLES :
- JAMAIS d'emoji ni justification
- Réponds au prof si il demande
- Français, max 3 phrases`;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', model: 'claude-sonnet-4-20250514', tts: 'browser', modes: ['simple', 'complex'] });
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
    console.log('Calling Claude Sonnet...');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content }]
    });

    const responseText = response.content[0].text;
    console.log(`Claude response: "${responseText.substring(0, 100)}..."`);

    const totalTime = Date.now() - startTime;
    console.log(`Total time: ${totalTime}ms`);

    res.json({
      success: true,
      text: responseText,
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
  console.log('Model: Claude Sonnet 3.5 (Anthropic)');
  console.log('TTS: Browser-based (Web Speech API)');
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /analyze');
});
