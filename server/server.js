const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Gemini 2.0 Flash - SEULE API utilisée
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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
  res.json({ status: 'ok', model: 'gemini-2.0-flash', tts: 'browser', modes: ['simple', 'complex'] });
});

// Main analyze endpoint - retourne TEXTE seulement, TTS fait par le navigateur
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

    // Build Gemini request
    const parts = [];

    // Add images
    for (const imgData of imageList) {
      const base64Data = imgData.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      });
    }

    // Add prompt
    let prompt = isComplex ? PROMPT_COMPLEX : PROMPT_SIMPLE;
    if (transcription) {
      prompt += `\n\nLe professeur dit : "${transcription}"`;
    }
    parts.push({ text: prompt });

    // Call Gemini
    console.log('Calling Gemini 2.0 Flash...');
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    console.log(`Gemini response: "${responseText.substring(0, 100)}..."`);

    const totalTime = Date.now() - startTime;
    console.log(`Total time: ${totalTime}ms`);

    // Retourne TEXTE seulement - le navigateur fait le TTS
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
  console.log('Model: Gemini 2.0 Flash (Google only - no OpenAI)');
  console.log('TTS: Browser-based (Web Speech API)');
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /analyze');
});
