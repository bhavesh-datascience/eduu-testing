document.addEventListener("DOMContentLoaded", () => {
    // 1. UI Elements
    const uploadSection = document.getElementById('upload-section');
    const chatSection = document.getElementById('chat-section');
    const fileInput = document.getElementById('pdf-upload-input');
    const uploadIndicator = document.getElementById('uploading-indicator');
    const activePdfName = document.getElementById('active-pdf-name');
    const uploadBox = document.querySelector('.upload-box');
    
    // 2. Chat Elements
    const chatHistoryDiv = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const micBtn = document.getElementById('mic-btn');

    let memory = []; 
    const MAX_HISTORY = 20;
    let currentPdfId = null; // Stores the secure ID Google gives us

    // --- HANDLE PDF UPLOAD ---
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Hide upload box, show loading spinner
        uploadBox.style.display = 'none';
        uploadIndicator.style.display = 'block';

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch('http://localhost:8000/api/upload-pdf', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (response.ok && data.status === 'success') {
                currentPdfId = data.pdf_name;
                activePdfName.textContent = data.display_name;
                
                // Transition UI to Chat Mode
                uploadSection.style.display = 'none';
                chatSection.style.display = 'flex'; // Reveals the chat-wrapper properly
            } else {
                alert("Upload failed: " + data.detail);
                location.reload(); 
            }
        } catch (error) {
            console.error("Upload Error:", error);
            alert("Connection error. Ensure your FastAPI server is running.");
            location.reload();
        }
    });

    // --- HANDLE CHAT ---
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => { 
        if (e.key === 'Enter') sendMessage(); 
    });

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentPdfId) return;

        // Append user message
        appendMessage('user', text);
        chatInput.value = '';
        memory.push({ role: 'user', content: text });

        if (memory.length > MAX_HISTORY) memory = memory.slice(memory.length - MAX_HISTORY);

        const loadingId = appendMessage('model', '<i class="fa-solid fa-circle-notch fa-spin"></i> Reading Document...');

        try {
            const response = await fetch('http://localhost:8000/api/chat-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: text, 
                    pdf_name: currentPdfId, // Sending the document ID reference
                    history: memory.slice(0, -1) 
                }) 
            });
            const data = await response.json();
            
            document.getElementById(loadingId).remove();

            if (response.ok && data.status === 'success') {
                const reply = data.reply;
                appendMessage('model', reply);
                memory.push({ role: 'model', content: reply });
            } else {
                appendMessage('model', "Error: " + (data.detail || "Failed to get response"));
            }
        } catch (error) {
            document.getElementById(loadingId).remove();
            appendMessage('model', "Connection failed. Please check the backend.");
        }
    }

    // --- UI RENDERING (Identical to Chat AI logic) ---
    function appendMessage(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role === 'user' ? 'msg-user' : 'msg-ai'}`;
        const uniqueId = 'msg-' + Date.now();
        msgDiv.id = uniqueId;

        // Markdown Formatting
        let displayText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        displayText = displayText.replace(/\n/g, '<br>');
        msgDiv.innerHTML = `<span>${displayText}</span>`;

        // TTS Icon for AI messages
        if (role === 'model' && !text.includes('fa-spin')) {
            const ttsIcon = document.createElement('i');
            ttsIcon.className = 'fa-solid fa-volume-high tts-btn';
            ttsIcon.title = "Read aloud";
            ttsIcon.onclick = () => {
                if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    const cleanText = text.replace(/[*#]/g, '');
                    const utterance = new SpeechSynthesisUtterance(cleanText);
                    window.speechSynthesis.speak(utterance);
                }
            };
            msgDiv.appendChild(ttsIcon);
        }

        chatHistoryDiv.appendChild(msgDiv);
        chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
        return uniqueId;
    }

    // --- MICROPHONE LOGIC ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.onstart = () => { 
            micBtn.style.color = '#ff4757';
            chatInput.placeholder = "Listening..."; 
        };
        recognition.onresult = (event) => {
            chatInput.value = event.results[0][0].transcript;
            sendMessage();
        };
        recognition.onend = () => { 
            micBtn.style.color = 'rgba(255,255,255,0.7)';
            chatInput.placeholder = "Ask a question about this document..."; 
        };
    }
    
    micBtn.addEventListener('click', () => { 
        if (recognition) recognition.start(); 
    });
});