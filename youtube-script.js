document.addEventListener("DOMContentLoaded", () => {
    // UI Elements
    const urlInput = document.getElementById('yt-url');
    const summarizeBtn = document.getElementById('summarize-btn');
    const statusMsg = document.getElementById('status-msg');

    const summarySection = document.getElementById('summary-section');
    const summaryContent = document.getElementById('summary-content');

    const chatSection = document.getElementById('chat-section');
    const chatHistoryDiv = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const micBtn = document.getElementById('mic-btn');

    // State
    let currentVideoId = null; // Stores the active video for the chat
    let chatMemory = [];
    const MAX_HISTORY = 10;

    // --- 1. SUMMARIZE LOGIC ---
    summarizeBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) return;

        // Reset UI
        statusMsg.style.display = 'block';
        statusMsg.style.color = '#fff';
        statusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing video and generating notes...';
        summarySection.style.display = 'none';
        chatSection.style.display = 'none';
        chatHistoryDiv.innerHTML = ''; // Clear old chat
        chatMemory = [];

        try {
            const response = await fetch('/api/youtube-summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            const data = await response.json();

            if (data.status === 'success') {
                statusMsg.style.display = 'none';
                currentVideoId = data.video_id; // Save ID for the chat context!

                // Format Markdown
                let formattedText = data.summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                formattedText = formattedText.replace(/\n/g, '<br>');

                summaryContent.innerHTML = formattedText;
                summarySection.style.display = 'block';

                // Reveal Chat
                chatSection.style.display = 'block';
                appendMessage('model', "I have summarized the video! Ask me any specific questions about its content.");

            } else {
                statusMsg.style.color = '#ff4757';
                statusMsg.innerHTML = `⚠️ Error: ${data.detail}`;
            }
        } catch (error) {
            statusMsg.style.color = '#ff4757';
            statusMsg.innerHTML = `⚠️ Connection failed.`;
        }
    });

    // --- 2. CHAT LOGIC ---
    sendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });

    async function sendChatMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentVideoId) return;

        appendMessage('user', text);
        chatInput.value = '';
        chatMemory.push({ role: 'user', content: text });

        if (chatMemory.length > MAX_HISTORY) chatMemory = chatMemory.slice(chatMemory.length - MAX_HISTORY);

        const loadingId = appendMessage('model', '<i class="fa-solid fa-circle-notch fa-spin"></i> Checking transcript...');

        try {
            const response = await fetch('/api/youtube-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video_id: currentVideoId, // Pass the active video context
                    message: text,
                    history: chatMemory.slice(0, -1)
                })
            });
            const data = await response.json();

            document.getElementById(loadingId).remove();

            if (data.status === 'success') {
                appendMessage('model', data.reply);
                chatMemory.push({ role: 'model', content: data.reply });
            } else {
                appendMessage('model', "Error: " + data.detail);
            }
        } catch (error) {
            document.getElementById(loadingId).remove();
            appendMessage('model', "Connection failed.");
        }
    }

    // --- 3. UI HELPER & TTS ---
    window.speakText = function (text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const cleanText = text.replace(/[*#]/g, '');
            const utterance = new SpeechSynthesisUtterance(cleanText);
            window.speechSynthesis.speak(utterance);
        }
    };

    document.getElementById('play-btn').addEventListener('click', () => {
        if ('speechSynthesis' in window && window.speechSynthesis.paused) window.speechSynthesis.resume();
    });

    document.getElementById('pause-btn').addEventListener('click', () => {
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) window.speechSynthesis.pause();
    });

    function appendMessage(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role === 'user' ? 'msg-user' : 'msg-ai'}`;
        const uniqueId = 'msg-' + Date.now();
        msgDiv.id = uniqueId;

        let displayText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        displayText = displayText.replace(/\n/g, '<br>');

        msgDiv.innerHTML = `<span>${displayText}</span>`;

        if (role === 'model' && !text.includes('fa-spin')) {
            const ttsIcon = document.createElement('i');
            ttsIcon.className = 'fa-solid fa-volume-high tts-btn';
            ttsIcon.onclick = () => speakText(text);
            msgDiv.appendChild(ttsIcon);
        }

        chatHistoryDiv.appendChild(msgDiv);
        chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
        return uniqueId;
    }

    // --- 4. SPEECH TO TEXT (STT) ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;

        recognition.onstart = () => {
            micBtn.style.color = '#ff4757';
            chatInput.placeholder = "Listening...";
        };
        recognition.onresult = (event) => {
            chatInput.value = event.results[0][0].transcript;
            sendChatMessage();
        };
        recognition.onend = () => {
            micBtn.style.color = 'white';
            chatInput.placeholder = "What else would you like to know?";
        };

        micBtn.addEventListener('click', () => {
            if (recognition) recognition.start();
        });
    } else {
        micBtn.style.display = 'none';
    }
});