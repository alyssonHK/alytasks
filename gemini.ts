/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { Task, Note, Subtask } from './types.js';
import { db, appId } from './firebase.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// The API key is handled by the execution environment.
const apiKey = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

const fetchSubtasksForTask = async (userId: string, taskId: string): Promise<Subtask[]> => {
    if (!userId) return [];
    try {
        const subtasksRef = collection(db, `artifacts/${appId}/users/${userId}/tasks/${taskId}/subtasks`);
        const q = query(subtasksRef, where("completed", "==", false));
        const subtasksSnap = await getDocs(q);
        return subtasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subtask));
    } catch (error) {
        console.error(`Failed to fetch subtasks for task ${taskId}:`, error);
        return [];
    }
};

export const getAiSummary = async (userId: string, tasks: Task[], notes: Note[]): Promise<string> => {
    if (!apiKey) {
        return "### Erro de Configuração\nChave de API do Gemini não configurada. A análise por IA está desativada.";
    }

    const model = 'gemini-2.5-flash-latest';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tasksWithSubtasks = await Promise.all(
        tasks.map(async (t) => {
            const pendingSubtasks = await fetchSubtasksForTask(userId, t.id);
            return {
                text: t.text,
                category: t.category || 'Sem Categoria',
                dueDate: t.dueDate ? t.dueDate.toDate().toLocaleDateString('pt-BR') : 'Nenhuma',
                isOverdue: t.dueDate ? t.dueDate.toDate() < today : false,
                pendingSubtasks: pendingSubtasks.map(st => st.text),
            };
        })
    );

    const noteDetails = notes.map(n => n.text);

    const prompt = `
    Você é um assistente de produtividade especialista. Analise as tarefas e anotações pendentes de um usuário.
    A data de hoje é ${today.toLocaleDateString('pt-BR')}.

    Sua resposta deve ser em Português do Brasil. Formate a resposta usando markdown.
    Siga esta estrutura:
    1.  Comece com um resumo geral e uma frase de encorajamento.
    2.  Use um cabeçalho "### Tarefas Atrasadas" e liste todas as tarefas cujo campo 'isOverdue' é true. Destaque o nome da tarefa em negrito. Se não houver, diga "Nenhuma tarefa atrasada. Ótimo trabalho!".
    3.  Use um cabeçalho "### Próximas Tarefas por Categoria" e agrupe as tarefas pendentes restantes por sua categoria. Liste as tarefas e suas subtarefas pendentes.
    4.  Use um cabeçalho "### Resumo das Anotações" e forneça um breve resumo dos tópicos encontrados nas anotações gerais.
    5.  Conclua com "### Sugestões" e ofereça 1 ou 2 sugestões claras e acionáveis sobre no que o usuário deve se concentrar a seguir, com base nas tarefas atrasadas e próximas.

    --- DADOS DO USUÁRIO ---

    TAREFAS PENDENTES (com subtarefas pendentes):
    ${JSON.stringify(tasksWithSubtasks, null, 2)}

    ANOTAÇÕES GERAIS:
    ${JSON.stringify(noteDetails, null, 2)}
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });
        
        return response.text;

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new Error("Desculpe, ocorreu um erro ao gerar a análise de IA. Verifique sua chave de API e tente novamente.");
    }
};