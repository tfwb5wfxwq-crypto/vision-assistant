const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Gemini 1.5 Flash - rapide, gratuit, bon en calculs
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Prompts
const PROMPT_SIMPLE = `Tu es un expert qui résout des exercices. Analyse l'image et donne LA BONNE RÉPONSE.

MÉTHODE :
1. Lis attentivement la question et les données (tableaux, graphiques, texte)
2. Identifie ce qu'on te demande
3. Fais les calculs nécessaires étape par étape
4. Vérifie ton résultat
5. Choisis la bonne réponse parmi les options

POUR LES CALCULS : montre les étapes clés
POUR LES QCM : analyse chaque option si nécessaire

FORMAT FINAL (dernière ligne obligatoire) :
"Question [numéro] réponse [lettre]"

Si illisible : "Recommence"
Si vraiment pas sûr : "Pas sûr"`;

const PROMPT_COMPLEX = `Tu es un expert. Résous l'exercice. Le prof parle peut-être, écoute ce qu'il dit.

MÉTHODE : Analyse, calcule, vérifie, réponds.

FORMAT FINAL :
"Question [numéro] réponse [lettre]" ou réponse courte
Si illisible : "Recommence"`;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', model: 'gemini-2.0-flash', tts: 'browser', modes: ['simple', 'complex'] });
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
    console.log('Calling Gemini 1.5 Flash...');
    const result = await model.generateContent(parts);
    const response = await result.response;
    const fullResponse = response.text();

    console.log(`Gemini full response: "${fullResponse.substring(0, 200)}..."`);

    // Extraire seulement la réponse finale (dernière ligne avec "Question X réponse Y" ou "Pas sûr" ou "Recommence")
    const lines = fullResponse.trim().split('\n').filter(l => l.trim());
    let finalAnswer = lines[lines.length - 1]; // Dernière ligne par défaut

    // Chercher la ligne avec la réponse
    for (const line of [...lines].reverse()) {
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
      fullAnalysis: fullResponse,
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
  console.log('Model: Gemini 1.5 Flash (Google)');
  console.log('TTS: Browser-based (Web Speech API)');
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /analyze');
});
