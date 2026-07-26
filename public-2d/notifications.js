// ============================================================
// PUBLIC-2D/NOTIFICATIONS.JS — Lobby toast notifications
// ============================================================
// Renders small animated toasts for lobby-lifecycle events the
// server broadcasts via a single 'notification' event (see
// server/movement-network.js — join, leave, ready, notReady,
// matchStart). Purely presentational: this module has no opinion on
// *whether* something happened, only on how to briefly announce it.
// Self-contained — only imports socket.js, same independent-module
// pattern as every other lobby/gameplay display file.
// ============================================================

import socket from './socket.js';

const containerEl = document.getElementById('notification-container');

const MESSAGES = {
  join: (name) => `${name} joined the party`,
  leave: (name) => `${name} left the party`,
  ready: (name) => `${name} is Ready`,
  notReady: (name) => `${name} is Not Ready`,
  matchStart: (name) => `${name} started the match`,
};

const TOAST_LIFETIME_MS = 3200;

function showToast({ type, name }) {
  const build = MESSAGES[type];
  if (!build || !containerEl) return;

  const toast = document.createElement('div');
  toast.className = `notification-toast notification-toast-${type}`;
  toast.textContent = build(name);
  containerEl.appendChild(toast);

  // Trigger the enter transition on the next frame (adding the class
  // in the same frame the element is created wouldn't transition).
  requestAnimationFrame(() => {
    toast.classList.add('notification-toast-visible');
  });

  setTimeout(() => {
    toast.classList.remove('notification-toast-visible');
    toast.classList.add('notification-toast-leaving');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, TOAST_LIFETIME_MS);
}

socket.on('notification', showToast);
