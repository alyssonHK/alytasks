#!/bin/bash

# Script para deploy manual no GitHub Pages

echo "🚀 Iniciando deploy para GitHub Pages..."

# Verifica se o git está configurado
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Erro: Não é um repositório git"
    exit 1
fi

# Verifica se há mudanças não commitadas
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  Aviso: Há mudanças não commitadas"
    read -p "Deseja continuar mesmo assim? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deploy cancelado"
        exit 1
    fi
fi

# Verifica se a variável de ambiente está definida
if [ -z "$GEMINI_API_KEY" ]; then
    echo "⚠️  Aviso: GEMINI_API_KEY não está definida"
    read -p "Deseja continuar mesmo assim? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deploy cancelado"
        exit 1
    fi
fi

# Cria arquivo .env temporário
echo "📝 Criando arquivo .env..."
echo "GEMINI_API_KEY=$GEMINI_API_KEY" > .env
echo "NODE_ENV=production" >> .env

# Instala dependências
echo "📦 Instalando dependências..."
npm ci

# Build para GitHub Pages
echo "🔨 Fazendo build..."
npm run build:gh-pages

# Remove arquivo .env temporário
rm .env

# Verifica se o build foi bem-sucedido
if [ ! -d "dist" ]; then
    echo "❌ Erro: Build falhou - pasta dist não encontrada"
    exit 1
fi

echo "✅ Build concluído com sucesso!"
echo ""
echo "📋 Próximos passos:"
echo "1. Faça commit das mudanças:"
echo "   git add ."
echo "   git commit -m 'Deploy para GitHub Pages'"
echo ""
echo "2. Faça push para o GitHub:"
echo "   git push origin main"
echo ""
echo "3. O GitHub Actions irá fazer o deploy automaticamente"
echo "4. Aguarde alguns minutos e acesse: https://SEU_USUARIO.github.io/alytasks/" 