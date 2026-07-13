// ============================================================
// PUBLIC-2D/CONVERSATION.JS — Question/answer panel (client side)
// ============================================================
// Renders the private question-and-answer exchange for whichever
// conversation the server just told THIS client it's part of. Every
// piece of data here comes from a per-socket server event
// ('conversationStarted' / 'questionAsked' / 'conversationEnded') —
// the server never sends this client any other player's conversation,
// so there's nothing to filter or hide client-side; there's simply
// nothing else to show.
//
// Per Phase 8 spec, movement is never disabled during a conversation
// — this module only shows/hides an overlay panel, it never touches
// input.js or the player's ability to move.
// ============================================================

import socket from './socket.js';

const panelEl = document.getElementById('conversation-panel');
const otherNameEl = document.getElementById('conversation-other-name');
const questionDisplayEl = document.getElementById('conversation-question-display');
const questionInputWrapEl = document.getElementById('conversation-question-input-wrap');
const questionInputEl = document.getElementById('conversation-question-input');
const questionSendBtn = document.getElementById('conversation-question-send');
const answerInputWrapEl = document.getElementById('conversation-answer-input-wrap');
const answerInputEl = document.getElementById('conversation-answer-input');
const answerSendBtn = document.getElementById('conversation-answer-send');
const waitingEl = document.getElementById('conversation-waiting');
const conversationErrorEl = document.getElementById('conversation-error');

let currentConversationId = null;
let currentRole = null; // 'asker' | 'target'

function resetPanel() {
  currentConversationId = null;
  currentRole = null;
  questionDisplayEl.textContent = '';
  questionInputEl.value = '';
  answerInputEl.value = '';
  conversationErrorEl.textContent = '';
  panelEl.classList.add('hidden');
}

socket.on('conversationStarted', ({ conversationId, role, otherName }) => {
  currentConversationId = conversationId;
  currentRole = role;

  otherNameEl.textContent = otherName;
  questionDisplayEl.textContent = '';
  questionInputEl.value = '';
  answerInputEl.value = '';
  conversationErrorEl.textContent = '';
  panelEl.classList.remove('hidden');

  if (role === 'asker') {
    questionInputWrapEl.classList.remove('hidden');
    answerInputWrapEl.classList.add('hidden');
    waitingEl.classList.add('hidden');
  } else {
    questionInputWrapEl.classList.add('hidden');
    answerInputWrapEl.classList.add('hidden');
    waitingEl.classList.remove('hidden');
    waitingEl.textContent = `${otherName} is asking a question...`;
  }
});

questionSendBtn.addEventListener('click', () => {
  if (!currentConversationId) return;
  socket.emit(
    'submitQuestion',
    { conversationId: currentConversationId, question: questionInputEl.value },
    (res) => {
      if (res?.error) {
        conversationErrorEl.textContent = res.error;
        return;
      }
      questionInputWrapEl.classList.add('hidden');
    }
  );
});

socket.on('questionAsked', ({ conversationId, question }) => {
  if (conversationId !== currentConversationId) return;
  questionDisplayEl.textContent = `Q: ${question}`;
  if (currentRole === 'target') {
    waitingEl.classList.add('hidden');
    answerInputWrapEl.classList.remove('hidden');
  }
});

answerSendBtn.addEventListener('click', () => {
  if (!currentConversationId) return;
  socket.emit(
    'submitAnswer',
    { conversationId: currentConversationId, answer: answerInputEl.value },
    (res) => {
      if (res?.error) {
        conversationErrorEl.textContent = res.error;
      }
      // On success, the panel closes when 'conversationEnded' arrives
      // (below) — not here — so both participants close in response
      // to the same server event rather than the answerer closing
      // slightly ahead of the asker.
    }
  );
});

// Per spec: after the reply, the conversation automatically closes.
socket.on('conversationEnded', (record) => {
  if (record.id !== currentConversationId) return;
  resetPanel();
});

socket.on('conversationCancelled', ({ conversationId }) => {
  if (conversationId !== currentConversationId) return;
  conversationErrorEl.textContent = 'The other player disconnected.';
  setTimeout(resetPanel, 1500);
});
