/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, getDocs, setDoc, Timestamp, increment, arrayUnion, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db, appId, initializeOfflinePersistence } from './firebase.js';
import { getAiSummary } from './gemini.js';
import { Task, Note, Subtask, FreeCard } from "./types.js";

// TypeScript declaration for the 'marked' library loaded from CDN
declare var marked: any;

const OFFLINE_SAVE_MESSAGE = "Você está offline. A alteração foi salva e será sincronizada em breve.";

// --- DOM ---
const dom = {
    appContainer: document.getElementById('app-container') as HTMLElement,
    noteInput: document.getElementById('note-input') as HTMLInputElement,
    noteIdInput: document.getElementById('note-id') as HTMLInputElement,
    saveNoteBtn: document.getElementById('save-note-btn') as HTMLButtonElement,
    notesList: document.getElementById('notes-list') as HTMLElement,
    currentDate: document.getElementById('current-date') as HTMLElement,
    taskInput: document.getElementById('task-input') as HTMLInputElement,
    addTaskBtn: document.getElementById('add-task-btn') as HTMLButtonElement,
    categorySelect: document.getElementById('category-select') as HTMLSelectElement,
    addCategoryBtn: document.getElementById('add-category-btn') as HTMLButtonElement,
    dueDateInput: document.getElementById('due-date-input') as HTMLInputElement,
    filterContainer: document.getElementById('filter-container') as HTMLElement,
    taskList: document.getElementById('task-list') as HTMLElement,
    toggleCompletedBtn: document.getElementById('toggle-completed-btn') as HTMLButtonElement,
    taskDetailModal: document.getElementById('task-detail-modal') as HTMLElement,
    closeDetailModalBtn: document.getElementById('close-detail-modal-btn') as HTMLButtonElement,
    detailTitleContainer: document.getElementById('detail-title-container') as HTMLElement,
    detailTaskTitle: document.getElementById('detail-task-title') as HTMLElement,
    detailEditContainer: document.getElementById('detail-edit-container') as HTMLElement,
    detailEditInput: document.getElementById('detail-edit-input') as HTMLInputElement,
    detailSaveBtn: document.getElementById('detail-save-btn') as HTMLButtonElement,
    detailCancelBtn: document.getElementById('detail-cancel-btn') as HTMLButtonElement,
    subtaskList: document.getElementById('subtask-list') as HTMLElement,
    subtaskInput: document.getElementById('subtask-input') as HTMLInputElement,
    addSubtaskBtn: document.getElementById('add-subtask-btn') as HTMLButtonElement,
    taskNotesList: document.getElementById('task-notes-list') as HTMLElement,
    taskNoteInput: document.getElementById('task-note-input') as HTMLInputElement,
    addTaskNoteBtn: document.getElementById('add-task-note-btn') as HTMLButtonElement,
    calendarBtn: document.getElementById('calendar-btn') as HTMLButtonElement,
    calendarModal: document.getElementById('calendar-modal') as HTMLElement,
    closeCalendarBtn: document.getElementById('close-calendar-btn') as HTMLButtonElement,
    prevMonthBtn: document.getElementById('prev-month-btn') as HTMLButtonElement,
    nextMonthBtn: document.getElementById('next-month-btn') as HTMLButtonElement,
    calendarMonthYear: document.getElementById('calendar-month-year') as HTMLElement,
    calendarGrid: document.getElementById('calendar-grid') as HTMLElement,
    detailsDayHeader: document.getElementById('details-day-header') as HTMLElement,
    detailsContent: document.getElementById('details-content') as HTMLElement,
    themeToggleBtn: document.getElementById('theme-toggle-btn') as HTMLButtonElement,
    loginContainer: document.getElementById('login-container') as HTMLElement,
    registerContainer: document.getElementById('register-container') as HTMLElement,
    loginForm: document.getElementById('login-form') as HTMLFormElement,
    registerForm: document.getElementById('register-form') as HTMLFormElement,
    loginError: document.getElementById('login-error') as HTMLElement,
    registerError: document.getElementById('register-error') as HTMLElement,
    showRegisterBtn: document.getElementById('show-register-btn') as HTMLButtonElement,
    showLoginBtn: document.getElementById('show-login-btn') as HTMLButtonElement,
    userMenuContainer: document.getElementById('user-menu-container') as HTMLElement,
    userMenuTrigger: document.getElementById('user-menu-trigger') as HTMLButtonElement,
    userMenuDropdown: document.getElementById('user-menu-dropdown') as HTMLElement,
    userEmail: document.getElementById('user-email') as HTMLElement,
    logoutBtn: document.getElementById('logout-btn') as HTMLButtonElement,
    categoryPopup: document.getElementById('category-popup') as HTMLElement,
    categoryPopupInput: document.getElementById('category-popup-input') as HTMLInputElement,
    categoryPopupAdd: document.getElementById('category-popup-add') as HTMLButtonElement,
    categoryPopupCancel: document.getElementById('category-popup-cancel') as HTMLButtonElement,
    aiAnalyzeBtn: document.getElementById('ai-analyze-btn') as HTMLButtonElement,
    aiAnalyzeModal: document.getElementById('ai-analyze-modal') as HTMLElement,
    aiAnalyzeContent: document.getElementById('ai-analyze-content') as HTMLElement,
    closeAiAnalyzeModal: document.getElementById('close-ai-analyze-modal') as HTMLButtonElement,
    connectionStatus: document.getElementById('connection-status') as HTMLElement,
    connectionDot: document.getElementById('connection-dot') as HTMLElement,
    connectionText: document.getElementById('connection-text') as HTMLElement,
    offlineBanner: document.getElementById('offline-banner') as HTMLElement,
    toastContainer: document.getElementById('toast-container') as HTMLElement,
    viewToggleBtn: document.getElementById('view-toggle-btn') as HTMLButtonElement,
    viewToggleIcon: document.getElementById('view-toggle-icon') as HTMLElement,
    mainContentApp: document.getElementById('main-content-app') as HTMLElement,
    canvasView: document.getElementById('canvas-view') as HTMLElement,
    taskCanvasContainer: document.getElementById('task-canvas-container') as HTMLElement,
    taskCanvas: document.getElementById('task-canvas') as HTMLElement,
    canvasLinesSvg: document.getElementById('canvas-lines-svg') as unknown as SVGElement,
    canvasTaskPopup: document.getElementById('canvas-task-popup') as HTMLElement,
    canvasPopupTitle: document.getElementById('canvas-popup-title') as HTMLElement,
    canvasPopupCloseBtn: document.getElementById('canvas-popup-close-btn') as HTMLButtonElement,
    canvasPopupSubtasks: document.getElementById('canvas-popup-subtasks') as HTMLElement,
    canvasPopupNotes: document.getElementById('canvas-popup-notes') as HTMLElement,
};

// --- State ---
let userId: string | null = null;
let notesCollectionRef: any, tasksCollectionRef: any, categoriesCollectionRef: any, freeCardsCollectionRef: any;
let currentFilter = 'Todos';
let showCompleted = false;
let activeTaskId: string | null = null;
let calendarDate = new Date();
let currentView: 'list' | 'canvas' = 'list';
let wasOffline = !navigator.onLine;
let canvasState = {
    isPanning: false,
    isDragging: false,
    isLinking: false,
    draggedNode: null as HTMLElement | null,
    linkStartNodeId: null as string | null,
    startX: 0,
    startY: 0,
    panOffsetX: 0,
    panOffsetY: 0,
    zoom: 1,
    nodeInitialX: 0,
    nodeInitialY: 0,
};
let tasksCache: Task[] = [];
let freeCardsCache: FreeCard[] = [];
let nodesCache: { [taskId: string]: HTMLElement } = {};
let freeCardNodesCache: { [freeCardId: string]: HTMLElement } = {};
let advancedTaskFilter = 'todas';

// --- Listener Management ---
let unsubs: { [key: string]: (() => void) | null } = {
    tasks: null,
    notes: null,
    categories: null,
    canvas_tasks: null,
    canvas_free_cards: null,
    task_details: null,
};

function unsubscribe(key: keyof typeof unsubs) {
    if (unsubs[key]) {
        unsubs[key]!();
        unsubs[key] = null;
    }
}

function unsubscribeAll() {
    Object.keys(unsubs).forEach(key => unsubscribe(key as keyof typeof unsubs));
}


// --- Event Listener Manager ---
const eventManager = {
    listeners: [] as { element: any, event: string, handler: (e: any) => void }[],
    add: function(element: any, event: string, handler: (e: any) => void) {
        if (!element) return;
        element.addEventListener(event, handler);
        this.listeners.push({ element, event, handler });
    },
    removeAll: function() {
        this.listeners.forEach(({ element, event, handler }) => {
            if (element) element.removeEventListener(event, handler);
        });
        this.listeners = [];
    }
};

// --- All Functions Declarations ---

function showToast(message: string, duration: number = 4000) {
    if (!dom.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Animate out and remove
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

function setButtonsDisabled(disabled: boolean) {
    dom.addTaskBtn.disabled = disabled;
    dom.saveNoteBtn.disabled = disabled;
    dom.addCategoryBtn.disabled = disabled;
}

function formatFirestoreTimestamp(timestamp: Timestamp) {
    if (!timestamp || !timestamp.toDate) return 'Indefinido';
    return timestamp.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function displayCurrentDate() {
    if(dom.currentDate) dom.currentDate.textContent = new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' });
}
function updateToggleCompletedButton() {
     if(dom.toggleCompletedBtn) dom.toggleCompletedBtn.innerHTML = showCompleted ? `<i class="fas fa-eye-slash"></i>` : `<i class="fas fa-eye"></i>`;
}

function updateConnectionStatus() {
    if (!dom.connectionStatus || !dom.connectionText || !dom.offlineBanner) return;

    const isOffline = !navigator.onLine;

    if (isOffline) {
        dom.connectionStatus.classList.remove('online');
        dom.connectionStatus.classList.add('offline');
        dom.connectionText.textContent = 'Offline';
        dom.connectionStatus.title = 'Você está offline. As alterações serão salvas e sincronizadas quando reconectar.';
        dom.aiAnalyzeBtn.disabled = true;
        dom.aiAnalyzeBtn.title = 'Análise com IA (Indisponível offline)';
        dom.offlineBanner.classList.remove('hidden');
    } else { // is online
        dom.connectionStatus.classList.remove('offline');
        dom.connectionStatus.classList.add('online');
        dom.connectionText.textContent = 'Online';
        dom.connectionStatus.title = 'Conectado ao servidor.';
        dom.aiAnalyzeBtn.disabled = false;
        dom.aiAnalyzeBtn.title = 'Análise com IA';
        dom.offlineBanner.classList.add('hidden');
    }

    if (isOffline && !wasOffline) { // Transitioned to offline
        showToast("Você perdeu a conexão. O aplicativo está em modo offline.", 5000);
    } else if (!isOffline && wasOffline) { // Transitioned to online
        showToast("Conexão restaurada. Sincronizando seus dados...", 4000);
    }
    
    wasOffline = isOffline;
}

async function handleAddTask() {
    const taskText = dom.taskInput.value.trim();
    if (!taskText || !tasksCollectionRef) return;
    let category: string | null = dom.categorySelect.value;
    if (category === 'Nenhuma') category = null;

    const dueDateValue = dom.dueDateInput.value;
    const dueDate = dueDateValue ? Timestamp.fromDate(new Date(dueDateValue + 'T00:00:00')) : null;
    await addDoc(tasksCollectionRef, { text: taskText, completed: false, category, createdAt: Timestamp.now(), dueDate, subtaskCount: 0, noteCount: 0, completedSubtaskCount: 0 });
    if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    dom.taskInput.value = ''; dom.dueDateInput.value = '';
}

async function handleAddFreeCard() {
    console.log('[Free Card] handleAddFreeCard chamada');
    
    const freeCardInput = document.getElementById('free-card-input') as HTMLTextAreaElement;
    if (!freeCardInput) {
        console.error('[Free Card] Input não encontrado');
        return;
    }
    
    const freeCardText = freeCardInput.value.trim();
    console.log('[Free Card] Texto:', freeCardText);
    
    if (!freeCardText) {
        console.warn('[Free Card] Texto vazio');
        showToast('Digite um texto para o card livre');
        return;
    }
    
    if (!freeCardsCollectionRef) {
        console.error('[Free Card] Collection ref não encontrada');
        showToast('Erro: Collection não configurada');
        return;
    }
    
    try {
        console.log('[Free Card] Salvando no Firestore...');
        const docRef = await addDoc(freeCardsCollectionRef, { 
            text: freeCardText, 
            createdAt: Timestamp.now(),
            connections: []
        });
        console.log('[Free Card] Documento criado com ID:', docRef.id);
        
        if (!navigator.onLine) {
            showToast(OFFLINE_SAVE_MESSAGE);
        } else {
            showToast('Card livre criado com sucesso!');
        }
        
        freeCardInput.value = '';
        hideFreeCardPopup();
    } catch (error) {
        console.error('[Free Card] Erro ao criar:', error);
        showToast('Erro ao criar card livre. Tente novamente.');
    }
}

async function handleSaveNote() {
    const noteText = dom.noteInput.value.trim();
    const noteId = dom.noteIdInput.value;
    if (!noteText || !notesCollectionRef) return;
    if (noteId) {
        await updateDoc(doc(notesCollectionRef, noteId), { text: noteText });
    } else {
        await addDoc(notesCollectionRef, { text: noteText, createdAt: Timestamp.now() });
    }
    if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    dom.noteInput.value = '';
    dom.noteIdInput.value = '';
}

function loadTasks() {
    if (!tasksCollectionRef) return;
    unsubscribe('tasks');
    let q = currentFilter === 'Todos' ? query(tasksCollectionRef) : query(tasksCollectionRef, where("category", "==", currentFilter));
    unsubs.tasks = onSnapshot(q, (snapshot) => {
        let tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
        // Filtros avançados
        if (advancedTaskFilter === 'antigas') {
            tasks.sort((a: Task, b: Task) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
        } else if (advancedTaskFilter === 'novas') {
            tasks.sort((a: Task, b: Task) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        } else if (advancedTaskFilter === 'incompletas') {
            tasks = tasks.filter((task: Task) => (task.subtaskCount || 0) > (task.completedSubtaskCount || 0));
        } else if (advancedTaskFilter === 'atrasadas') {
            const today = new Date();
            today.setHours(0,0,0,0);
            tasks = tasks.filter((task: Task) => task.dueDate && task.dueDate.toDate() < today && !task.completed);
        } else if (advancedTaskFilter === 'concluidas') {
            tasks = tasks.filter((task: Task) => task.completed);
        } else if (advancedTaskFilter === 'sem-categoria') {
            tasks = tasks.filter((task: Task) => !task.category || task.category === 'Nenhuma');
        }
        if (!showCompleted && advancedTaskFilter !== 'concluidas') tasks = tasks.filter((task: Task) => !task.completed);
        dom.taskList.innerHTML = '';
        tasks.forEach((task: Task) => renderTask(task.id, task));
    }, console.error);
}

function renderTask(id: string, data: Task) {
    const el = document.createElement('div');
    el.className = `task-item group p-3 rounded-lg border-b ${data.completed ? 'bg-green-50 text-gray-500' : 'bg-white'}`;
    
    let subtaskIconColor = 'text-gray-400';
    if (data.subtaskCount > 0) {
        if ((data.completedSubtaskCount || 0) === 0) {
            subtaskIconColor = 'text-red-500';
        } else if (data.completedSubtaskCount === data.subtaskCount) {
            subtaskIconColor = 'text-green-500';
        } else {
            subtaskIconColor = 'text-yellow-500';
        }
    }

    let indicatorIcons = '';
    if (data.subtaskCount > 0) indicatorIcons += `<span class="ml-2 ${subtaskIconColor}" title="${data.completedSubtaskCount || 0}/${data.subtaskCount} sub-tarefas concluídas"><i class="fa-solid fa-list-check"></i></span>`;
    if (data.noteCount > 0) indicatorIcons += `<span class="ml-2 text-gray-400" title="${data.noteCount} anotações"><i class="fa-solid fa-note-sticky"></i></span>`;
    const dueDateText = data.dueDate ? `<strong>Previsão:</strong> ${formatFirestoreTimestamp(data.dueDate)}` : '';
    el.innerHTML = `
        <div class="flex items-center">
            <input type="checkbox" data-id="${id}" ${data.completed ? 'checked' : ''} class="task-checkbox h-5 w-5 rounded border-gray-300">
            <div class="task-main-content ml-4 flex-grow" data-id="${id}" data-title="${data.text}">
                <div class="flex items-center">
                    <span class="${data.completed ? 'line-through' : ''}">${data.text}</span>
                    ${indicatorIcons}
                </div>
                 <div class="mt-1 text-xs text-gray-500 flex items-center gap-4">
                    <span><strong>Criada:</strong> ${formatFirestoreTimestamp(data.createdAt)}</span>
                    <span>${dueDateText}</span>
                </div>
            </div>
            <button class="delete-task text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100" data-id="${id}"><i class="fas fa-times"></i></button>
        </div>`;
    (el.querySelector('.task-checkbox') as HTMLInputElement).addEventListener('change', (e: Event) => {
        const target = e.target as HTMLInputElement;
        updateDoc(doc(tasksCollectionRef, id), { completed: target.checked, completedAt: target.checked ? Timestamp.now() : null });
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    });
    (el.querySelector('.delete-task') as HTMLButtonElement).addEventListener('click', (e) => { 
        e.stopPropagation(); 
        deleteDoc(doc(tasksCollectionRef, id));
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    });
    (el.querySelector('.task-main-content') as HTMLElement).addEventListener('click', () => openTaskDetailModal(id, data.text));
    dom.taskList.appendChild(el);
}

function loadNotes() {
    if (!notesCollectionRef) return;
    unsubscribe('notes');
    const q = query(notesCollectionRef);
    unsubs.notes = onSnapshot(q, (snapshot) => {
        dom.notesList.innerHTML = '';
         snapshot.docs.sort((a,b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis())
            .forEach(doc => renderNote(doc.id, doc.data() as Note));
    }, console.error);
}

function renderNote(id: string, data: Note) {
    const el = document.createElement('div');
    el.className = 'note-item bg-gray-100 p-2 rounded relative group';
    el.innerHTML = `<p class="note-text cursor-pointer">${data.text}</p>
        <div class="actions absolute top-1 right-1 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
             <button class="edit-note text-gray-500 hover:text-blue-600"><i class="fas fa-pencil-alt fa-xs"></i></button>
             <button data-id="${id}" class="delete-note text-red-400 hover:text-red-600"><i class="fas fa-times fa-xs"></i></button>
        </div>`;
    const editElements = el.querySelectorAll('.note-text, .edit-note');
    editElements.forEach(element => {
        element.addEventListener('click', () => {
            dom.noteInput.value = data.text;
            dom.noteIdInput.value = id;
            dom.noteInput.focus();
        });
    });
    (el.querySelector('.delete-note') as HTMLButtonElement).addEventListener('click', (e) => {
        e.stopPropagation(); 
        deleteDoc(doc(notesCollectionRef, id));
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    });
    dom.notesList.appendChild(el);
}

function loadCategories() {
    if (!categoriesCollectionRef) return;
    unsubscribe('categories');
    unsubs.categories = onSnapshot(categoriesCollectionRef, (snapshot) => {
        dom.categorySelect.innerHTML = '<option value="Nenhuma">Sem Categoria</option>';
        dom.filterContainer.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = 'filter-btn px-3 py-1 text-sm rounded-full';
        allBtn.textContent = 'Todos';
        allBtn.addEventListener('click', () => { currentFilter = 'Todos'; loadTasks(); updateActiveFilterButton(); });
        dom.filterContainer.appendChild(allBtn);
        snapshot.docs.forEach(categoryDoc => {
            const categoryName = categoryDoc.data().name;
            const option = document.createElement('option');
            option.value = categoryName; option.textContent = categoryName;
            dom.categorySelect.appendChild(option);
            const btn = document.createElement('button');
            btn.className = 'filter-btn px-3 py-1 text-sm rounded-full flex items-center gap-2 group';
            btn.textContent = categoryName; btn.dataset.category = categoryName;
            btn.addEventListener('click', () => { currentFilter = categoryName; loadTasks(); updateActiveFilterButton(); });
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-category-btn text-red-500 hover:text-red-700 ml-1 opacity-0 group-hover:opacity-100 transition-opacity';
            delBtn.title = 'Excluir categoria';
            delBtn.innerHTML = '<i class="fas fa-trash-alt fa-xs"></i>';
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Tem certeza que deseja excluir a categoria "${categoryName}"? Todas as tarefas associadas ficarão sem categoria.`)) {
                    await deleteDoc(doc(categoriesCollectionRef, categoryDoc.id));
                    if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
                }
            });
            btn.appendChild(delBtn);
            dom.filterContainer.appendChild(btn);
        });
        updateActiveFilterButton();
    }, console.error);
}

function updateActiveFilterButton() {
     document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        const btnText = (btn.textContent || '').replace(/<button.*<\/button>/, '').trim();
        if ( (btnText === 'Todos' && currentFilter === 'Todos') || (btn as HTMLElement).dataset.category === currentFilter) {
            btn.classList.add('active');
        }
    });
}

async function addNewCategory(name: string) { 
    if(name && categoriesCollectionRef) {
        await setDoc(doc(categoriesCollectionRef, name), { name });
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    }
}

function openTaskDetailModal(taskId: string, taskTitle: string) {
    activeTaskId = taskId;
    dom.detailTaskTitle.textContent = taskTitle;
    const basePath = `artifacts/${appId}/users/${userId}/tasks/${taskId}`;
    const subtasksRef = collection(db, `${basePath}/subtasks`);
    const taskNotesRef = collection(db, `${basePath}/taskNotes`);
    
    unsubscribe('task_details');

    const unsubSub = onSnapshot(query(subtasksRef), (snap) => {
        dom.subtaskList.innerHTML = '';
        snap.docs.sort((a,b)=> a.data().createdAt.toMillis() - b.data().createdAt.toMillis()).forEach(d => renderSubtask(d.id, d.data() as Subtask));
    });
    const unsubNotes = onSnapshot(query(taskNotesRef), (snap) => {
        dom.taskNotesList.innerHTML = '';
        snap.docs.sort((a,b)=> a.data().createdAt.toMillis() - b.data().createdAt.toMillis()).forEach(d => renderTaskNote(d.id, d.data() as Note));
    });

    unsubs.task_details = () => {
        unsubSub();
        unsubNotes();
    };
    
    dom.taskDetailModal.classList.remove('hidden');

    // Preencher select de categoria
    const task = tasksCache.find(t => t.id === taskId);
    fillDetailCategorySelect(task?.category || null);
}

function closeTaskDetailModal() {
    unsubscribe('task_details');
    dom.taskDetailModal.classList.add('hidden');
    activeTaskId = null;
    dom.detailTitleContainer.classList.remove('hidden');
    dom.detailEditContainer.classList.add('hidden');
}

function toggleMainTaskEdit() {
    dom.detailTitleContainer.classList.toggle('hidden');
    dom.detailEditContainer.classList.toggle('hidden');
    dom.detailEditInput.value = dom.detailTaskTitle.textContent || '';
    dom.detailEditInput.focus();
    dom.detailSaveBtn.onclick = async () => {
        const newText = dom.detailEditInput.value.trim();
        if (newText && activeTaskId && tasksCollectionRef) {
            await updateDoc(doc(tasksCollectionRef, activeTaskId), { text: newText });
            if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
        }
        toggleMainTaskEdit();
    };
    dom.detailCancelBtn.onclick = () => toggleMainTaskEdit();
}

async function handleAddSubtask() {
    const text = dom.subtaskInput.value.trim(); if (!text || !activeTaskId || !userId || !tasksCollectionRef) return;
    const subtasksRef = collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`);
    await addDoc(subtasksRef, { text, completed: false, createdAt: Timestamp.now() });
    await updateDoc(doc(tasksCollectionRef, activeTaskId), { subtaskCount: increment(1) });
    if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    dom.subtaskInput.value = '';
}

function renderSubtask(id: string, data: Subtask) {
    const el = document.createElement('div');
    el.className = 'flex items-center bg-gray-100 p-2 rounded-lg group';
    el.innerHTML = `
        <div class="flex-grow flex items-center">
            <input type="checkbox" data-id="${id}" ${data.completed ? 'checked' : ''} class="subtask-checkbox h-4 w-4 rounded border-gray-300">
            <span class="subtask-text ml-3 ${data.completed ? 'line-through text-gray-500' : ''}">${data.text}</span>
        </div>
        <div class="subtask-actions flex items-center gap-2 opacity-0 group-hover:opacity-100">
            <button class="edit-subtask text-gray-400 hover:text-blue-500 text-sm"><i class="fas fa-pencil-alt"></i></button>
            <button class="delete-subtask text-gray-400 hover:text-red-500 text-sm" data-id="${id}"><i class="fas fa-trash-alt"></i></button>
        </div>`;
    (el.querySelector('.subtask-checkbox') as HTMLInputElement).addEventListener('change', async (e: Event) => {
        const target = e.target as HTMLInputElement;
        const incrementValue = target.checked ? 1 : -1;
        await updateDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id), { completed: target.checked });
        await updateDoc(doc(tasksCollectionRef, activeTaskId), { completedSubtaskCount: increment(incrementValue) });
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    });
    (el.querySelector('.delete-subtask') as HTMLButtonElement).addEventListener('click', async () => {
        if(data.completed) {
             await updateDoc(doc(tasksCollectionRef, activeTaskId), { subtaskCount: increment(-1), completedSubtaskCount: increment(-1) });
        } else {
             await updateDoc(doc(tasksCollectionRef, activeTaskId), { subtaskCount: increment(-1) });
        }
        await deleteDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id));
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    });
    (el.querySelector('.edit-subtask') as HTMLButtonElement).addEventListener('click', () => {
        const currentText = (el.querySelector('.subtask-text') as HTMLElement).textContent || '';
        el.innerHTML = `<input type="text" class="edit-subtask-input flex-grow p-1 border rounded" value="${currentText}">
                        <button class="save-subtask-edit bg-green-500 text-white px-2 py-1 rounded text-sm">Salvar</button>`;
        const input = el.querySelector('.edit-subtask-input') as HTMLInputElement;
        input.focus();
        (el.querySelector('.save-subtask-edit') as HTMLButtonElement).addEventListener('click', async () => {
            const newText = input.value.trim();
            if(newText) {
                await updateDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id), { text: newText });
                if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
            }
        });
    });
    dom.subtaskList.appendChild(el);
}
async function handleAddTaskNote() {
    const text = dom.taskNoteInput.value.trim(); if (!text || !activeTaskId || !userId || !tasksCollectionRef) return;
    const taskNotesRef = collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/taskNotes`);
    await addDoc(taskNotesRef, { text, createdAt: Timestamp.now() });
    await updateDoc(doc(tasksCollectionRef, activeTaskId), { noteCount: increment(1) });
    if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    dom.taskNoteInput.value = '';
}
function renderTaskNote(id: string, data: Note) {
    const el = document.createElement('div');
    el.className = 'bg-yellow-100 p-2 rounded-lg text-sm text-yellow-800 relative group';
    el.innerHTML = `
        <p class="task-note-text">${data.text}</p>
        <div class="task-note-actions absolute top-1 right-1 flex items-center gap-2 opacity-0 group-hover:opacity-100">
             <button class="edit-task-note text-yellow-600 hover:text-blue-600"><i class="fas fa-pencil-alt fa-xs"></i></button>
             <button class="delete-task-note text-yellow-600 hover:text-red-600" data-id="${id}"><i class="fas fa-times fa-xs"></i></button>
        </div>`;
    (el.querySelector('.delete-task-note') as HTMLButtonElement).addEventListener('click', async () => {
        await deleteDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/taskNotes`), id));
        await updateDoc(doc(tasksCollectionRef, activeTaskId), { noteCount: increment(-1) });
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    });
    (el.querySelector('.edit-task-note') as HTMLButtonElement).addEventListener('click', () => {
        const currentText = (el.querySelector('.task-note-text') as HTMLElement).textContent || '';
        el.innerHTML = `<textarea class="edit-task-note-input w-full p-1 border rounded">${currentText}</textarea>
                        <button class="save-task-note-edit w-full mt-1 bg-green-500 text-white px-2 py-1 rounded text-sm">Salvar</button>`;
        const textarea = el.querySelector('.edit-task-note-input') as HTMLTextAreaElement;
        textarea.focus();
        (el.querySelector('.save-task-note-edit') as HTMLButtonElement).addEventListener('click', async () => {
            const newText = textarea.value.trim();
            if(newText) {
                await updateDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/taskNotes`), id), { text: newText });
                if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
            }
        });
    });
    dom.taskNotesList.appendChild(el);
}

function openCalendar() { dom.calendarModal.classList.remove('hidden'); renderCalendar(); }
function closeCalendar() { dom.calendarModal.classList.add('hidden'); }
async function renderCalendar() {
     const year = calendarDate.getFullYear(); const month = calendarDate.getMonth();
    dom.calendarMonthYear.textContent = new Date(year, month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    dom.calendarGrid.innerHTML = '';
    const activeDays = await fetchActivityForMonth(year, month);
    const pendingDays = await fetchPendingDueDays(year, month);
    const firstDayOfMonth = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDayOfMonth; i++) dom.calendarGrid.appendChild(document.createElement('div'));
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day relative p-2 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-100 flex items-center justify-center';
        dayEl.textContent = day.toString();
        if (activeDays.has(day)) {
            const dot = document.createElement('div');
            dot.className = 'calendar-day-dot';
            dayEl.appendChild(dot);
        }
        if (pendingDays.has(day)) {
            const badge = document.createElement('div');
            badge.className = 'absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-orange-500';
            badge.title = 'Tarefa pendente para este dia';
            dayEl.appendChild(badge);
        }
        dayEl.addEventListener('click', () => {
            document.querySelectorAll('.calendar-day.selected').forEach(d => d.classList.remove('selected'));
            dayEl.classList.add('selected');
            showDayDetails(new Date(year, month, day));
        });
        dom.calendarGrid.appendChild(dayEl);
    }
}
async function fetchActivityForMonth(year: number, month: number) {
    if (!userId || !tasksCollectionRef || !notesCollectionRef) return new Set();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const activeDays = new Set<number>();
    const qTasks = query(tasksCollectionRef, where('createdAt', '>=', startOfMonth), where('createdAt', '<=', endOfMonth));
    const qNotes = query(notesCollectionRef, where('createdAt', '>=', startOfMonth), where('createdAt', '<=', endOfMonth));
    const [tasksSnap, notesSnap] = await Promise.all([getDocs(qTasks), getDocs(qNotes)]);
    tasksSnap.forEach(doc => activeDays.add(doc.data().createdAt.toDate().getDate()));
    notesSnap.forEach(doc => activeDays.add(doc.data().createdAt.toDate().getDate()));
    return activeDays;
}
async function fetchPendingDueDays(year: number, month: number) {
    if (!userId || !tasksCollectionRef) return new Set();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const q = query(tasksCollectionRef, where('dueDate', '>=', startOfMonth), where('dueDate', '<=', endOfMonth), where('completed', '==', false));
    const snap = await getDocs(q);
    const days = new Set<number>();
    snap.forEach(doc => {
        const due = doc.data().dueDate;
        if (due && due.toDate) days.add(due.toDate().getDate());
    });
    return days;
}
async function showDayDetails(date: Date) {
    if (!tasksCollectionRef || !notesCollectionRef) return;
    dom.detailsDayHeader.textContent = `Atividade de ${date.toLocaleDateString('pt-BR', {dateStyle: 'full'})}`;
    dom.detailsContent.innerHTML = 'Carregando...';
    const startOfDay = new Date(date.setHours(0,0,0,0));
    const endOfDay = new Date(date.setHours(23,59,59,999));
    const qTasks = query(tasksCollectionRef, where('createdAt', '>=', startOfDay), where('createdAt', '<=', endOfDay));
    const qNotes = query(notesCollectionRef, where('createdAt', '>=', startOfDay), where('createdAt', '<=', endOfDay));
    const qDue = query(tasksCollectionRef, where('dueDate', '>=', startOfDay), where('dueDate', '<=', endOfDay));
    const [tasksSnap, notesSnap, dueSnap] = await Promise.all([ getDocs(qTasks), getDocs(qNotes), getDocs(qDue) ]);
    let html = '';
    if (!dueSnap.empty) {
        html += '<div class="mb-4"><h4 class="font-bold text-orange-500">Tarefas agendadas para esse dia</h4>';
        dueSnap.forEach(doc => {
            const data = doc.data();
            html += `<span class='calendar-task-link text-orange-900 hover:underline cursor-pointer' data-taskid='${doc.id}'>${data.text}</span><br>`;
        });
        html += '</div>';
    }
    html += '<div class="mb-4"><h4 class="font-bold">Tarefas criadas neste dia</h4>';
    if(tasksSnap.empty) html += '<p class="text-sm">Nenhuma tarefa.</p>';
    else tasksSnap.forEach(doc => html += `<p class="text-sm bg-gray-100 p-1 rounded mt-1">${doc.data().text}</p>`);
    html += '</div><div><h4 class="font-bold">Anotações</h4>';
    if(notesSnap.empty) html += '<p class="text-sm">Nenhuma anotação.</p>';
    else notesSnap.forEach(doc => html += `<p class="text-sm bg-yellow-100 p-1 rounded mt-1">${doc.data().text}</p>`);
    html += '</div>';
    dom.detailsContent.innerHTML = html;
    dom.detailsContent.querySelectorAll('.calendar-task-link').forEach(el => {
        el.addEventListener('click', function(this: HTMLElement) {
            const tid = this.getAttribute('data-taskid');
            const t = dueSnap.docs.find(d => d.id === tid);
            if (tid && t) openTaskDetailModal(tid, t.data().text);
        });
    });
}

// --- Canvas View Functions ---

function toggleView() {
    currentView = currentView === 'list' ? 'canvas' : 'list';
    const isListView = currentView === 'list';

    dom.mainContentApp.classList.toggle('hidden', !isListView);
    dom.canvasView.classList.toggle('hidden', isListView);
    dom.viewToggleIcon.className = isListView ? 'fas fa-project-diagram fa-lg' : 'fas fa-list-ul fa-lg';
    dom.viewToggleBtn.title = isListView ? 'Visualização em Canvas' : 'Visualização em Lista';

    // Mostrar/ocultar botão de free card baseado na visualização
    const addFreeCardBtn = document.getElementById('add-free-card-btn');
    if (addFreeCardBtn) {
        addFreeCardBtn.classList.toggle('hidden', isListView);
        console.log('[Free Card] Toggle view - Botão:', isListView ? 'oculto' : 'visível');
    } else {
        console.warn('[Free Card] Toggle view - Botão não encontrado');
    }

    if (isListView) {
        unsubscribe('canvas_tasks');
        loadTasks();
    } else {
        unsubscribe('tasks');
        requestAnimationFrame(() => {
            loadCanvasTasks();
        });
    }
}

async function loadCanvasTasks() {
    if (!tasksCollectionRef || !freeCardsCollectionRef) return;

    // --- 1. Cleanup & Setup ---
    unsubscribe('canvas_tasks');
    unsubscribe('canvas_free_cards');
    dom.taskCanvas.innerHTML = '';
    dom.canvasLinesSvg.innerHTML = '';
    nodesCache = {}; // Reset caches
    freeCardNodesCache = {};
    tasksCache = [];
    freeCardsCache = [];
    syncCanvasTransforms(); // Maintain pan/zoom

    // --- 2. Attach listeners for tasks and free cards ---
    unsubs.canvas_tasks = onSnapshot(query(tasksCollectionRef), (snapshot) => {
        console.log("[Canvas Sync] Tasks onSnapshot triggered.");

        const latestTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
        tasksCache = latestTasks;
        
        const existingNodeIds = new Set(Object.keys(nodesCache));
        const latestTaskIds = new Set(latestTasks.map(t => t.id));

        const batch = writeBatch(db);
        let hasPositionUpdates = false;

        // --- 3. Reconcile Task Nodes ---
        latestTasks.forEach((task, index) => {
            let node = nodesCache[task.id];
            
            // Assign an initial position on the canvas if it doesn't have one
            if (task.x === undefined || task.y === undefined) {
                const containerWidth = dom.taskCanvasContainer.offsetWidth || 1000;
                const columns = Math.max(1, Math.floor(containerWidth / 250));
                task.x = (index % columns) * 250 + 50;
                task.y = Math.floor(index / columns) * 120 + 50;
                
                batch.update(doc(tasksCollectionRef, task.id), { x: task.x, y: task.y });
                hasPositionUpdates = true;
            }

            if (node) {
                if (canvasState.draggedNode?.dataset.id !== task.id) {
                    node.style.left = `${task.x}px`;
                    node.style.top = `${task.y}px`;
                }
                const textEl = node.querySelector('.canvas-task-node-text') as HTMLParagraphElement;
                if (textEl && textEl.textContent !== task.text) {
                    textEl.textContent = task.text;
                }
                task.completed ? node.classList.add('completed-node') : node.classList.remove('completed-node');
            } else {
                renderCanvasNode(task); 
            }
        });
        
        if (hasPositionUpdates) {
             batch.commit().catch(e => console.warn("Falha ao salvar posições iniciais durante a sincronização.", e));
        }

        // Remove old task nodes
        existingNodeIds.forEach(nodeId => {
            if (!latestTaskIds.has(nodeId)) {
                const nodeToRemove = nodesCache[nodeId];
                if (nodeToRemove) {
                    nodeToRemove.remove();
                    delete nodesCache[nodeId];
                }
            }
        });

        drawAllLines();
    }, (error) => {
        console.error("Erro de sincronização com o canvas (tasks):", error);
        showToast("Erro de sincronização com o canvas.");
    });

    // Load free cards
    unsubs.canvas_free_cards = onSnapshot(query(freeCardsCollectionRef), (snapshot) => {
        console.log("[Canvas Sync] Free cards onSnapshot triggered.");

        const latestFreeCards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FreeCard));
        freeCardsCache = latestFreeCards;
        
        const existingFreeCardNodeIds = new Set(Object.keys(freeCardNodesCache));
        const latestFreeCardIds = new Set(latestFreeCards.map(fc => fc.id));

        const batch = writeBatch(db);
        let hasPositionUpdates = false;

        // Reconcile Free Card Nodes
        latestFreeCards.forEach((freeCard, index) => {
            let node = freeCardNodesCache[freeCard.id];
            
            // Assign an initial position on the canvas if it doesn't have one
            if (freeCard.x === undefined || freeCard.y === undefined) {
                const containerWidth = dom.taskCanvasContainer.offsetWidth || 1000;
                const columns = Math.max(1, Math.floor(containerWidth / 250));
                freeCard.x = (index % columns) * 250 + 50;
                freeCard.y = Math.floor(index / columns) * 120 + 200; // Offset below tasks
                
                batch.update(doc(freeCardsCollectionRef, freeCard.id), { x: freeCard.x, y: freeCard.y });
                hasPositionUpdates = true;
            }

            if (node) {
                if (canvasState.draggedNode?.dataset.id !== freeCard.id) {
                    node.style.left = `${freeCard.x}px`;
                    node.style.top = `${freeCard.y}px`;
                }
                const textEl = node.querySelector('.canvas-free-card-node-text') as HTMLParagraphElement;
                if (textEl && textEl.textContent !== freeCard.text) {
                    textEl.textContent = freeCard.text;
                }
            } else {
                renderCanvasFreeCardNode(freeCard); 
            }
        });
        
        if (hasPositionUpdates) {
             batch.commit().catch(e => console.warn("Falha ao salvar posições iniciais dos free cards durante a sincronização.", e));
        }

        // Remove old free card nodes
        existingFreeCardNodeIds.forEach(nodeId => {
            if (!latestFreeCardIds.has(nodeId)) {
                const nodeToRemove = freeCardNodesCache[nodeId];
                if (nodeToRemove) {
                    nodeToRemove.remove();
                    delete freeCardNodesCache[nodeId];
                }
            }
        });

        drawAllLines();
    }, (error) => {
        console.error("Erro de sincronização com o canvas (free cards):", error);
        showToast("Erro de sincronização com o canvas.");
    });
}


function renderCanvasNode(task: Task) {
    const node = document.createElement('div');
    node.className = 'canvas-task-node';
    node.dataset.id = task.id;
    node.style.left = `${task.x || 0}px`;
    node.style.top = `${task.y || 0}px`;
    if (task.completed) node.classList.add('completed-node');

    node.innerHTML = `
        <p class="canvas-task-node-text">${task.text}</p>
        <div class="canvas-task-node-link-handle"></div>
    `;

    nodesCache[task.id] = node;
    dom.taskCanvas.appendChild(node);
}

function renderCanvasFreeCardNode(freeCard: FreeCard) {
    const node = document.createElement('div');
    node.className = 'canvas-free-card-node';
    node.dataset.id = freeCard.id;
    node.dataset.type = 'free-card';
    node.style.left = `${freeCard.x || 0}px`;
    node.style.top = `${freeCard.y || 0}px`;

    node.innerHTML = `
        <p class="canvas-free-card-node-text">${freeCard.text}</p>
        <div class="canvas-free-card-node-link-handle"></div>
    `;

    freeCardNodesCache[freeCard.id] = node;
    dom.taskCanvas.appendChild(node);
}

// Comentários das conexões (em memória)
const connectionComments: { [key: string]: string } = {};

function drawAllLines() {
    if (!dom.canvasLinesSvg) return;
    // console.log("[Canvas Draw] drawAllLines called.");
    const linkingLine = dom.canvasLinesSvg.querySelector('.linking-line');
    dom.canvasLinesSvg.innerHTML = '';
    if (linkingLine) dom.canvasLinesSvg.appendChild(linkingLine);

    // Draw connections for tasks
    tasksCache.forEach(task => {
        if (task.connections?.length) {
            task.connections.forEach(conn => {
                let targetId: string;
                let commentText: string | undefined;
                if (typeof conn === 'string') {
                    targetId = conn;
                    commentText = undefined;
                } else {
                    targetId = conn.targetId;
                    commentText = conn.comment;
                }
                const sourceNode = nodesCache[task.id];
                const targetNode = nodesCache[targetId] || freeCardNodesCache[targetId];
                if (sourceNode && targetNode) {
                    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    const line = createSvgLine(sourceNode, targetNode);
                    group.appendChild(line);
                    // Comentário da conexão
                    if (commentText) {
                        const sourceX = sourceNode.offsetLeft + sourceNode.offsetWidth;
                        const sourceY = sourceNode.offsetTop + sourceNode.offsetHeight / 2;
                        const targetX = targetNode.offsetLeft;
                        const targetY = targetNode.offsetTop + targetNode.offsetHeight / 2;
                        const midX = (sourceX + targetX) / 2;
                        const midY = (sourceY + targetY) / 2;
                        const textElem = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        textElem.setAttribute('x', String(midX));
                        textElem.setAttribute('y', String(midY - 10));
                        textElem.setAttribute('text-anchor', 'middle');
                        textElem.setAttribute('fill', '#6366f1');
                        textElem.setAttribute('font-size', '13');
                        textElem.setAttribute('opacity', '0.7');
                        textElem.setAttribute('pointer-events', 'none');
                        textElem.textContent = commentText;
                        group.appendChild(textElem);
                    }
                    // Duplo clique para adicionar/editar comentário
                    line.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        const midX = (sourceNode.offsetLeft + sourceNode.offsetWidth + targetNode.offsetLeft) / 2;
                        const midY = (sourceNode.offsetTop + sourceNode.offsetHeight / 2 + targetNode.offsetTop + targetNode.offsetHeight / 2) / 2;
                        showConnectionCommentInput(task.id, targetId, midX, midY, commentText || '');
                    });
                    
                    // Cria o ícone de lixeira (SVG FontAwesome trash)
                    const trashIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    trashIcon.setAttribute('width', '20');
                    trashIcon.setAttribute('height', '20');
                    trashIcon.setAttribute('viewBox', '0 0 448 512');
                    trashIcon.setAttribute('class', 'canvas-trash-icon');
                    trashIcon.style.display = 'none';
                    trashIcon.style.position = 'absolute';
                    trashIcon.style.cursor = 'pointer';
                    trashIcon.innerHTML = `<path fill="#ef4444" d="M135.2 17.7C140.2 7.4 150.5 0 162.3 0h123.4c11.8 0 22.1 7.4 27.1 17.7l19.8 38.3H432c8.8 0 16 7.2 16 16s-7.2 16-16 16h-16l-21.2 339.4c-2.6 41.2-36.7 72.3-77.9 72.3H131.1c-41.2 0-75.3-31.1-77.9-72.3L32 88H16C7.2 88 0 80.8 0 72s7.2-16 16-16h74.4l19.8-38.3zM131.1 464h185.8c23.2 0 42.2-17.5 43.5-40.7L381.2 88H66.8l21.2 335.3c1.3 23.2 20.3 40.7 43.5 40.7zM176 224c8.8 0 16 7.2 16 16v128c0 8.8-7.2 16-16 16s-16-7.2-16-16V240c0-8.8 7.2-16 16-16s16 7.2 16 16z"/>`;

                    // Calcula a posição do ícone (meio da curva)
                    const sourceX = sourceNode.offsetLeft + sourceNode.offsetWidth;
                    const sourceY = sourceNode.offsetTop + sourceNode.offsetHeight / 2;
                    const targetX = targetNode.offsetLeft;
                    const targetY = targetNode.offsetTop + targetNode.offsetHeight / 2;
                    const midX = (sourceX + targetX) / 2;
                    const midY = (sourceY + targetY) / 2;
                    trashIcon.setAttribute('x', String(midX - 10));
                    trashIcon.setAttribute('y', String(midY - 10));
                    trashIcon.style.pointerEvents = 'auto';

                    // Eventos de hover com delay para sumir
                    let trashHideTimeout: any = null;
                    group.addEventListener('mouseenter', () => {
                        if (trashHideTimeout) clearTimeout(trashHideTimeout);
                        trashIcon.style.display = 'block';
                    });
                    group.addEventListener('mouseleave', () => {
                        trashHideTimeout = setTimeout(() => {
                            trashIcon.style.display = 'none';
                        }, 350); // delay para facilitar o clique
                    });
                    trashIcon.addEventListener('mouseenter', () => {
                        if (trashHideTimeout) clearTimeout(trashHideTimeout);
                        trashIcon.style.display = 'block';
                    });
                    trashIcon.addEventListener('mouseleave', () => {
                        trashHideTimeout = setTimeout(() => {
                            trashIcon.style.display = 'none';
                        }, 350);
                    });
                    // Evento de clique para remover a conexão
                    trashIcon.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (tasksCollectionRef) {
                            // Remove a conexão do array
                            const taskDocRef = doc(tasksCollectionRef, task.id);
                            const updatedConnections = (task.connections || []).filter((c: any) => {
                                if (typeof c === 'string') return c !== targetId;
                                return c.targetId !== targetId;
                            });
                            await updateDoc(taskDocRef, { connections: updatedConnections });
                            showToast('Conexão removida!');
                        }
                    });

                    group.appendChild(trashIcon);
                    dom.canvasLinesSvg.appendChild(group);
                } else {
                    console.warn(`[Canvas Draw] FAILED to draw line: Could not find nodes in cache. Source (${task.id}): ${!!sourceNode}, Target (${targetId}): ${!!targetNode}`);
                }
            });
        }
    });

    // Draw connections for free cards
    freeCardsCache.forEach(freeCard => {
        if (freeCard.connections?.length) {
            freeCard.connections.forEach(conn => {
                let targetId: string;
                let commentText: string | undefined;
                if (typeof conn === 'string') {
                    targetId = conn;
                    commentText = undefined;
                } else {
                    targetId = conn.targetId;
                    commentText = conn.comment;
                }
                const sourceNode = freeCardNodesCache[freeCard.id];
                const targetNode = nodesCache[targetId] || freeCardNodesCache[targetId];
                if (sourceNode && targetNode) {
                    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    const line = createSvgLine(sourceNode, targetNode, false, undefined, true);
                    group.appendChild(line);
                    
                    // Comentário da conexão
                    if (commentText) {
                        const sourceX = sourceNode.offsetLeft + sourceNode.offsetWidth;
                        const sourceY = sourceNode.offsetTop + sourceNode.offsetHeight / 2;
                        const targetX = targetNode.offsetLeft;
                        const targetY = targetNode.offsetTop + targetNode.offsetHeight / 2;
                        const midX = (sourceX + targetX) / 2;
                        const midY = (sourceY + targetY) / 2;
                        const textElem = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        textElem.setAttribute('x', String(midX));
                        textElem.setAttribute('y', String(midY - 10));
                        textElem.setAttribute('text-anchor', 'middle');
                        textElem.setAttribute('fill', '#3b82f6');
                        textElem.setAttribute('font-size', '13');
                        textElem.setAttribute('opacity', '0.7');
                        textElem.setAttribute('pointer-events', 'none');
                        textElem.textContent = commentText;
                        group.appendChild(textElem);
                    }
                    
                    // Duplo clique para adicionar/editar comentário
                    line.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        const midX = (sourceNode.offsetLeft + sourceNode.offsetWidth + targetNode.offsetLeft) / 2;
                        const midY = (sourceNode.offsetTop + sourceNode.offsetHeight / 2 + targetNode.offsetTop + targetNode.offsetHeight / 2) / 2;
                        showConnectionCommentInput(freeCard.id, targetId, midX, midY, commentText || '', true);
                    });
                    
                    // Cria o ícone de lixeira
                    const trashIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    trashIcon.setAttribute('width', '20');
                    trashIcon.setAttribute('height', '20');
                    trashIcon.setAttribute('viewBox', '0 0 448 512');
                    trashIcon.setAttribute('class', 'canvas-trash-icon');
                    trashIcon.style.display = 'none';
                    trashIcon.style.position = 'absolute';
                    trashIcon.style.cursor = 'pointer';
                    trashIcon.innerHTML = `<path fill="#ef4444" d="M135.2 17.7C140.2 7.4 150.5 0 162.3 0h123.4c11.8 0 22.1 7.4 27.1 17.7l19.8 38.3H432c8.8 0 16 7.2 16 16s-7.2 16-16 16h-16l-21.2 339.4c-2.6 41.2-36.7 72.3-77.9 72.3H131.1c-41.2 0-75.3-31.1-77.9-72.3L32 88H16C7.2 88 0 80.8 0 72s7.2-16 16-16h74.4l19.8-38.3zM131.1 464h185.8c23.2 0 42.2-17.5 43.5-40.7L381.2 88H66.8l21.2 335.3c1.3 23.2 20.3 40.7 43.5 40.7zM176 224c8.8 0 16 7.2 16 16v128c0 8.8-7.2 16-16 16s-16-7.2-16-16V240c0-8.8 7.2-16 16-16s16 7.2 16 16z"/>`;

                    const sourceX = sourceNode.offsetLeft + sourceNode.offsetWidth;
                    const sourceY = sourceNode.offsetTop + sourceNode.offsetHeight / 2;
                    const targetX = targetNode.offsetLeft;
                    const targetY = targetNode.offsetTop + targetNode.offsetHeight / 2;
                    const midX = (sourceX + targetX) / 2;
                    const midY = (sourceY + targetY) / 2;
                    trashIcon.setAttribute('x', String(midX - 10));
                    trashIcon.setAttribute('y', String(midY - 10));
                    trashIcon.style.pointerEvents = 'auto';

                    let trashHideTimeout: any = null;
                    group.addEventListener('mouseenter', () => {
                        if (trashHideTimeout) clearTimeout(trashHideTimeout);
                        trashIcon.style.display = 'block';
                    });
                    group.addEventListener('mouseleave', () => {
                        trashHideTimeout = setTimeout(() => {
                            trashIcon.style.display = 'none';
                        }, 350);
                    });
                    trashIcon.addEventListener('mouseenter', () => {
                        if (trashHideTimeout) clearTimeout(trashHideTimeout);
                        trashIcon.style.display = 'block';
                    });
                    trashIcon.addEventListener('mouseleave', () => {
                        trashHideTimeout = setTimeout(() => {
                            trashIcon.style.display = 'none';
                        }, 350);
                    });
                    
                    // Evento de clique para remover a conexão
                    trashIcon.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (freeCardsCollectionRef) {
                            const freeCardDocRef = doc(freeCardsCollectionRef, freeCard.id);
                            const updatedConnections = (freeCard.connections || []).filter((c: any) => {
                                if (typeof c === 'string') return c !== targetId;
                                return c.targetId !== targetId;
                            });
                            await updateDoc(freeCardDocRef, { connections: updatedConnections });
                            showToast('Conexão removida!');
                        }
                    });

                    group.appendChild(trashIcon);
                    dom.canvasLinesSvg.appendChild(group);
                }
            });
        }
    });
}

function createSvgLine(sourceNode: HTMLElement, targetNode: HTMLElement, isLinkingLine = false, customTargetPoint?: {x: number, y: number}, isFreeCard = false) {
    // Adiciona marker de seta ao SVG se ainda não existir
    if (dom.canvasLinesSvg && !dom.canvasLinesSvg.querySelector('marker#arrowhead')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#6366f1"/>
            </marker>
        `;
        dom.canvasLinesSvg.prepend(defs);
    }
    
    // Adiciona marker de seta azul para free cards se ainda não existir
    if (dom.canvasLinesSvg && !dom.canvasLinesSvg.querySelector('marker#arrowhead-blue')) {
        const defs = dom.canvasLinesSvg.querySelector('defs');
        if (defs) {
            const blueArrow = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            blueArrow.setAttribute('id', 'arrowhead-blue');
            blueArrow.setAttribute('markerWidth', '6');
            blueArrow.setAttribute('markerHeight', '4');
            blueArrow.setAttribute('refX', '6');
            blueArrow.setAttribute('refY', '2');
            blueArrow.setAttribute('orient', 'auto');
            blueArrow.innerHTML = '<polygon points="0 0, 6 2, 0 4" fill="#3b82f6"/>';
            defs.appendChild(blueArrow);
        }
    }
    
    const sourceX = sourceNode.offsetLeft + sourceNode.offsetWidth;
    const sourceY = sourceNode.offsetTop + sourceNode.offsetHeight / 2;
    let targetX, targetY;
    if (customTargetPoint) {
        targetX = customTargetPoint.x;
        targetY = customTargetPoint.y;
    } else {
        targetX = targetNode.offsetLeft;
        targetY = targetNode.offsetTop + targetNode.offsetHeight / 2;
    }
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const controlPointOffset = Math.max(50, Math.abs(targetX - sourceX) * 0.3);
    line.setAttribute('d', `M ${sourceX} ${sourceY} C ${sourceX + controlPointOffset} ${sourceY}, ${targetX - controlPointOffset} ${targetY}, ${targetX} ${targetY}`);
    
    if (isFreeCard) {
        line.setAttribute('class', isLinkingLine ? 'linking-line' : 'canvas-free-card-line');
        line.setAttribute('stroke', '#3b82f6');
        line.setAttribute('marker-end', 'url(#arrowhead-blue)');
    } else {
        line.setAttribute('class', isLinkingLine ? 'linking-line' : 'canvas-line');
        line.setAttribute('stroke', '#6366f1');
        line.setAttribute('marker-end', 'url(#arrowhead)');
    }
    
    line.setAttribute('stroke-width', isLinkingLine ? '2' : '2');
    line.setAttribute('fill', 'none');
    line.setAttribute('opacity', isLinkingLine ? '0.7' : '1');
    return line;
}

function syncCanvasTransforms() {
    const transform = `translate(${canvasState.panOffsetX}px, ${canvasState.panOffsetY}px) scale(${canvasState.zoom})`;
    dom.taskCanvas.style.transform = transform;
    dom.canvasLinesSvg.style.transform = transform;
}


async function openCanvasPopup(taskId: string, nodeElement: HTMLElement) {
    const task = tasksCache.find(t => t.id === taskId);
    if (!task || !userId) return;

    dom.canvasPopupTitle.textContent = task.text;
    dom.canvasPopupSubtasks.innerHTML = '<p>Carregando...</p>';
    dom.canvasPopupNotes.innerHTML = '<p>Carregando...</p>';

    const containerRect = dom.taskCanvasContainer.getBoundingClientRect();
    const nodeRect = nodeElement.getBoundingClientRect();
    dom.canvasTaskPopup.style.left = `${nodeRect.right - containerRect.left + 5}px`;
    dom.canvasTaskPopup.style.top = `${nodeRect.top - containerRect.top}px`;
    dom.canvasTaskPopup.classList.remove('hidden');

    const basePath = `artifacts/${appId}/users/${userId}/tasks/${taskId}`;
    const [subtasksSnap, taskNotesSnap] = await Promise.all([
        getDocs(query(collection(db, `${basePath}/subtasks`))),
        getDocs(query(collection(db, `${basePath}/taskNotes`)))
    ]);
    
    dom.canvasPopupSubtasks.innerHTML = subtasksSnap.empty ? '<p class="text-gray-400">Nenhuma sub-tarefa.</p>' : subtasksSnap.docs.map(doc => {
        const subtask = doc.data() as Subtask;
        return `<p class="${subtask.completed ? 'completed' : ''}">${subtask.text}</p>`;
    }).join('');

    dom.canvasPopupNotes.innerHTML = taskNotesSnap.empty ? '<p class="text-gray-400">Nenhuma anotação.</p>' : taskNotesSnap.docs.map(doc => `<p>${doc.data().text}</p>`).join('');
}

function closeCanvasPopup() {
    dom.canvasTaskPopup.classList.add('hidden');
}

// --- Auth & Init ---
const setupAppEventListeners = () => {
    eventManager.add(dom.addTaskBtn, 'click', handleAddTask);
    eventManager.add(dom.saveNoteBtn, 'click', handleSaveNote);
    eventManager.add(dom.toggleCompletedBtn, 'click', () => { 
        showCompleted = !showCompleted; 
        updateToggleCompletedButton(); 
        loadTasks(); 
    });
    eventManager.add(dom.closeDetailModalBtn, 'click', closeTaskDetailModal);
    eventManager.add(dom.addSubtaskBtn, 'click', handleAddSubtask);
    eventManager.add(dom.addTaskNoteBtn, 'click', handleAddTaskNote);
    eventManager.add(dom.calendarBtn, 'click', openCalendar);
    eventManager.add(dom.closeCalendarBtn, 'click', closeCalendar);
    eventManager.add(dom.prevMonthBtn, 'click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
    eventManager.add(dom.nextMonthBtn, 'click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
    const editBtn = dom.detailTitleContainer.querySelector('.edit-main-task-btn');
    if (editBtn) eventManager.add(editBtn, 'click', toggleMainTaskEdit);
    eventManager.add(dom.addCategoryBtn, 'click', (e: Event) => { e.preventDefault(); showCategoryPopup(); });
    eventManager.add(dom.themeToggleBtn, 'click', toggleTheme);
    eventManager.add(document, 'click', (e: MouseEvent) => {
        const target = e.target as Node;
        if (!dom.userMenuContainer.contains(target)) dom.userMenuDropdown.classList.add('hidden');
        if (!dom.canvasTaskPopup.classList.contains('hidden') && !dom.canvasTaskPopup.contains(target) && !(e.target as HTMLElement).closest('.canvas-task-node')) {
            closeCanvasPopup();
        }
        
        // Fechar popup de free cards se clicar fora
        const freeCardPopup = document.getElementById('free-card-popup');
        if (freeCardPopup && !freeCardPopup.classList.contains('hidden') && !freeCardPopup.contains(target)) {
            hideFreeCardPopup();
        }
    });
    eventManager.add(dom.logoutBtn, 'click', async () => { await signOut(auth); dom.userMenuDropdown.classList.add('hidden'); });
    eventManager.add(window, 'online', updateConnectionStatus);
    eventManager.add(window, 'offline', updateConnectionStatus);
    eventManager.add(dom.viewToggleBtn, 'click', toggleView);
    setupCanvasEventListeners();
    eventManager.add(dom.canvasPopupCloseBtn, 'click', closeCanvasPopup);
    
    // Event listeners para free cards
    const addFreeCardBtn = document.getElementById('add-free-card-btn');
    console.log('[Free Card] Botão principal encontrado:', !!addFreeCardBtn);
    if (addFreeCardBtn) {
        eventManager.add(addFreeCardBtn, 'click', showFreeCardPopup);
        console.log('[Free Card] Event listener adicionado ao botão principal');
    }
    
    const addFreeCardBtnModal = document.getElementById('add-free-card-btn-modal');
    console.log('[Free Card] Botão do modal encontrado:', !!addFreeCardBtnModal);
    if (addFreeCardBtnModal) {
        eventManager.add(addFreeCardBtnModal, 'click', handleAddFreeCard);
        console.log('[Free Card] Event listener adicionado ao botão do modal');
    }
    
    const closeFreeCardPopupBtn = document.getElementById('close-free-card-popup-btn');
    console.log('[Free Card] Botão de fechar encontrado:', !!closeFreeCardPopupBtn);
    if (closeFreeCardPopupBtn) {
        eventManager.add(closeFreeCardPopupBtn, 'click', hideFreeCardPopup);
        console.log('[Free Card] Event listener adicionado ao botão de fechar');
    }
    
    // Adiciona evento para abrir/fechar o dropdown do menu do usuário
    if (dom.userMenuTrigger) {
        eventManager.add(dom.userMenuTrigger, 'click', (e: MouseEvent) => {
            e.stopPropagation();
            dom.userMenuDropdown.classList.toggle('hidden');
        });
    }
    // Evento para abrir/fechar o popup de nova tarefa
    const openTaskPopupBtn = document.getElementById('open-task-popup-btn');
    const taskPopup = document.getElementById('task-popup');
    const closeTaskPopupBtn = document.getElementById('close-task-popup-btn');
    if (openTaskPopupBtn && taskPopup) {
        openTaskPopupBtn.addEventListener('click', () => {
            taskPopup.classList.remove('hidden');
            setTimeout(() => {
                const input = document.getElementById('task-input') as HTMLInputElement;
                if (input) input.focus();
            }, 50);
        });
    }
    if (closeTaskPopupBtn && taskPopup) {
        closeTaskPopupBtn.addEventListener('click', () => {
            taskPopup.classList.add('hidden');
        });
    }
};

function setupCanvasEventListeners() {
    const container = dom.taskCanvasContainer;

    const onMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const taskNode = target.closest('.canvas-task-node') as HTMLElement;
        const freeCardNode = target.closest('.canvas-free-card-node') as HTMLElement;
        const node = taskNode || freeCardNode;
        
        if (target.classList.contains('canvas-task-node-link-handle') && taskNode) {
            e.stopPropagation();
            canvasState.isLinking = true;
            canvasState.linkStartNodeId = taskNode.dataset.id || null;
            container.classList.add('linking-mode');
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            line.setAttribute('class', 'linking-line');
            dom.canvasLinesSvg.appendChild(line);
        } else if (target.classList.contains('canvas-free-card-node-link-handle') && freeCardNode) {
            e.stopPropagation();
            canvasState.isLinking = true;
            canvasState.linkStartNodeId = freeCardNode.dataset.id || null;
            container.classList.add('linking-mode');
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            line.setAttribute('class', 'linking-line');
            dom.canvasLinesSvg.appendChild(line);
        } else if (node) {
            e.stopPropagation();
            canvasState.isDragging = true;
            canvasState.draggedNode = node;
            canvasState.startX = e.clientX;
            canvasState.startY = e.clientY;
            canvasState.nodeInitialX = node.offsetLeft;
            canvasState.nodeInitialY = node.offsetTop;
            node.style.zIndex = '20';
        } else {
            canvasState.isPanning = true;
            container.classList.add('grabbing');
            canvasState.startX = e.clientX - canvasState.panOffsetX;
            canvasState.startY = e.clientY - canvasState.panOffsetY;
        }
    };

    const onMouseMove = (e: MouseEvent) => {
        if (canvasState.isLinking && canvasState.linkStartNodeId) {
            const startNode = nodesCache[canvasState.linkStartNodeId];
            if(!startNode) return;

            const x1 = startNode.offsetLeft + startNode.offsetWidth;
            const y1 = startNode.offsetTop + startNode.offsetHeight / 2;

            const containerRect = container.getBoundingClientRect();
            const mouseScreenX = e.clientX - containerRect.left;
            const mouseScreenY = e.clientY - containerRect.top;
            const x2 = (mouseScreenX - canvasState.panOffsetX) / canvasState.zoom;
            const y2 = (mouseScreenY - canvasState.panOffsetY) / canvasState.zoom;

            const linkingLine = dom.canvasLinesSvg.querySelector('.linking-line') as SVGPathElement;
            if (linkingLine) {
                 const controlPointOffset = Math.max(50, Math.abs(x2 - x1) * 0.3);
                 linkingLine.setAttribute('d', `M ${x1} ${y1} C ${x1 + controlPointOffset} ${y1}, ${x2 - controlPointOffset} ${y2}, ${x2} ${y2}`);
            }
        } else if (canvasState.isDragging && canvasState.draggedNode) {
            closeCanvasPopup();
            const dx = (e.clientX - canvasState.startX) / canvasState.zoom;
            const dy = (e.clientY - canvasState.startY) / canvasState.zoom;
            canvasState.draggedNode.style.left = `${canvasState.nodeInitialX + dx}px`;
            canvasState.draggedNode.style.top = `${canvasState.nodeInitialY + dy}px`;
            drawAllLines();
        } else if (canvasState.isPanning) {
            closeCanvasPopup();
            canvasState.panOffsetX = e.clientX - canvasState.startX;
            canvasState.panOffsetY = e.clientY - canvasState.startY;
            syncCanvasTransforms();
        }
    };

    const onMouseUp = async (e: MouseEvent) => {
        try {
            const target = e.target as HTMLElement;
            const targetTaskNode = target.closest('.canvas-task-node') as HTMLElement;
            const targetFreeCardNode = target.closest('.canvas-free-card-node') as HTMLElement;
            const targetNodeEl = targetTaskNode || targetFreeCardNode;

            if (canvasState.isLinking && canvasState.linkStartNodeId) {
                console.log(`[Canvas] Linking ended. Start node: ${canvasState.linkStartNodeId}`);
                const linkingLine = dom.canvasLinesSvg.querySelector('.linking-line');
                if (linkingLine) linkingLine.remove();

                if (targetNodeEl && targetNodeEl.dataset.id !== canvasState.linkStartNodeId) {
                    const targetId = targetNodeEl.dataset.id;
                    const isStartNodeFreeCard = canvasState.linkStartNodeId && freeCardNodesCache[canvasState.linkStartNodeId];
                    
                    if (targetId) {
                        if (isStartNodeFreeCard && freeCardsCollectionRef) {
                            await updateDoc(doc(freeCardsCollectionRef, canvasState.linkStartNodeId), {
                                connections: arrayUnion(targetId)
                            });
                        } else if (tasksCollectionRef) {
                            await updateDoc(doc(tasksCollectionRef, canvasState.linkStartNodeId), {
                                connections: arrayUnion(targetId)
                            });
                        }
                        console.log(`[Canvas] Firestore update successful.`);
                    }
                } else {
                    console.log(`[Canvas] No valid target node found.`);
                }
            } else if (canvasState.isDragging && canvasState.draggedNode) {
                const nodeId = canvasState.draggedNode.dataset.id;
                const isFreeCard = canvasState.draggedNode.dataset.type === 'free-card';
                const dx = e.clientX - canvasState.startX;
                const dy = e.clientY - canvasState.startY;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) { // It's a drag
                    if (nodeId) {
                        const finalX = canvasState.draggedNode.offsetLeft;
                        const finalY = canvasState.draggedNode.offsetTop;
                        
                        if (isFreeCard && freeCardsCollectionRef) {
                            await updateDoc(doc(freeCardsCollectionRef, nodeId), { x: finalX, y: finalY });
                        } else if (tasksCollectionRef) {
                            await updateDoc(doc(tasksCollectionRef, nodeId), { x: finalX, y: finalY });
                        }
                    }
                } else { // It's a click
                    if (nodeId && !isFreeCard) {
                        openCanvasPopup(nodeId, canvasState.draggedNode);
                    }
                }
            }
        } catch (error) {
            console.error("Error during canvas mouseup operation:", error);
            showToast("Falha ao criar conexão. Verifique o console para detalhes.");
        } finally {
            // This block ALWAYS runs, ensuring the UI state is never stuck.
            if (canvasState.isDragging && canvasState.draggedNode) {
                canvasState.draggedNode.style.zIndex = '10';
            }
            if (canvasState.isPanning) {
                container.classList.remove('grabbing');
            }
            if(canvasState.isLinking) {
                const linkingLine = dom.canvasLinesSvg.querySelector('.linking-line');
                if (linkingLine) linkingLine.remove();
                container.classList.remove('linking-mode');
            }
            
            canvasState.isLinking = false;
            canvasState.isDragging = false;
            canvasState.isPanning = false;
            canvasState.draggedNode = null;
            canvasState.linkStartNodeId = null;
        }
    };
    
    const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        closeCanvasPopup();
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const oldZoom = canvasState.zoom;
        const zoomFactor = 1.1;
        let newZoom = e.deltaY < 0 ? oldZoom * zoomFactor : oldZoom / zoomFactor;
        newZoom = Math.max(0.2, Math.min(newZoom, 3));
        const pointX = (mouseX - canvasState.panOffsetX) / oldZoom;
        const pointY = (mouseY - canvasState.panOffsetY) / oldZoom;
        canvasState.panOffsetX = mouseX - pointX * newZoom;
        canvasState.panOffsetY = mouseY - pointY * newZoom;
        canvasState.zoom = newZoom;
        syncCanvasTransforms();
    };

    eventManager.add(container, 'mousedown', onMouseDown);
    eventManager.add(window, 'mousemove', onMouseMove);
    eventManager.add(window, 'mouseup', onMouseUp);
    eventManager.add(container, 'wheel', onWheel);
}


const initApp = () => {
    setupFirestoreCollections();
    setupAppEventListeners();
    loadAndRenderAll();
    setButtonsDisabled(false);
};

const cleanupApp = () => {
    eventManager.removeAll();
    unsubscribeAll();
    
    if(dom.notesList) dom.notesList.innerHTML = '';
    if(dom.taskList) dom.taskList.innerHTML = '';
    if(dom.categorySelect) dom.categorySelect.innerHTML = '';
    if(dom.filterContainer) dom.filterContainer.innerHTML = '';
    if (dom.taskCanvas) dom.taskCanvas.innerHTML = '';
    if (dom.canvasLinesSvg) dom.canvasLinesSvg.innerHTML = '';
    
    nodesCache = {};
    freeCardNodesCache = {};
    tasksCache = [];
    freeCardsCache = [];
    currentView = 'list';
    canvasState = {
        isPanning: false,
        isDragging: false,
        isLinking: false,
        draggedNode: null as HTMLElement | null,
        linkStartNodeId: null as string | null,
        startX: 0,
        startY: 0,
        panOffsetX: 0,
        panOffsetY: 0,
        zoom: 1,
        nodeInitialX: 0,
        nodeInitialY: 0,
    };
    setButtonsDisabled(true);
};

const setupFirestoreCollections = () => {
    if (!userId) return;
    const basePath = `artifacts/${appId}/users/${userId}`;
    tasksCollectionRef = collection(db, `${basePath}/tasks`);
    notesCollectionRef = collection(db, `${basePath}/notes`);
    categoriesCollectionRef = collection(db, `${basePath}/categories`);
    freeCardsCollectionRef = collection(db, `${basePath}/freeCards`);
    
    console.log('[Firestore] Collections configuradas:', {
        userId,
        basePath,
        tasksCollectionRef: !!tasksCollectionRef,
        notesCollectionRef: !!notesCollectionRef,
        categoriesCollectionRef: !!categoriesCollectionRef,
        freeCardsCollectionRef: !!freeCardsCollectionRef
    });
};

const loadAndRenderAll = () => {
    updateConnectionStatus();
    displayCurrentDate();
    updateToggleCompletedButton();
    loadCategories();
    
    // Configurar estado inicial do botão de free card (oculto na visualização de lista)
    const addFreeCardBtn = document.getElementById('add-free-card-btn');
    if (addFreeCardBtn) {
        addFreeCardBtn.classList.toggle('hidden', currentView === 'list');
        console.log('[Free Card] Botão encontrado, estado inicial:', currentView === 'list' ? 'oculto' : 'visível');
    } else {
        console.warn('[Free Card] Botão não encontrado no DOM');
    }
    
    if (currentView === 'list') {
        loadTasks();
    } else {
        requestAnimationFrame(() => loadCanvasTasks());
    }
    loadNotes();
};

function showLogin() {
    dom.loginContainer.classList.remove('hidden');
    dom.registerContainer.classList.add('hidden');
    dom.loginError.textContent = '';
}
function showRegister() {
    dom.loginContainer.classList.add('hidden');
    dom.registerContainer.classList.remove('hidden');
    dom.registerError.textContent = '';
}
if (dom.showRegisterBtn) dom.showRegisterBtn.onclick = showRegister;
if (dom.showLoginBtn) dom.showLoginBtn.onclick = showLogin;
if (dom.loginForm) dom.loginForm.onsubmit = async (e) => {
    e.preventDefault();
    dom.loginError.textContent = '';
    const email = (document.getElementById('login-email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('login-password') as HTMLInputElement).value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        dom.loginError.textContent = 'E-mail ou senha inválidos.';
    }
};
if (dom.registerForm) dom.registerForm.onsubmit = async (e) => {
    e.preventDefault();
    dom.registerError.textContent = '';
    const email = (document.getElementById('register-email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('register-password') as HTMLInputElement).value;
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        showLogin();
        dom.loginError.textContent = 'Cadastro realizado! Faça login.';
    } catch (err) {
        dom.registerError.textContent = 'Erro ao cadastrar. Verifique o e-mail e senha.';
    }
};

const start = async () => {
    await initializeOfflinePersistence(showToast);
    setButtonsDisabled(true);
    onAuthStateChanged(auth, (user) => {
        cleanupApp();
        if (user) {
            userId = user.uid;
            initApp();
            dom.appContainer.classList.remove('hidden');
            dom.loginContainer.classList.add('hidden');
            dom.registerContainer.classList.add('hidden');
            if (user.email) {
                dom.userEmail.textContent = user.email;
                dom.userMenuContainer.classList.remove('hidden');
            } else {
                dom.userMenuContainer.classList.add('hidden');
            }
        } else {
            setButtonsDisabled(true);
            userId = null;
            dom.appContainer.classList.add('hidden');
            dom.loginContainer.classList.remove('hidden');
            dom.registerContainer.classList.add('hidden');
            dom.userMenuContainer.classList.add('hidden');
        }
    });
};

function showCategoryPopup() {
    dom.categoryPopup.classList.remove('hidden');
    dom.categoryPopupInput.value = '';
    setTimeout(() => dom.categoryPopupInput.focus(), 50);
}
function hideCategoryPopup() {
    dom.categoryPopup.classList.add('hidden');
}

function showFreeCardPopup() {
    const popup = document.getElementById('free-card-popup');
    if (popup) {
        popup.classList.remove('hidden');
        popup.style.display = 'flex';
        popup.style.zIndex = '99999';
        // Força novamente após 50ms (caso outro código sobrescreva)
        setTimeout(() => {
            popup.classList.remove('hidden');
            popup.style.display = 'flex';
            popup.style.zIndex = '99999';
        }, 50);
        const input = document.getElementById('free-card-input') as HTMLTextAreaElement;
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 100);
        }
    }
}

function hideFreeCardPopup() {
    const popup = document.getElementById('free-card-popup');
    if (popup) {
        popup.classList.add('hidden');
        popup.style.display = '';
        popup.style.zIndex = '';
    }
}
if (dom.categoryPopupCancel) dom.categoryPopupCancel.onclick = hideCategoryPopup;
if (dom.categoryPopupAdd) dom.categoryPopupAdd.onclick = async () => {
    const name = dom.categoryPopupInput.value.trim();
    if (name) {
        await addNewCategory(name);
        hideCategoryPopup();
    } else {
        dom.categoryPopupInput.focus();
    }
};
if (dom.categoryPopupInput) dom.categoryPopupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (dom.categoryPopupAdd as HTMLButtonElement).click();
    if (e.key === 'Escape') hideCategoryPopup();
});

// Event listener para o input do free card
const freeCardInput = document.getElementById('free-card-input') as HTMLTextAreaElement;
if (freeCardInput) {
    freeCardInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAddFreeCard();
        }
        if (e.key === 'Escape') {
            hideFreeCardPopup();
        }
    });
}

// --- Theme ---
function applyTheme(theme: string) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}
function toggleTheme() {
    const current = localStorage.getItem('theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
    updateThemeButton(next);
}
function updateThemeButton(theme: string) {
    if (!dom.themeToggleBtn) return;
    dom.themeToggleBtn.innerHTML = theme === 'dark'
        ? '<i class="fas fa-sun fa-lg"></i>'
        : '<i class="fas fa-moon fa-lg"></i>';
    dom.themeToggleBtn.title = theme === 'dark' ? 'Modo claro' : 'Modo escuro';
}
const savedTheme = localStorage.getItem('theme') || 'dark';
applyTheme(savedTheme);
updateThemeButton(savedTheme);

// --- AI Analysis ---
async function analyzeWithAI() {
    if (!tasksCollectionRef || !notesCollectionRef || !navigator.onLine || !userId) {
        showToast("A análise com IA requer uma conexão com a internet.");
        return;
    };
    dom.aiAnalyzeContent.innerHTML = 'Analisando com Gemini...';
    dom.aiAnalyzeModal.classList.remove('hidden');
    
    try {
        const tasksSnap = await getDocs(query(tasksCollectionRef, where('completed', '==', false)));
        const tasks = tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
        const notesSnap = await getDocs(query(notesCollectionRef));
        const notes = notesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note));

        if (tasks.length === 0 && notes.length === 0) {
            dom.aiAnalyzeContent.innerHTML = 'Parabéns! Não há tarefas ou notas pendentes para analisar.';
            return;
        }

        const summary = await getAiSummary(userId, tasks, notes);
        dom.aiAnalyzeContent.innerHTML = marked.parse(summary);

    } catch (error) {
        console.error("Error during AI Analysis:", error);
        dom.aiAnalyzeContent.innerHTML = "Ocorreu um erro ao gerar a análise. Por favor, tente novamente.";
    }
}

if (dom.aiAnalyzeBtn) dom.aiAnalyzeBtn.onclick = analyzeWithAI;
if (dom.closeAiAnalyzeModal) dom.closeAiAnalyzeModal.onclick = () => dom.aiAnalyzeModal.classList.add('hidden');
if (dom.aiAnalyzeModal) dom.aiAnalyzeModal.addEventListener('click', e => { if (e.target === dom.aiAnalyzeModal) dom.aiAnalyzeModal.classList.add('hidden'); });

// Observer para garantir que o evento do botão de categoria sempre funcione, mesmo se o botão for criado depois
(function ensureAddCategoryBtnEvent() {
    function addCategoryBtnHandler(btn: HTMLElement) {
        if (btn.getAttribute('data-listener-added')) return;
        btn.addEventListener('click', (e) => {
            console.log('[Categoria] Clique no botão + de categoria (observer)');
            e.preventDefault();
            const popup = document.getElementById('category-popup');
            console.log('[Categoria] Popup encontrado (observer):', !!popup);
            if (popup) popup.classList.remove('hidden');
            const input = document.getElementById('category-popup-input') as HTMLInputElement;
            console.log('[Categoria] Input encontrado (observer):', !!input);
            if (input) {
                input.value = '';
                setTimeout(() => {
                    input.focus();
                    console.log('[Categoria] Input focado (observer)');
                }, 50);
            }
        });
        btn.setAttribute('data-listener-added', 'true');
        console.log('[Categoria] Evento de clique adicionado ao botão + de categoria (observer)');
    }
    // Tenta adicionar imediatamente
    const btn = document.getElementById('add-category-btn');
    if (btn) addCategoryBtnHandler(btn);
    // Observa o DOM para o caso do botão ser criado depois
    const observer = new MutationObserver(() => {
        const btn = document.getElementById('add-category-btn');
        if (btn) addCategoryBtnHandler(btn);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();

// Preencher e atualizar categoria no modal de detalhes da tarefa
function fillDetailCategorySelect(currentCategory: string | null) {
    const select = document.getElementById('detail-category-select') as HTMLSelectElement;
    if (!select || !categoriesCollectionRef) return;
    select.innerHTML = '<option value="Nenhuma">Sem Categoria</option>';
    getDocs(categoriesCollectionRef).then(snapshot => {
        snapshot.forEach(doc => {
            const name = doc.data().name;
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        select.value = currentCategory || 'Nenhuma';
    });
    select.onchange = async () => {
        if (!activeTaskId || !tasksCollectionRef) return;
        const newCategory = select.value === 'Nenhuma' ? null : select.value;
        await updateDoc(doc(tasksCollectionRef, activeTaskId), { category: newCategory });
        showToast('Categoria atualizada!');
    };
}

// Atualizar filtro ao mudar o select
const advancedTaskFilterSelect = document.getElementById('advanced-task-filter') as HTMLSelectElement;
if (advancedTaskFilterSelect) {
    advancedTaskFilterSelect.addEventListener('change', () => {
        advancedTaskFilter = advancedTaskFilterSelect.value;
        loadTasks();
    });
}

// Função para mostrar input de comentário sobre a linha
function showConnectionCommentInput(sourceId: string, targetId: string, x: number, y: number, initial: string, isFreeCard = false) {
    // Remove qualquer input anterior
    const old = document.getElementById('canvas-conn-comment-input');
    if (old) old.remove();
    // Cria input HTML absoluto sobre o SVG
    const input = document.createElement('input');
    input.type = 'text';
    input.value = initial;
    input.id = 'canvas-conn-comment-input';
    input.placeholder = 'Comentário...';
    input.style.position = 'absolute';
    input.style.left = `${x - 60}px`;
    input.style.top = `${y - 18}px`;
    input.style.width = '120px';
    input.style.zIndex = '10000';
    input.style.background = '#fff';
    input.style.border = isFreeCard ? '1px solid #3b82f6' : '1px solid #6366f1';
    input.style.borderRadius = '6px';
    input.style.padding = '2px 8px';
    input.style.fontSize = '13px';
    input.style.boxShadow = isFreeCard ? '0 2px 8px rgba(59,130,246,0.08)' : '0 2px 8px rgba(99,102,241,0.08)';
    input.style.opacity = '0.95';
    input.style.outline = 'none';
    input.style.pointerEvents = 'auto';
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            // Persistir comentário no Firestore
            if (isFreeCard && freeCardsCollectionRef) {
                const freeCardDocRef = doc(freeCardsCollectionRef, sourceId);
                const freeCard = freeCardsCache.find(fc => fc.id === sourceId);
                if (freeCard) {
                    let newConnections: any[] = [];
                    if (freeCard.connections) {
                        newConnections = freeCard.connections.map(conn => {
                            if ((typeof conn === 'string' && conn === targetId) || (typeof conn === 'object' && conn.targetId === targetId)) {
                                return { targetId, comment: input.value.trim() };
                            }
                            return conn;
                        });
                    }
                    await updateDoc(freeCardDocRef, { connections: newConnections });
                }
            } else if (tasksCollectionRef) {
                const taskDocRef = doc(tasksCollectionRef, sourceId);
                const task = tasksCache.find(t => t.id === sourceId);
                if (task) {
                    let newConnections: any[] = [];
                    if (task.connections) {
                        newConnections = task.connections.map(conn => {
                            if ((typeof conn === 'string' && conn === targetId) || (typeof conn === 'object' && conn.targetId === targetId)) {
                                return { targetId, comment: input.value.trim() };
                            }
                            return conn;
                        });
                    }
                    await updateDoc(taskDocRef, { connections: newConnections });
                }
            }
            input.remove();
            drawAllLines();
        } else if (e.key === 'Escape') {
            input.remove();
        }
    });
    setTimeout(() => input.focus(), 30);
    dom.taskCanvasContainer.appendChild(input);
}

start();