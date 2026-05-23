require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Ensure necessary directories exist
const audioUploadsDir = path.join(__dirname, 'uploads', 'audios');
const imageUploadsDir = path.join(__dirname, 'uploads', 'images');
const backupsDir = path.join(__dirname, 'backups');

if (!fs.existsSync(audioUploadsDir)) fs.mkdirSync(audioUploadsDir, { recursive: true });
if (!fs.existsSync(imageUploadsDir)) fs.mkdirSync(imageUploadsDir, { recursive: true });
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Raw body parser for audio transcription files (accepts webm, wav, mp3, m4a up to 50MB)
app.use('/api/transcribe-audio', express.raw({ type: ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/m4a'], limit: '50mb' }));


// Initialize Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY" });

// Helper function to safely split text into chunks to avoid token limits
function chunkText(text, maxChars) {
  const chunks = [];
  let currentChunk = '';
  // Attempt to split by sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  for (const sentence of sentences) {
    if ((currentChunk.length + sentence.length) > maxChars) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += ' ' + sentence;
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  // Fallback for huge blocks without punctuation
  if (chunks.length === 0 && text.length > 0) {
    for (let i = 0; i < text.length; i += maxChars) {
      chunks.push(text.slice(i, i + maxChars));
    }
  }
  return chunks;
}

// Wrapper to call Groq with auto-retry on 429 Rate Limit
async function generateWithRetry(messages, model, temperature) {
  let retries = 4;
  while (retries > 0) {
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages,
        model,
        temperature,
        max_tokens: 1500,
      });
      return chatCompletion.choices[0]?.message?.content || "";
    } catch (error) {
      // 429 = rate limit, 413 = request too large (but we treat it as rate limit token exceeded as per groq errors)
      if (error.status === 429 || error.status === 413 || (error.error && error.error.error && error.error.error.code === 'rate_limit_exceeded')) {
        retries--;
        if (retries === 0) throw error;

        let waitTimeSeconds = 25; // default wait

        // Try to parse 'retry-after' header if available
        if (error.headers && typeof error.headers.get === 'function') {
          const retryAfter = error.headers.get('retry-after');
          if (retryAfter) waitTimeSeconds = parseInt(retryAfter, 10) || 25;
        } else if (error.headers && error.headers['retry-after']) {
          waitTimeSeconds = parseInt(error.headers['retry-after'], 10) || 25;
        }

        console.log(`⏳ Rate limit hit. Retrying in ${waitTimeSeconds} seconds... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, waitTimeSeconds * 1000));
      } else {
        throw error;
      }
    }
  }
}

app.post('/api/generate-notes', async (req, res) => {
  try {
    const { transcript, detailLevel, images = [] } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: "Transcript is required" });
    }

    console.log("⚡ Generating notes at lightning speed with Groq...");
    
    const aiModel = images.length > 0 ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.1-8b-instant";
    if (images.length > 0) {
      console.log(`👁️ Vision Mode Enabled: Received ${images.length} screenshots. Using ${aiModel}`);
    }

    // 6000 characters is roughly ~1500 tokens. With max_tokens 1500, we request ~3000 tokens total per chunk.
    // This safely stays under the 6000/14400 TPM limit for free tiers.
    const chunks = chunkText(transcript, 6000);
    console.log(`📦 Transcript split into ${chunks.length} chunks to prevent rate limits.`);

    let lengthInstruction = "Make the notes highly detailed and comprehensive. Expand on concepts thoroughly, providing full explanations, examples, and deep context from the transcript.";
    if (detailLevel === 'short') {
      lengthInstruction = "Make the notes extremely concise. Use short, one-liner bullet points. Focus only on the most critical takeaways.";
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for (let i = 0; i < chunks.length; i++) {
      console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
      
      const imagesToSend = images.slice(-2); // Send max 2 recent unique slides to prevent token limit explosion
       
       let contentArray = [
         { type: "text", text: `Transcript Chunk:\n${chunks[i]}` }
       ];
       
       if (imagesToSend.length > 0 && i === chunks.length - 1) {
         imagesToSend.forEach(imgBase64 => {
           contentArray.push({
             type: "image_url",
             image_url: { url: imgBase64 }
           });
         });
       }

       const messages = [
         {
           role: "system",
           content: `You are an expert academic note-taker. Your task is to transform the provided lecture transcript (and potentially screen captures) into beautifully formatted Markdown notes.
          
          RULES:
          1. CRITICAL: Translate all Hindi or Hinglish content into clear, formal, academic English. The final output must be completely in English.
          2. Use headings (##, ###) extensively to organize topics.
          3. Use bolding (**text**) for key terms and important concepts.
          4. ${lengthInstruction}
          5. Correct any obvious transcription errors (e.g. "note yes" -> "Node.js").
          6. CRITICAL: Output absolutely zero conversational filler. Output only Markdown.
          7. If explaining complex relationships, instructions, or step-by-step processes, optionally include a Mermaid diagram using the \`\`\`mermaid code block syntax to visualize it.
             CRITICAL FOR MERMAID SYNTAX:
             - Always use double quotes for node labels containing spaces, parentheses, brackets, or special characters. Example: A["My Label"] instead of A[My Label].
             - Never use HTML tags inside labels.
             - Ensure all connections are valid. Use \`-->\` for arrows. If adding a label, use EXACTLY \`-->|Label|\` (do NOT add an extra \`>\` at the end like \`-->|Label|>\`).
             - Always start with a valid diagram type declaration (e.g. 'graph TD').`
         },
         {
           role: "user",
           content: (images.length > 0 && i === chunks.length - 1) ? contentArray : `Transcript Chunk:\n${chunks[i]}`
         }
       ];
       const notesPart = await generateWithRetry(messages, aiModel, 0.5);
      res.write(notesPart + "\n\n");
    }

    res.end();

  } catch (error) {
    console.error("Groq Generation Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate notes.", details: error.message });
    } else {
      res.write(`\n\n**Error:** ${error.message}\n`);
      res.end();
    }
  }
});

app.post('/api/transcribe-audio', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  let tempFilePath = null;

  try {
    const audioBuffer = req.body;
    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: "No audio data received" });
    }

    const contentType = req.headers['content-type'] || 'audio/webm';
    let ext = 'webm';
    if (contentType.includes('wav')) {
      ext = 'wav';
    } else if (contentType.includes('mpeg') || contentType.includes('mp3')) {
      ext = 'mp3';
    } else if (contentType.includes('m4a')) {
      ext = 'm4a';
    }
    tempFilePath = path.join(audioUploadsDir, `temp_audio_${Date.now()}.${ext}`);

    fs.writeFileSync(tempFilePath, audioBuffer);

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-large-v3',
      response_format: 'json',
    });

    if (transcription.text) {
      const sessionId = req.headers['x-session-id'] || 'default';
      fs.appendFileSync(path.join(backupsDir, `backup_transcript_${sessionId}.txt`), transcription.text.trim() + ' ');
    }

    res.json({ text: transcription.text || "" });

  } catch (error) {
    console.error("Transcription Error:", error);
    res.status(500).json({ error: "Failed to transcribe audio.", details: error.message });
  } finally {
    // Clean up temp file regardless of success or failure
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (err) {
        console.error("Error deleting temp file:", err);
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Groq Backend running on http://localhost:${PORT}`);
});
