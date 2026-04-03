document.addEventListener("DOMContentLoaded", () => {
    // 1. Core Variables
    const chatHistoryDiv = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const micBtn = document.getElementById('mic-btn');
    
    // Audio Control Variables
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');

    let memory = []; // Stores the last 10 pairs of messages for Gemini context
    const MAX_HISTORY = 20; // 10 user msgs + 10 AI msgs

    // 2. Speech-to-Text (STT) Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            micBtn.style.color = '#ff4757'; // Turn red when listening
            chatInput.placeholder = "Listening...";
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            chatInput.value = transcript;
            sendMessage(); // Auto-send when done speaking
        };

        recognition.onend = () => {
            micBtn.style.color = 'white';
            chatInput.placeholder = "Ask a question or explain a topic...";
        };
    } else {
        micBtn.style.display = 'none'; // Hide if browser doesn't support STT
    }

    micBtn.addEventListener('click', () => {
        if (recognition) recognition.start();
    });

    // 3. Text-to-Speech (TTS) Setup & Controls
    window.speakText = function(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Stop current speech if any
            
            // Remove Markdown symbols (* and #) so it sounds natural when spoken
            const cleanText = text.replace(/[*#]/g, '');
            const utterance = new SpeechSynthesisUtterance(cleanText);
            
            utterance.lang = 'en-US';
            utterance.rate = 1.0; 
            window.speechSynthesis.speak(utterance);
        }
    };

  // Play Button functionality (Resumes paused speech)
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if ('speechSynthesis' in window && window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
        });
    }

    // Pause Button functionality (Pauses active speech)
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
                window.speechSynthesis.pause();
            }
        });
    }

    // Stop Button functionality (Completely cuts off the speech)
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            if ('speechSynthesis' in window) {
                // THE FIX: Force a resume right before cancelling to clear browser bugs
                window.speechSynthesis.resume(); 
                window.speechSynthesis.cancel();
            }
        });
    }

    // Safety: Stop talking if the user leaves the page!
    window.addEventListener('beforeunload', () => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    });

    // 4. Send Message Logic
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        // Stop any current reading when the user asks a new question
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }

        // Add user msg to UI & Memory
        appendMessage('user', text);
        chatInput.value = '';
        memory.push({ role: 'user', content: text });

        // Maintain Max History (Keep last 10 exchanges)
        if (memory.length > MAX_HISTORY) memory = memory.slice(memory.length - MAX_HISTORY);

        // Loading indicator
        const loadingId = appendMessage('model', '<i class="fa-solid fa-circle-notch fa-spin"></i> Thinking...');

        try {
            // FIX: Replaced localhost and undefined endpoint with the exact relative path
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: text, 
                    history: memory.slice(0, -1) // Send history excluding the current message
                }) 
            });
            const data = await response.json();
            
            // Remove loading indicator
            document.getElementById(loadingId).remove();

            if (data.status === 'success') {
                const reply = data.reply;
                appendMessage('model', reply);
                memory.push({ role: 'model', content: reply });
                
                // Auto-speak response (optional, can comment this out to rely only on the speaker icon)
                speakText(reply);
            } else {
                appendMessage('model', "Error: " + data.detail);
            }
        } catch (error) {
            document.getElementById(loadingId).remove();
            appendMessage('model', "Connection failed. Please check the backend.");
            console.error(error);
        }
    }

    // 5. UI Rendering Helper
    function appendMessage(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role === 'user' ? 'msg-user' : 'msg-ai'}`;
        const uniqueId = 'msg-' + Date.now();
        msgDiv.id = uniqueId;

        // Basic Markdown bold parser for visual appeal
        let displayText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        displayText = displayText.replace(/\n/g, '<br>');

        msgDiv.innerHTML = `<span>${displayText}</span>`;

        // Add Speaker icon to AI messages (Starts reading this specific message)
        if (role === 'model' && !text.includes('fa-spin')) {
            const ttsIcon = document.createElement('i');
            ttsIcon.className = 'fa-solid fa-volume-high tts-btn';
            ttsIcon.title = "Read aloud from start";
            ttsIcon.onclick = () => speakText(text);
            msgDiv.appendChild(ttsIcon);
        }

        chatHistoryDiv.appendChild(msgDiv);
        chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight; // Auto-scroll to bottom
        
        return uniqueId;
    }
});