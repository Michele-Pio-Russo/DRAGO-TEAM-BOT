// src/discordText.js — Piccoli aiuti per il testo dei messaggi Discord.
//
// Il titolo di un embed è sempre piccolo e in grassetto e non accetta la
// formattazione. Per avere il titolo GRANDE (quello della formattazione Discord
// con "# ") lo scriviamo come prima riga della descrizione, che invece la accetta.

// Una riga sola, senza "#" iniziali (li aggiungiamo noi), lunghezza limitata.
function cleanTitle(title, max = 100) {
  return String(title ?? '').replace(/\s+/g, ' ').replace(/^#+\s*/, '').trim().slice(0, max);
}

// "# Titolo" + riga vuota + testo. level: 1 = grande, 2 = medio, 3 = piccolo.
function headingBlock(title, text = '', level = 1) {
  const t = cleanTitle(title);
  const hashes = '#'.repeat(Math.min(3, Math.max(1, level)));
  const body = String(text ?? '').trim();
  if (!t) return body;
  return body ? `${hashes} ${t}\n\n${body}` : `${hashes} ${t}`;
}

// Limite delle descrizioni degli embed: 4096 caratteri.
function clip(text, max = 4000) {
  const s = String(text ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

module.exports = { cleanTitle, headingBlock, clip };
