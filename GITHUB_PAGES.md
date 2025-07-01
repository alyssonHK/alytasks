# Deploy no GitHub Pages

## Configuração Automática

### 1. Preparação do Repositório

1. **Crie um repositório** no GitHub com o nome `alytasks`
2. **Faça push** do código para o repositório
3. **Configure as Secrets** no GitHub:
   - Vá em `Settings` > `Secrets and variables` > `Actions`
   - Adicione `GEMINI_API_KEY` com sua chave da API

### 2. Configuração do GitHub Pages

1. **Vá em Settings** do repositório
2. **Role até "Pages"** na barra lateral
3. **Configure:**
   - Source: `Deploy from a branch`
   - Branch: `gh-pages`
   - Folder: `/ (root)`
4. **Clique em Save**

### 3. Deploy Automático

O workflow `.github/workflows/deploy.yml` irá:
- Executar automaticamente a cada push na branch `main` ou `master`
- Fazer build do projeto
- Deployar para a branch `gh-pages`
- Atualizar o site automaticamente

## URL do Site

Após o deploy, seu site estará disponível em:
```
https://SEU_USUARIO.github.io/alytasks/
```

## Deploy Manual

Se quiser fazer deploy manual:

```bash
# Build específico para GitHub Pages
npm run build:gh-pages

# Preview local
npm run preview:gh-pages
```

## Configurações Importantes

### Base Path
O projeto está configurado com `base: '/alytasks/'` para funcionar no GitHub Pages.

### Variáveis de Ambiente
- `GEMINI_API_KEY` deve ser configurada como secret no GitHub
- O workflow cria automaticamente o arquivo `.env` durante o build

### Firebase
Certifique-se de que as configurações do Firebase permitem acesso do domínio do GitHub Pages.

## Troubleshooting

### Problema: Assets não carregam
- Verifique se o `base` path está correto no `vite.config.gh-pages.ts`
- Confirme que o nome do repositório está correto

### Problema: Firebase não funciona
- Adicione `*.github.io` aos domínios autorizados no Firebase Console
- Verifique as regras de segurança do Firestore

### Problema: API não funciona
- Confirme que a secret `GEMINI_API_KEY` está configurada
- Verifique os logs do workflow no GitHub Actions

## Domínio Customizado

Para usar um domínio próprio:

1. **Configure o domínio** no GitHub Pages
2. **Adicione o domínio** no arquivo `CNAME` na raiz do projeto
3. **Atualize o workflow** para incluir o domínio no `cname`

```yaml
with:
  github_token: ${{ secrets.GITHUB_TOKEN }}
  publish_dir: ./dist
  cname: seu-dominio.com
``` 