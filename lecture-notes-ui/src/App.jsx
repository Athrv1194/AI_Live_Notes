import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Mic, MicOff, FileText, Loader2, Upload, Download, ScreenShare, ScreenShareOff, Trash2, LayoutGrid, Search, Server, Sun, MonitorUp, Share2, StopCircle, MessageSquare, Clock, List, FileCheck, Zap, RotateCcw, Radio, Sparkles } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import mermaid from 'mermaid';
import Dashboard from './components/Dashboard';
import DocumentModal from './components/DocumentModal';
import SearchModal from './components/SearchModal';
import HistoryModal from './components/HistoryModal';
import NameModal from './components/NameModal';
import './App.css';

// Custom Mermaid component
// Custom Mermaid component with robust error handling and elegant fallback
const Mermaid = ({ chart }) => {
  const ref = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);

    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      suppressErrorAlerts: true // Disable annoying browser alerts for errors
    });

    if (ref.current && chart) {
      // Clean leading/trailing spaces and fix common LLM syntax errors for Mermaid labels
      const cleanChart = chart.trim()
        .replace(/-->\|([^|]+)\|>/g, '-->|$1|')
        .replace(/-\.->\|([^|]+)\|>/g, '-.->|$1|')
        .replace(/==>\|([^|]+)\|>/g, '==>|$1|');

      // Check syntax first before trying to render
      mermaid.parse(cleanChart)
        .then(() => {
          const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
          return mermaid.render(id, cleanChart);
        })
        .then(({ svg }) => {
          if (ref.current) {
            ref.current.innerHTML = svg;
          }
        })
        .catch((e) => {
          console.warn("Mermaid parsing/rendering failed, falling back to text preview:", e);
          setError(true);
        });
    }
  }, [chart]);

  if (error) {
    return (
      <div className="my-4 p-4 bg-gray-950/80 rounded-xl border border-amber-500/20 font-sans shadow-inner">
        <div className="text-xs text-amber-400 mb-2 flex items-center gap-1.5 font-semibold">
          <span>📊</span> Diagram structure (Text preview)
        </div>
        <pre className="text-[11px] text-gray-300 font-mono overflow-x-auto p-3 bg-black/40 rounded-lg leading-relaxed whitespace-pre shadow-inner border border-gray-800">
          {chart.trim()}
        </pre>
      </div>
    );
  }

  return <div ref={ref} className="mermaid flex justify-center my-4 overflow-x-auto w-full" />;
};

const App = () => {
  const [currentView, setCurrentView] = useState('live');
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSystemCapturing, setIsSystemCapturing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [notes, setNotes] = useState('### Your AI notes will appear here...');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [audioProgressText, setAudioProgressText] = useState('');
  const [noteDetailLevel, setNoteDetailLevel] = useState('detailed');
  const [isVisionEnabled, setIsVisionEnabled] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isEditing, setIsEditing] = useState(false);

  // New State for Persistence and User Profile
  const [sessions, setSessions] = useState([]);
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [isNameModalOpen, setIsNameModalOpen] = useState(!localStorage.getItem('username'));

  const recognitionRef = useRef(null);
  const lastProcessedIndex = useRef(0);
  const isGeneratingRef = useRef(false);
  const savedGenerateNotes = useRef();
  const fileInputRef = useRef(null);
  const audioFileInputRef = useRef(null);
  const systemMediaRecorderRef = useRef(null);
  const systemStreamRef = useRef(null);
  const isSystemCapturingRef = useRef(false);
  const sessionIdRef = useRef(`session_${Date.now()}`);

  const hiddenVideoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const visionFramesRef = useRef([]);
  const visionIntervalRef = useRef(null);

  // Fetch sessions on mount
  useEffect(() => {
    fetch('http://localhost:3000/api/sessions')
      .then(res => res.json())
      .then(data => setSessions(data))
      .catch(err => console.error("Failed to fetch sessions:", err));
  }, []);

  const deleteSession = async (id) => {
    try {
      const res = await fetch(`http://localhost:3000/api/sessions/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  // Auto-save logic
  useEffect(() => {
    const timer = setTimeout(() => {
      // Don't save empty/default states
      if (transcript.trim() === '' && notes.includes('### Your AI notes')) return;
      
      let title = 'Untitled Session';
      if (!notes.includes('### Your AI notes')) {
        const titleMatch = notes.match(/#+\s+([^\n]+)/);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim();
        }
      }

      fetch('http://localhost:3000/api/sessions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          title: title,
          transcript: transcript,
          notes: notes,
          duration: `${Math.floor(recordingTime / 60)}m ${recordingTime % 60}s`,
          words: transcript.split(/\s+/).filter(w => w.length > 0).length,
          date: new Date().toISOString()
        })
      }).then(() => {
        // Fetch sessions again to update modals
        fetch('http://localhost:3000/api/sessions')
          .then(res => res.json())
          .then(data => setSessions(data))
          .catch(err => console.error(err));
      }).catch(err => console.error(err));
    }, 5000); // 5 seconds debounce

    return () => clearTimeout(timer);
  }, [transcript, notes, recordingTime]);

  const handleStartCapture = async () => null;

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            currentFinal += event.results[i][0].transcript + ' ';
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }

        // Use functional state update to prevent stale closures
        if (currentFinal) {
          setTranscript((prev) => prev + currentFinal);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        setIsRecording(false);
      };
    } else {
      console.error("Web Speech API not supported in this browser.");
      alert("Please use Google Chrome or Microsoft Edge for speech recognition.");
    }
  }, []);

  // Timer logic
  useEffect(() => {
    let timerInterval;
    if (isRecording || isSystemCapturing) {
      timerInterval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerInterval);
    }
    return () => clearInterval(timerInterval);
  }, [isRecording, isSystemCapturing]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    let intervalId;

    // If either mic or system recording is active, run the loop
    if (isRecording || isSystemCapturing) {
      intervalId = setInterval(() => {
        console.log("Auto-triggering AI note generation...");
        if (savedGenerateNotes.current) {
          savedGenerateNotes.current();
        }
      }, 60000); // 60,000 ms = 1 minute
    }

    // Cleanup interval when recording stops or component unmounts
    return () => clearInterval(intervalId);
  }, [isRecording, isSystemCapturing]);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
    setIsRecording(!isRecording);
  };

  // Dynamic Vision Toggle Handler
  useEffect(() => {
    if (isVisionEnabled && isSystemCapturing && systemStreamRef.current) {
      if (hiddenVideoRef.current) {
        hiddenVideoRef.current.srcObject = systemStreamRef.current;
      }
      if (!visionIntervalRef.current) {
        // Capture first frame immediately after 1s, then every 30s
        setTimeout(() => captureFrame(), 1000);
        visionIntervalRef.current = setInterval(() => {
          captureFrame();
        }, 30000);
      }
    } else {
      if (visionIntervalRef.current) {
        clearInterval(visionIntervalRef.current);
        visionIntervalRef.current = null;
      }
      if (hiddenVideoRef.current) {
        hiddenVideoRef.current.srcObject = null;
      }
    }
  }, [isVisionEnabled, isSystemCapturing]);

  const startSystemCapture = async () => {
    try {
      // 1. Capture display media with system audio enabled
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Needed by getDisplayMedia
        audio: true  // Captures the actual system/meeting audio
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach(track => track.stop());
        alert("No system audio shared. Please make sure to check the 'Share system audio' checkbox when choosing a screen/tab!");
        return;
      }

      // Create stream containing only the audio track so we don't process unnecessary video bytes
      const audioStream = new MediaStream([audioTracks[0]]);
      systemStreamRef.current = stream;

      setIsSystemCapturing(true);
      isSystemCapturingRef.current = true;

      let mediaRecorder = null;
      let audioChunks = [];
      const recordInterval = 4000; // 4 seconds chunk size for extremely fast real-time transcription!

      const startRecordingChunk = () => {
        if (!isSystemCapturingRef.current) return;

        audioChunks = [];
        mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
        systemMediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunks.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          if (audioChunks.length > 0) {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            if (blob.size > 1000) {
              await sendAudioToBackend(blob);
            }
          }
          // Recursively start the next chunk if still capturing
          if (isSystemCapturingRef.current) {
            startRecordingChunk();
          }
        };

        mediaRecorder.start();

        // Automatically stop the chunk after 4 seconds to force a complete WebM file with headers
        setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, recordInterval);
      };

      startRecordingChunk();

      // Listen for the user stopping sharing via the browser's built-in toolbar
      if (stream.getVideoTracks()[0]) {
        stream.getVideoTracks()[0].onended = () => {
          stopSystemCapture();
        };
      }

    } catch (err) {
      console.error("Error starting system audio capture:", err);
      setIsSystemCapturing(false);
      isSystemCapturingRef.current = false;
    }
  };

  const stopSystemCapture = () => {
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(track => track.stop());
      systemStreamRef.current = null;
    }
    if (systemMediaRecorderRef.current && systemMediaRecorderRef.current.state !== 'inactive') {
      systemMediaRecorderRef.current.stop();
    }

    if (visionIntervalRef.current) {
      clearInterval(visionIntervalRef.current);
    }
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.srcObject = null;
    }

    setIsSystemCapturing(false);
    isSystemCapturingRef.current = false;
  };

  const captureFrame = () => {
    if (!hiddenVideoRef.current || !captureCanvasRef.current) return;
    const video = hiddenVideoRef.current;
    const canvas = captureCanvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    // Scale down to 800px width to save tokens/bandwidth
    canvas.width = 800;
    canvas.height = Math.floor(video.videoHeight * (800 / video.videoWidth));

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Lower quality JPEG to keep base64 string small
    const base64Image = canvas.toDataURL('image/jpeg', 0.5);

    // Deduplication: Only add if it's different from the last frame
    const lastFrame = visionFramesRef.current[visionFramesRef.current.length - 1];
    if (lastFrame !== base64Image) {
      visionFramesRef.current.push(base64Image);
      console.log("📸 Vision: Captured new unique slide/screen.");
    }
  };

  const toggleSystemCapture = () => {
    if (isSystemCapturing) {
      stopSystemCapture();
    } else {
      startSystemCapture();
    }
  };

  const sendAudioToBackend = async (audioBlob) => {
    try {
      const response = await fetch('http://localhost:3000/api/transcribe-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/webm',
          'x-session-id': sessionIdRef.current
        },
        body: audioBlob
      });

      if (!response.ok) throw new Error('Transcription endpoint error');

      const data = await response.json();
      if (data.text && data.text.trim()) {
        setTranscript((prev) => prev + (prev ? ' ' : '') + data.text.trim());
      }
    } catch (error) {
      console.error("Error transcribing system audio chunk:", error);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      setTranscript((prev) => prev + (prev ? '\n\n' : '') + text);
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  // Lightweight PCM 16-bit WAV encoder
  const bufferToWav = (buffer) => {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitDepth = 16;

    let result;
    if (numOfChan === 2) {
      result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
      result = buffer.getChannelData(0);
    }

    return writeWavFile(result, numOfChan, sampleRate, bitDepth);
  };

  const writeWavFile = (samples, numOfChan, sampleRate, bitDepth) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + samples.length * 2, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, numOfChan, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate */
    view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
    /* block align */
    view.setUint16(32, numOfChan * (bitDepth / 8), true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, samples.length * 2, true);

    floatTo16BitPCM(view, 44, samples);

    return new Blob([view], { type: 'audio/wav' });
  };

  const interleave = (inputL, inputR) => {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;

    while (index < length) {
      result[index++] = inputL[inputIndex];
      result[index++] = inputR[inputIndex];
      inputIndex++;
    }
    return result;
  };

  const floatTo16BitPCM = (output, offset, input) => {
    for (let i = 0; i < input.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  };

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const resampleAndSliceAudioBuffer = async (originalBuffer, startOffsetSec, endOffsetSec) => {
    const originalSampleRate = originalBuffer.sampleRate;
    const startSample = Math.floor(startOffsetSec * originalSampleRate);
    const endSample = Math.floor(endOffsetSec * originalSampleRate);
    const durationSec = endOffsetSec - startOffsetSec;
    const chunkLength = endSample - startSample;

    const targetSampleRate = 16000; // 16kHz downsampling
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(durationSec * targetSampleRate), targetSampleRate);

    const bufferSource = offlineCtx.createBufferSource();

    const tempBuffer = offlineCtx.createBuffer(
      originalBuffer.numberOfChannels,
      chunkLength,
      originalSampleRate
    );

    for (let channel = 0; channel < originalBuffer.numberOfChannels; channel++) {
      const originalData = originalBuffer.getChannelData(channel);
      const tempData = tempBuffer.getChannelData(channel);
      for (let i = 0; i < chunkLength; i++) {
        tempData[i] = originalData[startSample + i];
      }
    }

    bufferSource.buffer = tempBuffer;
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start();

    return await offlineCtx.startRendering();
  };

  const handleAudioFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessingAudio(true);
    setAudioProgressText("Reading audio file...");

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();

      setAudioProgressText("Decoding audio (this may take a few seconds)...");
      const originalBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const duration = originalBuffer.duration;
      const chunkDuration = 300; // 5-minute chunks (300 seconds)
      const totalChunks = Math.ceil(duration / chunkDuration);

      let fullTranscript = '';

      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        const start = chunkIdx * chunkDuration;
        const end = Math.min(start + chunkDuration, duration);
        const percent = Math.round((chunkIdx / totalChunks) * 100);

        setAudioProgressText(`Transcribing: Processing segment ${chunkIdx + 1} of ${totalChunks} (${percent}% complete)...`);

        // 1. Slice and resample this chunk to 16kHz mono
        const resampledBuffer = await resampleAndSliceAudioBuffer(originalBuffer, start, end);

        // 2. Encode to mono 16-bit WAV file
        const wavBlob = bufferToWav(resampledBuffer);

        // 3. Upload to backend
        const response = await fetch('http://localhost:3000/api/transcribe-audio', {
          method: 'POST',
          headers: {
            'Content-Type': 'audio/wav',
            'x-session-id': sessionIdRef.current
          },
          body: wavBlob
        });

        if (!response.ok) throw new Error(`Error transcribing segment ${chunkIdx + 1}`);

        const data = await response.json();
        if (data.text && data.text.trim()) {
          const text = data.text.trim();
          fullTranscript += (fullTranscript ? ' ' : '') + text;
          // Progressively update transcription in the UI
          setTranscript((prev) => prev + (prev ? ' ' : '') + text);
        }
      }

      setAudioProgressText("Transcription complete!");
      setTimeout(() => {
        setIsProcessingAudio(false);
      }, 1500);

    } catch (error) {
      console.error("Audio upload error:", error);
      alert(`Audio upload failed: ${error.message}`);
      setIsProcessingAudio(false);
    } finally {
      e.target.value = ''; // Reset input
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('notes-content');
    if (!element) return;
    
    // We only want to print the rendered HTML, so temporarily hide the textarea if editing
    const wasEditing = isEditing;
    if (wasEditing) setIsEditing(false);
    
    // Slight delay to ensure DOM updates if we just exited edit mode
    setTimeout(() => {
      let filename = `AI_Notes_${new Date().toISOString().slice(0,10)}`;
      if (!notes.includes('### Your AI notes')) {
        const titleMatch = notes.match(/#+\s+([^\n]+)/);
        if (titleMatch && titleMatch[1]) {
          const sanitizedTitle = titleMatch[1].trim().replace(/[^a-zA-Z0-9 -]/g, '').replace(/\s+/g, '_').substring(0, 50);
          if (sanitizedTitle) {
            filename = sanitizedTitle;
          }
        }
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert("Please allow popups to generate the PDF.");
        if (wasEditing) setIsEditing(true);
        return;
      }
      
      // Get all style elements from current document to preserve Tailwind + Custom CSS
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(el => el.outerHTML)
        .join('\n');

      const printStyles = `
        <style>
          @media print {
            @page { margin: 20mm; }
            body { 
              -webkit-print-color-adjust: exact !important; 
              print-color-adjust: exact !important; 
              background-color: white !important;
            }
            #print-container { overflow: visible !important; height: auto !important; }
            h2, h3 { page-break-after: avoid; }
            img, svg, .mermaid { page-break-inside: avoid; }
            li { page-break-inside: avoid; margin-bottom: 12px; }
          }
          body {
            background-color: white;
            font-family: 'Inter', system-ui, sans-serif;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
          }
        </style>
      `;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${filename}</title>
            <meta charset="utf-8">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">
            ${styles}
            ${printStyles}
          </head>
          <body>
            <div id="print-container">
              ${element.innerHTML}
            </div>
          </body>
        </html>
      `);
      
      printWindow.document.close();
      
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        setTimeout(() => printWindow.close(), 500);
      };
      
      if (wasEditing) setIsEditing(true);
    }, 100);
  };

  const generateNotes = async () => {
    if (isGeneratingRef.current) {
      console.log("Generation already in progress, skipping.");
      return;
    }

    // 1. Slice only the new text that hasn't been processed yet
    const currentTranscriptLength = transcript.length;
    const newChunk = transcript.slice(lastProcessedIndex.current).trim();

    // 2. Prevent API calls if the user hasn't said much since the last generation
    if (newChunk.length < 50) {
      setGenerationStatus('Notes are already up to date! Keep speaking...');
      setTimeout(() => setGenerationStatus(''), 3000);
      return;
    }

    setIsGenerating(true);
    isGeneratingRef.current = true;
    setGenerationStatus('Generating notes...');

    const longProcessTimeout = setTimeout(() => {
      setGenerationStatus('Still processing... Large transcript detected, this may take a few minutes due to rate limits.');
    }, 15000); // 15 seconds

    try {
      const response = await fetch('http://localhost:3000/api/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: newChunk,
          detailLevel: noteDetailLevel,
          images: isVisionEnabled ? visionFramesRef.current : []
        }),
      });

      // Clear frames so we don't resend them on the next chunk
      visionFramesRef.current = [];

      clearTimeout(longProcessTimeout);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || `Network error (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      // Remove placeholder before streaming
      setNotes((prevNotes) => {
        if (prevNotes.includes('### Your AI notes will appear here...')) {
          return '';
        }
        return prevNotes + '\n\n---\n\n';
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        setNotes((prev) => prev + chunkText);
      }

      // 4. Update index only when fully done
      lastProcessedIndex.current = currentTranscriptLength;

    } catch (error) {
      console.error("AI Error:", error);
      clearTimeout(longProcessTimeout);
      alert("Error generating notes: " + error.message);
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
      setGenerationStatus('');
    }
  };

  const handleClearTranscript = () => {
    if (window.confirm("Are you sure you want to clear the transcript? This cannot be undone.")) {
      setTranscript('');
      lastProcessedIndex.current = 0;
      visionFramesRef.current = [];
      sessionIdRef.current = `session_${Date.now()}`; // Start a fresh session ID
    }
  };

  const handleClearNotes = () => {
    if (window.confirm("Are you sure you want to clear your generated notes?")) {
      setNotes('### Your AI notes will appear here...');
      lastProcessedIndex.current = 0; // Reset index so they can regenerate notes from the existing transcript if they want
    }
  };

  useEffect(() => {
    savedGenerateNotes.current = generateNotes;
  }, [generateNotes]);

  const handleDetailLevelClick = (level) => {
    setNoteDetailLevel(level);
    // Reset everything so the user can regenerate all notes with the new style
    lastProcessedIndex.current = 0;
    setNotes('### Your AI notes will appear here...');
  };



  return (
    <div className="flex min-h-screen bg-cream font-sans h-screen overflow-hidden">
      
      {/* Left Sidebar */}
      <aside className="w-[72px] bg-panel flex flex-col items-center py-6 justify-between flex-shrink-0 z-20">
        <div className="flex flex-col items-center gap-8 w-full">
          {/* Logo / Mic */}
          <div onClick={toggleRecording} className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg cursor-pointer transition-transform hover:scale-105 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-accent'}`}>
            {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
          </div>
          
          <nav className="flex flex-col gap-6 w-full items-center mt-4">
            <button onClick={() => setCurrentView('live')} className={`relative group transition-colors ${currentView === 'live' ? 'text-emerald-400' : 'text-gray-500 hover:text-white'}`}>
              <Radio size={22} />
              <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">Live Capture</span>
            </button>
            <button onClick={() => setCurrentView('dashboard')} className={`relative group transition-colors ${currentView === 'dashboard' ? 'text-amber-400' : 'text-gray-500 hover:text-white'}`}>
              <LayoutGrid size={22} />
              <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">Dashboard</span>
            </button>
            <button onClick={() => setIsDocumentModalOpen(true)} className="text-gray-500 hover:text-white transition-colors relative group">
              <FileText size={22} />
              <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">My Notes</span>
            </button>
            <button onClick={() => setIsSearchModalOpen(true)} className="text-gray-500 hover:text-white transition-colors relative group">
              <Search size={22} />
              <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">Search</span>
            </button>
            <button onClick={() => setIsHistoryModalOpen(true)} className="text-gray-500 hover:text-white transition-colors relative group">
              <Server size={22} />
              <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">History</span>
            </button>
          </nav>
        </div>
        
        <div className="flex flex-col items-center gap-6">
          <div 
            onClick={() => setIsNameModalOpen(true)}
            className="w-10 h-10 rounded-full bg-emerald-700 flex items-center justify-center text-white font-bold text-sm border-2 border-transparent hover:border-white cursor-pointer transition-all shadow-md"
            title="Edit Profile"
          >
            {username ? username.substring(0, 2).toUpperCase() : 'AR'}
          </div>
        </div>
      </aside>

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {currentView === 'dashboard' ? (
          <Dashboard 
            onNavigate={setCurrentView} 
            sessions={sessions}
            username={username}
            onDeleteSession={deleteSession}
          />
        ) : (
          <>
            {/* Top Header */}
            <header className="h-[88px] px-8 flex items-center justify-between flex-shrink-0 bg-transparent border-b border-[#e6dac3] z-10">
              <div className="flex items-center gap-4">
                <h1 className="text-3xl font-serif font-bold text-gray-900 tracking-tight transition-colors">Live Capture</h1>
              </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-gray-100/80 text-gray-700 border border-gray-300/80 rounded-xl text-sm font-semibold transition-all hover:border-gray-400"
            >
              <Download size={16} /> Export PDF
            </button>
            <button onClick={() => alert("Session link copied to clipboard!")} className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-gray-100/80 text-gray-700 border border-gray-300/80 rounded-xl text-sm font-semibold transition-all hover:border-gray-400">
              <Share2 size={16} /> Share
            </button>
            <button 
              onClick={() => {
                let stopped = false;
                if (isRecording) { toggleRecording(); stopped = true; }
                if (isSystemCapturing) { toggleSystemCapture(); stopped = true; }
                if (stopped) {
                  alert("Live session stopped successfully.");
                } else {
                  alert("No active session to stop.");
                }
              }}
              className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-[#436b4e] text-white rounded-xl text-sm font-semibold shadow-md transition-all hover:shadow-lg active:scale-95"
            >
              <StopCircle size={16} /> Stop Session
            </button>
          </div>
        </header>

        {/* Status & Audio tools (Moved out to align the two columns below) */}
        <div className="px-8 pt-6 pb-2 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border shadow-sm transition-all ${isRecording ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-500 border-gray-200'}`}>
              {isRecording ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-sm font-bold tracking-wide">Recording...</span>
                </>
              ) : (
                <>
                  <MicOff size={16} />
                  <span className="text-sm font-bold tracking-wide">Ready to Record</span>
                </>
              )}
            </div>
            
            <div className={`px-4 py-2 rounded-full border shadow-sm flex items-center gap-2 transition-all ${isSystemCapturing ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-gray-500 border-gray-200'}`}>
              {isSystemCapturing ? <ScreenShare size={16} /> : <ScreenShareOff size={16} />}
              <span className="text-sm font-bold tracking-wide">{isSystemCapturing ? 'Capturing Window' : 'No Window'}</span>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex px-8 pb-8 gap-8 overflow-hidden">
          
          {/* Left Column (Visualizer & Transcript) */}
          <div className="flex-[0.6] flex flex-col gap-6 h-full min-h-0">

            {/* Audio Input Box */}
            <div className="bg-panel rounded-2xl p-6 h-[280px] flex flex-col relative shadow-xl border border-gray-800">
              {/* Fake color strip at top of panel */}
              <div className="absolute top-0 left-6 right-6 h-1 bg-gradient-to-r from-emerald-500 via-yellow-500 to-red-500 rounded-b-md opacity-80"></div>
              
              <div className="text-xs font-bold tracking-widest text-gray-500 uppercase mt-2">
                Audio Input — Live
              </div>
              
              {/* Visualizer */}
              <div className="flex-1 flex items-center justify-center">
                <div className="visualizer-container">
                  {[...Array(23)].map((_, i) => (
                    <div key={i} className={`visualizer-bar ${(isRecording || isSystemCapturing) ? 'active' : ''}`}></div>
                  ))}
                </div>
              </div>
              
              <div className="flex items-end justify-between mt-auto mb-4">
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isRecording || isSystemCapturing ? 'border-accent text-accent bg-accent/10' : 'border-gray-700 text-gray-500 bg-gray-800'}`}>
                    <div className={`w-2 h-2 rounded-full ${isRecording || isSystemCapturing ? 'bg-accent animate-pulse' : 'bg-gray-500'}`}></div>
                    <span className="text-xs font-bold tracking-wide uppercase">Recording</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-mono text-white tracking-wider font-medium">
                    {formatTime(recordingTime)}
                  </div>
                  {recordingTime > 0 && !isRecording && !isSystemCapturing && (
                    <button 
                      onClick={() => {
                        if (window.confirm("Reset the timer to 00:00?")) {
                          setRecordingTime(0);
                        }
                      }} 
                      className="text-gray-500 hover:text-red-500 transition-colors p-1" 
                      title="Reset Timer"
                    >
                      <RotateCcw size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons inside box */}
              <div className="flex gap-3">
                <button onClick={toggleRecording} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all border ${isRecording ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'bg-[#15231c] border-[#22392d] text-emerald-500 hover:bg-[#1a2d24]'}`}>
                  {isRecording ? <MicOff size={16} /> : <Mic size={16} />} Microphone
                </button>
                <button onClick={toggleSystemCapture} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all border ${isSystemCapturing ? 'bg-blue-900/50 border-blue-500/50 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'bg-[#151c2b] border-[#202b40] text-blue-400 hover:bg-[#1a2336]'}`}>
                  {isSystemCapturing ? <ScreenShareOff size={16} /> : <MonitorUp size={16} />} Capture System
                </button>
                <input type="file" ref={audioFileInputRef} onChange={handleAudioFileUpload} accept="audio/*" className="hidden" />
                <button onClick={() => audioFileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all border bg-[#271d15] border-[#3d2d20] text-amber-500 hover:bg-[#302319]">
                  <Upload size={16} /> Upload Audio
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.md" className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all border bg-[#29171a] border-[#402328] text-rose-400 hover:bg-[#331c20]">
                  <FileText size={16} /> Upload Transcript
                </button>
              </div>
            </div>

            {/* Live Transcript Area */}
            <div className="flex-1 bg-card rounded-2xl p-6 shadow-md border border-[#e6dac3] flex flex-col relative min-h-0">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
                <h2 className="text-2xl font-serif font-bold text-gray-900">Live Transcript</h2>
                <div className="flex items-center gap-3">
                  {isProcessingAudio && (
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full flex items-center gap-2 animate-pulse">
                      <Loader2 size={12} className="animate-spin" /> {audioProgressText}
                    </span>
                  )}
                  <button onClick={handleClearTranscript} className="text-gray-400 hover:text-red-500 transition-colors" title="Clear Transcript">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                {transcript ? (
                  <p className="text-gray-700 leading-relaxed font-medium text-[15px] whitespace-pre-wrap">
                    {transcript}
                  </p>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
                    <MessageSquare size={48} className="opacity-20" />
                    <p className="text-sm font-medium">Click the microphone to start capturing, or upload an audio file.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-[#e6dac3] relative overflow-hidden">
                <div className="absolute bottom-0 left-0 w-full h-1 bg-emerald-600"></div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-4xl font-serif font-bold text-gray-900">
                    {transcript ? transcript.trim().split(/\s+/).filter(w => w.length > 0).length : 0}
                  </span>
                  {(isRecording || isSystemCapturing) && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded uppercase flex items-center gap-1">
                      ↑ live
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-bold tracking-widest text-gray-500 uppercase">Words Captured</div>
              </div>
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-[#e6dac3] relative overflow-hidden">
                <div className="absolute bottom-0 left-0 w-full h-1 bg-amber-500"></div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-4xl font-serif font-bold text-gray-900">
                    {notes.includes('### Your AI notes') ? 0 : (notes.split('## ').length - 1 || 0)}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded uppercase flex items-center gap-1">
                    {notes.includes('### Your AI notes') ? 0 : (notes.split('## ').length - 1 || 0)} topics
                  </span>
                </div>
                <div className="text-[11px] font-bold tracking-widest text-gray-500 uppercase">Note Sections</div>
              </div>
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-[#e6dac3] relative overflow-hidden">
                <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500"></div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-4xl font-serif font-bold text-gray-900 flex items-baseline">
                    {Math.floor(recordingTime / 60)}<span className="text-lg text-gray-500 ml-1">m</span>
                  </span>
                </div>
                <div className="text-[11px] font-bold tracking-widest text-gray-500 uppercase">Duration</div>
              </div>
            </div>

          </div>

          {/* Right Column (Study Notes) */}
          <div className="flex-[0.4] bg-card rounded-2xl shadow-md border border-[#e6dac3] flex flex-col relative h-full min-h-0 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h2 className="text-2xl font-serif font-bold text-gray-900">Study Notes</h2>
                  <p className="text-xs text-gray-500 font-medium">AI-structured · Auto-updates every 60s</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-full">
                  <button onClick={() => handleDetailLevelClick('detailed')} className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ${noteDetailLevel === 'detailed' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Detailed</button>
                  <button onClick={() => handleDetailLevelClick('short')} className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ${noteDetailLevel === 'short' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Brief</button>
                  <button onClick={() => handleDetailLevelClick('qa')} className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ${noteDetailLevel === 'qa' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Q&A</button>
                </div>
              </div>
              
              <div className="flex justify-between items-center mt-4">
                <div className="flex gap-2">
                  <button onClick={handleDownloadPDF} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-50:bg-gray-600 shadow-sm transition-colors">
                    <Download size={14} /> PDF
                  </button>
                  <button onClick={() => setIsEditing(!isEditing)} className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-xs font-semibold transition-colors shadow-sm ${isEditing ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50:bg-gray-600'}`}>
                    <FileText size={14} /> {isEditing ? 'Save' : 'Edit'}
                  </button>
                </div>
                <button onClick={() => setNotes('### Your AI notes will appear here...')} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md text-xs font-semibold transition-colors">
                  <Trash2 size={14} /> Clear
                </button>
              </div>
            </div>

            <div id="notes-content" className="flex-1 overflow-y-auto p-6 pb-28">
               {isEditing ? (
                 <textarea 
                   className="w-full h-full min-h-[400px] bg-transparent border-none p-0 font-mono text-sm text-gray-800 focus:outline-none focus:ring-0 resize-none leading-relaxed"
                   value={notes}
                   onChange={(e) => setNotes(e.target.value)}
                 />
               ) : (
                 <div className="prose prose-sm prose-stone max-w-none">
                   <ReactMarkdown
                     components={{
                       code({ node, inline, className, children, ...props }) {
                         const match = /language-(\w+)/.exec(className || '')
                         if (!inline && match && match[1] === 'mermaid') {
                           return <Mermaid chart={String(children).replace(/\n$/, '')} />
                         }
                         return <code className={className} {...props}>{children}</code>
                       },
                       h2({children}) {
                          return <div className="mt-8 mb-4 border-b border-gray-200 pb-2"><span className="text-[10px] font-bold tracking-widest text-accent uppercase mb-1 block">Topic</span><h2 className="text-xl font-serif font-bold text-gray-900 m-0">{children}</h2></div>
                       },
                       h3({children}) {
                           // Extract text to check if it's a Q&A question
                           let text = '';
                           React.Children.forEach(children, child => {
                             if (typeof child === 'string') text += child;
                           });
                           
                           if (text.trim().startsWith('Q:')) {
                             return (
                               <div className="mt-8 mb-2 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl shadow-sm text-blue-900 font-bold flex items-start gap-3">
                                 <div className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 shadow-inner">
                                   Q
                                 </div>
                                 <div className="text-lg leading-snug pt-0.5">{text.replace(/^Q:\s*/, '')}</div>
                               </div>
                             );
                           }
                           return <h3 className="text-[11px] font-bold tracking-widest text-accent uppercase mt-6 mb-3">{children}</h3>
                       },
                       blockquote({children}) {
                         return (
                           <div className="mb-8 ml-4 p-5 bg-white border-l-4 border-emerald-400 rounded-r-2xl rounded-bl-2xl shadow-md text-gray-700 flex items-start gap-4 relative">
                             <div className="absolute -left-[18px] top-5 bg-emerald-400 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-4 border-[#fdfbf7] shadow-sm">
                               A
                             </div>
                             <div className="pl-2 leading-relaxed w-full text-sm">
                               {children}
                             </div>
                           </div>
                         );
                       },
                       ul({children}) {
                         return <div className="flex flex-col gap-3 my-4">{children}</div>
                       },
                       li({children}) {
                          return (
                            <div className="bg-[#f8f5ee] border border-[#e6dac3] rounded-xl p-4 flex gap-3 shadow-sm hover:shadow-md transition-shadow">
                              <div className="mt-0.5">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-inner">
                                  <Sparkles size={12} />
                                </div>
                              </div>
                              <div className="flex-1 text-sm text-gray-800 leading-relaxed">
                                {children}
                              </div>
                            </div>
                          )
                       }
                     }}
                   >
                     {notes}
                   </ReactMarkdown>
                 </div>
               )}
            </div>

            {/* Bottom Floating Generate Area */}
            <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-card via-card to-transparent pt-12 pointer-events-none">
               {(isRecording || isSystemCapturing) && (
                 <div className="flex items-center gap-2 mb-4 pl-2 opacity-70">
                   <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
                   <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{animationDelay: '0.2s'}}></div>
                   <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{animationDelay: '0.4s'}}></div>
                   <span className="text-xs font-medium ml-2 text-gray-600">AI is listening and will update notes in {60 - (recordingTime % 60)}s...</span>
                 </div>
               )}
               <button 
                  onClick={generateNotes}
                  disabled={!transcript || isGenerating}
                  className="group w-full bg-panel hover:bg-gradient-to-r hover:from-accent hover:to-amber-600 hover:border-transparent text-white font-bold py-4 rounded-xl flex justify-center items-center gap-2 shadow-xl transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed pointer-events-auto hover:shadow-[0_0_20px_rgba(85,130,98,0.4)]"
               >
                 {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Zap size={16} className="fill-emerald-400 text-emerald-400 group-hover:fill-white group-hover:text-emerald-100 transition-colors" />}
                 {isGenerating ? 'Processing...' : 'Generate Notes Now'}
                 <span className="bg-white/20 text-[10px] px-1.5 py-0.5 rounded ml-1 text-white/90">AI</span>
               </button>
            </div>
          </div>
          
        </div>
          </>
        )}
      </div>
      {/* Audio processing glassmorphic overlay */}
      {isProcessingAudio && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col justify-center items-center z-50 transition-all duration-300">
          <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 max-w-md w-full flex flex-col items-center shadow-2xl relative overflow-hidden">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin"></div>
              <Loader2 className="absolute inset-0 m-auto text-emerald-400 w-10 h-10 animate-spin" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-white text-center">Processing Audio File</h3>
            <div className="bg-gray-900/60 w-full py-3 px-4 rounded-xl border border-gray-700/50 font-mono text-xs text-emerald-400 text-center animate-pulse">
              {audioProgressText}
            </div>
          </div>
        </div>
      )}
      <NameModal 
        isOpen={isNameModalOpen} 
        initialName={username}
        onClose={username ? () => setIsNameModalOpen(false) : undefined}
        onSubmit={(name) => {
          localStorage.setItem('username', name);
          setUsername(name);
          setIsNameModalOpen(false);
        }} 
      />
      <DocumentModal 
        isOpen={isDocumentModalOpen} 
        onClose={() => setIsDocumentModalOpen(false)} 
        sessions={sessions}
        onDeleteSession={deleteSession}
        onLoadTranscript={(text, preGeneratedNotes, sessionId) => {
          setTranscript(text);
          setCurrentView('live');
          if (sessionId) sessionIdRef.current = sessionId;
          if (preGeneratedNotes) {
            setNotes(preGeneratedNotes);
          } else {
            setNotes('### Your AI notes will appear here...');
          }
          lastProcessedIndex.current = 0;
        }} 
      />
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        sessions={sessions}
        onDeleteSession={deleteSession}
        onLoadTranscript={(text, sessionId) => {
          setTranscript(text);
          setCurrentView('live');
          if (sessionId) sessionIdRef.current = sessionId;
          setNotes('### Your AI notes will appear here...');
          lastProcessedIndex.current = 0;
        }}
      />
      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        sessions={sessions}
        onDeleteSession={deleteSession}
        onLoadTranscript={(text, sessionId) => {
          setTranscript(text);
          setCurrentView('live');
          if (sessionId) sessionIdRef.current = sessionId;
          setNotes('### Your AI notes will appear here...');
          lastProcessedIndex.current = 0;
        }}
      />
      <video ref={hiddenVideoRef} autoPlay muted playsInline style={{ display: 'none' }} />
      <canvas ref={captureCanvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default App;
