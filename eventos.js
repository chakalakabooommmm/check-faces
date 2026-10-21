// eventos.js
const GOOGLE_API_KEY = 'AIzaSyCP2F0q6eyyFskTGj3jcjkhdfLP_11Wvz8';

const EVENTOS = [
  {
    id: 'Teste 1',
    nome: 'Nome Teste 1',
    data: '15 de Outubro, 2026',
    // Foto de capa do card (pode ser link do Drive ou foto da internet)
    capa: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
    folders: [
      { id: 'coquetel', name: 'coquetel', folderId: '1jx6P6ZL852ti_0v3CIozJx4IjF98BQo9' },
      { id: 'exibição',     name: 'exibição',  folderId: '1whd1ealZ21Yl_W1z3kw-n_pvCPY000pJ' }
    ]
  },
  {
    id: 'Teste 2',
    nome: 'Nome Teste 2',
    data: '20 de Novembro, 2026',
    capa: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=800&q=80',
    folders: [
      { id: 'red carpet', name: '🎓 Colação',   folderId: '1h7mKXUEA6wsdD8Mf-3n7B9V-xfnM0Pg-' },
      
    ]
  }
];

// Exporta para ser usado tanto no navegador quanto no Node.js (Robô)
if (typeof module !== 'undefined') {
  module.exports = { EVENTOS, GOOGLE_API_KEY };
}
