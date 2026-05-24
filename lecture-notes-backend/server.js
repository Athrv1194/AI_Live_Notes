require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Ensure necessary directories exist
const audioUploadsDir = path.join(__dirname, 'uploads', 'audios');
const imageUploadsDir = path.join(__dirname, 'uploads', 'images');
const backupsDir = path.join(__dirname, 'backups');
const sessionsDir = path.join(__dirname, 'sessions');

if (!fs.existsSync(audioUploadsDir)) fs.mkdirSync(audioUploadsDir, { recursive: true });
if (!fs.existsSync(imageUploadsDir)) fs.mkdirSync(imageUploadsDir, { recursive: true });
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Raw body parser for audio transcription files (accepts webm, wav, mp3, m4a up to 50MB)
app.use('/api/transcribe-audio', express.raw({ type: ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/m4a'], limit: '50mb' }));


// Initialize Groq Pool
class GroqPoolManager {
  constructor() {
    this.clients = [];
    this.currentIndex = 0;
    
    // Parse keys from GROQ_API_KEYS or fallback to GROQ_API_KEY
    const keysStr = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY";
    const keys = keysStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
    
    // Create a client for each key
    for (const key of keys) {
      this.clients.push(new Groq({ apiKey: key }));
    }
    console.log(`🔑 Initialized Groq Pool with ${this.clients.length} API key(s)`);
  }

  getClient() {
    return this.clients[this.currentIndex];
  }

  rotateClient() {
    this.currentIndex = (this.currentIndex + 1) % this.clients.length;
    console.log(`🔄 Switched to Groq API Key ${this.currentIndex + 1}/${this.clients.length}`);
    return this.getClient();
  }
}

const groqPool = new GroqPoolManager();

// Helper function to safely split text into chunks to avoid token limits
function chunkText(text, maxChars) {
  const chunks = [];
  let currentChunk = '';
  // Attempt to split by sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  for (let sentence of sentences) {
    sentence = sentence.trim();
    if (!sentence) continue;

    // If a single sentence is larger than maxChars, we MUST forcefully split it
    if (sentence.length > maxChars) {
      // Push whatever we currently have
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // Force split the massive sentence
      for (let i = 0; i < sentence.length; i += maxChars) {
        chunks.push(sentence.slice(i, i + maxChars));
      }
    } 
    // Otherwise, check if adding this sentence exceeds the limit
    else if ((currentChunk.length + sentence.length + 1) > maxChars) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } 
    // Otherwise, just append it
    else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// Wrapper to call Groq with auto-retry and key rotation on 429 Rate Limit
async function executeWithGroqPool(actionFn) {
  let retries = groqPool.clients.length * 2; // Try each key twice
  while (retries > 0) {
    try {
      const client = groqPool.getClient();
      return await actionFn(client);
    } catch (error) {
      // 429 = rate limit, 413 = request too large
      if (error.status === 429 || error.status === 413 || (error.error && error.error.error && error.error.error.code === 'rate_limit_exceeded')) {
        retries--;
        if (retries === 0) throw error;

        let waitTimeSeconds = 2; // Default small buffer
        
        // Parse 'retry-after' header to properly handle Org-wide TPM limits
        if (error.headers) {
          let retryAfter = null;
          if (typeof error.headers.get === 'function') {
            retryAfter = error.headers.get('retry-after');
          } else if (error.headers['retry-after']) {
            retryAfter = error.headers['retry-after'];
          }
          if (retryAfter) {
            waitTimeSeconds = parseInt(retryAfter, 10);
            if (isNaN(waitTimeSeconds)) waitTimeSeconds = 2;
          }
        }

        console.log(`⚠️ Rate limit hit. Required wait: ${waitTimeSeconds}s. Rotating API key... (${retries} retries left)`);
        groqPool.rotateClient();
        
        // Respect the required wait time before retrying to prevent rapid failures
        await new Promise(resolve => setTimeout(resolve, waitTimeSeconds * 1000));
      } else {
        throw error;
      }
    }
  }
}

async function generateWithRetry(messages, model, temperature) {
  return await executeWithGroqPool(async (groqClient) => {
    const chatCompletion = await groqClient.chat.completions.create({
      messages,
      model,
      temperature,
      max_tokens: 1500,
    });
    return chatCompletion.choices[0]?.message?.content || "";
  });
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
    } else if (detailLevel === 'qa') {
      lengthInstruction = "Format the notes entirely as a series of Questions and Answers (Q&A). Identify the most important concepts, formulate a clear question for each, and provide a comprehensive answer based on the transcript.\n\nCRITICAL FORMATTING:\nYou MUST format every question as an H3 heading starting exactly with '### Q: '\nYou MUST format every answer as a blockquote, but DO NOT include 'A:' or 'Answer:' in the text.\nExample:\n### Q: What is wave-particle duality?\n> It is a fundamental concept...";
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
          7. CRITICAL ANTI-HALLUCINATION: DO NOT hallucinate code snippets (e.g. JavaScript, Python) unless the specific programming language and code was explicitly discussed in the transcript. If providing code examples, ensure they strictly match the domain of the lecture (e.g., if discussing Java EE, only output Java/JSP).
          8. If explaining complex relationships, instructions, or step-by-step processes, optionally include a Mermaid diagram using the \`\`\`mermaid code block syntax to visualize it.
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

    const transcription = await executeWithGroqPool(async (groqClient) => {
      return await groqClient.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-large-v3',
        response_format: 'json',
      });
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

// --- SESSION MANAGEMENT APIS ---

// POST: Save or update a session
app.post('/api/sessions/save', (req, res) => {
  try {
    const { sessionId, title, transcript, notes, duration, words, date } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

    const filePath = path.join(sessionsDir, `${sessionId}.json`);
    const sessionData = {
      id: sessionId,
      title: title || 'Untitled Session',
      date: date || new Date().toISOString(),
      duration: duration || '0m',
      words: words || 0,
      rawTranscript: transcript || '',
      preGeneratedNotes: notes || ''
    };

    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
    res.json({ success: true, session: sessionData });
  } catch (error) {
    console.error("Error saving session:", error);
    res.status(500).json({ error: "Failed to save session" });
  }
});

// GET: Fetch all sessions
app.get('/api/sessions', (req, res) => {
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    const sessions = files.map(file => {
      const content = fs.readFileSync(path.join(sessionsDir, file), 'utf-8');
      try {
        return JSON.parse(content);
      } catch (e) {
        return null;
      }
    }).filter(s => s !== null);
    
    // Sort descending by date (newest first)
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// DELETE: Delete a session
app.delete('/api/sessions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(sessionsDir, `${id}.json`);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: "Session deleted successfully" });
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  } catch (error) {
    console.error("Error deleting session:", error);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 AI Lecture Notes Backend running on http://localhost:${PORT}`);
});
