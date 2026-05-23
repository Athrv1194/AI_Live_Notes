import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Mic, MicOff, FileText, Loader2, Upload, Download, ScreenShare, ScreenShareOff, Trash2 } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import mermaid from 'mermaid';

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
    const originalElement = document.getElementById('notes-content');
    if (!originalElement) return;

    // Documents over ~20 pages will crash html2canvas due to the browser's hard 32,767 pixel height limit for Canvas elements.
    // Instead, we extract the raw rendered HTML and use the browser's native PDF engine which handles infinite pages instantly.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to download the PDF.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Lecture_Notes_${new Date().toLocaleDateString().replace(/\//g, '-')}</title>
          <style>
            @page { margin: 20mm; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              color: #111827; 
              line-height: 1.6; 
              max-width: 900px;
              margin: 0 auto;
            }
            h1, h2, h3, h4 { color: #000; margin-top: 1.5em; margin-bottom: 0.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
            p { margin-bottom: 1em; }
            ul, ol { margin-bottom: 1em; padding-left: 2em; }
            li { margin-bottom: 0.5em; }
            pre { background: #f3f4f6; padding: 15px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; }
            code { font-family: monospace; background: #f3f4f6; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
            img, svg { max-width: 100%; height: auto; display: block; margin: 1em 0; page-break-inside: avoid; }
            hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
            
            /* Hide the cursor blinking if it was copied over */
            .blinking-cursor { display: none !important; }
          </style>
        </head>
        <body>
          ${originalElement.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    // Give the browser 500ms to render the SVGs and styles before triggering the PDF dialog
    setTimeout(() => {
      printWindow.print();
    }, 500);
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

  const handleDetailLevelChange = (e) => {
    setNoteDetailLevel(e.target.value);
    // Reset everything so the user can regenerate all notes with the new style
    lastProcessedIndex.current = 0;
    setNotes('### Your AI notes will appear here...');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="text-blue-400" /> Live AI Notes
        </h1>
        <div className="flex gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all bg-gray-700 hover:bg-gray-600 text-white"
          >
            <Upload size={20} /> Upload Transcript (.txt, .md)
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".txt,.md"
            className="hidden"
          />
          <button
            onClick={() => audioFileInputRef.current?.click()}
            className="flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20"
          >
            <Upload size={20} /> Upload Audio (.mp3, .wav, ...)
          </button>
          <input
            type="file"
            ref={audioFileInputRef}
            onChange={handleAudioFileUpload}
            accept="audio/*"
            className="hidden"
          />
          <button
            onClick={toggleSystemCapture}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all ${isSystemCapturing
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-indigo-500/20'
              }`}
          >
            {isSystemCapturing ? <><ScreenShareOff size={20} /> Stop Zoom/System</> : <><ScreenShare size={20} /> Capture Zoom/System</>}
          </button>
          <button
            onClick={toggleRecording}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
              }`}
          >
            {isRecording ? <><MicOff size={20} /> Stop Mic</> : <><Mic size={20} /> Capture Mic</>}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[75vh]">
        {/* Left Column: Transcript */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-300 flex items-center gap-2">
                Live Transcript
                <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-full font-mono">
                  {transcript.trim().split(/\s+/).filter(w => w.length > 0).length} words
                </span>
              </h2>
              {transcript && (
                <button
                  onClick={handleClearTranscript}
                  title="Clear Transcript"
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-gray-700/50 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-900/50 p-4 rounded-lg font-mono text-sm text-gray-400 whitespace-pre-wrap leading-relaxed">
            {transcript || "Click 'Start Capture' and begin speaking, or click 'Upload File' to load a transcript..."}
          </div>
          <div className="flex flex-col gap-2 mt-4">
            <div className="flex items-center space-x-2 bg-gray-900 border border-gray-800 rounded-lg p-2.5">
              <input
                type="checkbox"
                id="vision-toggle"
                checked={isVisionEnabled}
                onChange={(e) => setIsVisionEnabled(e.target.checked)}
                disabled={isSystemCapturing}
                className="w-4 h-4 text-cyan-500 bg-gray-800 border-gray-700 rounded focus:ring-cyan-600 focus:ring-2"
              />
              <label htmlFor="vision-toggle" className="text-sm font-medium text-gray-300">
                Enable AI Vision (Extracts slides & diagrams)
              </label>
            </div>

            <button
              onClick={generateNotes}
              disabled={!transcript || isGenerating}
              className={`w-full disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-lg font-bold flex flex-col justify-center items-center gap-1 transition-all ${isGenerating ? 'bg-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
              <div className="flex items-center gap-2">
                {isGenerating ? <><Loader2 className="animate-spin" /> Processing...</> : 'Generate Smart Notes Now'}
              </div>
              {isGenerating && generationStatus && (
                <span className="text-xs text-emerald-300 animate-pulse font-normal tracking-wide">{generationStatus}</span>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: AI Notes Area */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-emerald-400 flex items-center gap-2">
                Structured Study Notes
              </h2>
              {!notes.includes('### Your AI notes will appear here...') && (
                <button
                  onClick={handleClearNotes}
                  title="Clear Notes"
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-gray-700/50 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <select
                value={noteDetailLevel}
                onChange={handleDetailLevelChange}
                className="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block px-3 py-1.5"
              >
                <option value="detailed">Detailed Notes</option>
                <option value="short">Short Bullet Points</option>
              </select>
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              >
                <Download size={16} /> Download PDF
              </button>
            </div>
          </div>
          <div id="notes-content" className="flex-1 overflow-y-auto bg-gray-900/50 p-6 rounded-lg prose prose-invert prose-emerald max-w-none">
            <ReactMarkdown
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  if (!inline && match && match[1] === 'mermaid') {
                    return <Mermaid chart={String(children).replace(/\n$/, '')} />
                  }
                  return <code className={className} {...props}>{children}</code>
                }
              }}
            >
              {notes}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Audio processing glassmorphic overlay */}
      {isProcessingAudio && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col justify-center items-center z-50 transition-all duration-300">
          <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 max-w-md w-full flex flex-col items-center shadow-2xl relative overflow-hidden">
            {/* Spinning glowing gradient ring */}
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin"></div>
              <Loader2 className="absolute inset-0 m-auto text-emerald-400 w-10 h-10 animate-spin" />
            </div>

            <h3 className="text-xl font-bold mb-2 text-white text-center">Processing Audio File</h3>
            <p className="text-gray-400 text-center text-sm px-4 leading-relaxed mb-4">
              We decode your file, resample it to 16kHz mono, and transcribe it block-by-block. This avoids file size limits and ensures perfect transcription.
            </p>

            {/* Dynamic Status Text */}
            <div className="bg-gray-900/60 w-full py-3 px-4 rounded-xl border border-gray-700/50 font-mono text-xs text-emerald-400 text-center animate-pulse">
              {audioProgressText}
            </div>
          </div>
        </div>
      )}
      <video ref={hiddenVideoRef} autoPlay muted playsInline style={{ display: 'none' }} />
      <canvas ref={captureCanvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default App;
