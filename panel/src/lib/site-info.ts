// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
// Informações fixas de autoria e apoio ao projeto.
// A chave PIX é fixa por decisão do autor: não deve ser alterada pelo painel.

import pixQr from '@/../public/pix-qr.png';

export const AUTHOR_NAME = 'Anderson';
export const AUTHOR_SITE = 'https://zeroboot.com.br';

/** Chave PIX usada para doações voluntárias (somente leitura). */
export const PIX_KEY = 'c4a626b1-ce53-4bd3-ab85-715e2dee64bd';

/** QR Code (PIX estático) correspondente à chave acima. */
export const PIX_QR_SRC = pixQr.src;
