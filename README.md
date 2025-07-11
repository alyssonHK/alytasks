# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy no GitHub Pages

1. Ajuste o arquivo `vite.config.ts` para conter:
   ```js
   base: '/alytasks/'
   ```
2. Instale a dependência de deploy:
   ```sh
   npm install --save-dev gh-pages
   ```
3. Faça o build do projeto:
   ```sh
   npm run build
   ```
4. Faça o deploy para o GitHub Pages:
   ```sh
   npm run deploy
   ```
5. Configure o GitHub Pages para servir a partir do branch `gh-pages`.
