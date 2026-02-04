const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Claude Opus - le plus intelligent pour le raisonnement
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Prompts
const PROMPT_SIMPLE = `Tu dois donner LA BONNE RÉPONSE. Si tu n'es pas SÛR À 100%, dis "Pas sûr".

MÉTHODE (analyse mentalement, n'écris rien) :
1. Identifie la règle de chaque LIGNE
2. Identifie la règle de chaque COLONNE
3. Vérifie que ta réponse respecte LES DEUX règles
4. Si doute → "Pas sûr"

OUTPUT (une seule ligne) :
- Sûr → "Question [numéro] réponse [lettre]"
- Pas sûr → "Pas sûr"
- Illisible → "Recommence"

INTERDIT : explication, justification, analyse écrite, emoji`;

const PROMPT_COMPLEX = `Donne LA BONNE RÉPONSE. Si pas sûr à 100%, dis "Pas sûr". Le prof parle.

OUTPUT :
- Sûr → "Question [numéro] réponse [lettre]" ou réponse courte
- Pas sûr → "Pas sûr"
- Illisible → "Recommence"

INTERDIT : explication, justification, emoji`;

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
    console.log('Calling Claude Sonnet...');
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
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
