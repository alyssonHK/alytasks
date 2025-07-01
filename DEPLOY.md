# Deploy em Servidor

## Configuração para Acesso via IP Público

### 1. Desenvolvimento
```bash
npm run dev
```
- Acessível em: `http://SEU_IP:5173`
- Configurado para aceitar conexões de qualquer IP

### 2. Produção
```bash
# Build do projeto
npm run build

# Iniciar servidor de produção
npm run preview
```
- Acessível em: `http://SEU_IP:4173`
- Configurado para aceitar conexões de qualquer IP

### 3. Script Automático
```bash
# Dar permissão de execução
chmod +x start-server.sh

# Executar
./start-server.sh
```

## Portas Necessárias

- **5173**: Desenvolvimento (Vite dev server)
- **4173**: Produção (Vite preview server)

## Firewall

Certifique-se de que as portas estão abertas:
```bash
# Ubuntu/Debian
sudo ufw allow 5173
sudo ufw allow 4173

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=5173/tcp
sudo firewall-cmd --permanent --add-port=4173/tcp
sudo firewall-cmd --reload
```

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:
```env
GEMINI_API_KEY=sua_chave_api_aqui
```

## Process Manager (Opcional)

Para manter o servidor rodando:
```bash
# Instalar PM2
npm install -g pm2

# Iniciar com PM2
pm2 start npm --name "alytasks" -- run preview

# Verificar status
pm2 status

# Logs
pm2 logs alytasks
``` 