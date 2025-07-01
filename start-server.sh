#!/bin/bash

# Script para iniciar o servidor em produção
echo "Iniciando servidor de produção..."

# Verifica se o build existe
if [ ! -d "dist" ]; then
    echo "Build não encontrado. Executando build..."
    npm run build
fi

# Inicia o servidor de preview
echo "Iniciando servidor na porta 4173..."
npm run preview 