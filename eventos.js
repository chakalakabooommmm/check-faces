// eventos.js
const GOOGLE_API_KEY = 'AIzaSyCP2F0q6eyyFskTGj3jcjkhdfLP_11Wvz8';

const EVENTOS = [
  {
    id: 'teste1',
    nome: 'Teste 1',
    data: '15 de Outubro, 2026',
    capa: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
    // ⚠️ APENAS O ID DA PASTA PRINCIPAL DO EVENTO NO DRIVE:
    folderId: '1Um5fjJByddEjkCbIYfyaTa4i6DlVB_dr'
  }
];

{
    id: 'teste2',
    nome: 'Teste 2',
    data: '22 de Outubro, 2026',
    capa: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=800&q=80',
    folderId: '1zWX21qeUDzi3c0iELH0jnmTqcsF7vOnA'
  }
];

if (typeof module !== 'undefined') {
  module.exports = { EVENTOS, GOOGLE_API_KEY };
}
