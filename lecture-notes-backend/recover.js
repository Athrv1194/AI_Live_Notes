require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const backupsDir = path.join(__dirname, 'backups');

function discoverSessions() {
    const files = fs.readdirSync(backupsDir);
    return files
        .filter(f => f.startsWith('backup_transcript_session_') && f.endsWith('.txt'))
        .sort((a, b) => {
            const timeA = parseInt(a.replace('backup_transcript_session_', '').replace('.txt', ''));
            const timeB = parseInt(b.replace('backup_transcript_session_', '').replace('.txt', ''));
            return timeA - timeB;
        });
}

async function recover() {
    const sessions = discoverSessions();
    console.log(`Found ${sessions.length} session files to recover.`);

    let fullTranscript = '';

    for (let i = 0; i < sessions.length; i++) {
        const sessionFile = sessions[i];
        const filePath = path.join(backupsDir, sessionFile);
        
        try {
            if (transcription.text) {
                fullTranscript += transcription.text.trim() + ' ';
            }
            // Add a small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`Error processing ${file}:`, error.message);
            // wait a bit longer on error
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    fs.writeFileSync(path.join(__dirname, 'recovered_transcript.txt'), fullTranscript.trim());
    console.log('Recovery complete! Transcript saved to recovered_transcript.txt');
}

recover();
