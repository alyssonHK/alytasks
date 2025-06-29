/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User } from "firebase/auth";
import { doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, getDocs, setDoc, Timestamp, increment, DocumentData, QuerySnapshot, FirestoreDataConverter } from "firebase/firestore";
import { auth, db, appId, initializeOfflinePersistence } from './firebase.js';
import { getAiSummary } from './gemini.js';
import { Task, Note, Subtask } from "./types.js";

// TypeScript declaration for the 'marked' library loaded from CDN
declare var marked: any;

const OFFLINE_SAVE_MESSAGE = "Você está offline. A alteração foi salva e será sincronizada em breve.";

// --- Converters ---
const taskConverter: FirestoreDataConverter<Task> = {
    toFirestore: (task: Task) => {
        return { ...task };
    },
    fromFirestore: (snapshot, options) => {
        const data = snapshot.data(options);
        return { id: snapshot.id, ...data } as Task;
    }
};

const noteConverter: FirestoreDataConverter<Note> = {
    toFirestore: (note: Note) => {
        return { ...note };
    },
    fromFirestore: (snapshot, options) => {
        const data = snapshot.data(options);
        return { id: snapshot.id, ...data } as Note;
    }
};

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
    canvasModal: document.getElementById('canvas-modal') as HTMLElement,
    closeCanvasModalBtn: document.getElementById('close-canvas-modal-btn') as HTMLButtonElement,
    canvasContent: document.getElementById('canvas-content') as HTMLElement,
    canvasLinesSvg: document.getElementById('canvas-lines-svg') as unknown as SVGSVGElement,
    taskCanvasContainer: document.getElementById('task-canvas-container') as HTMLElement,
    canvasTaskPopup: document.getElementById('canvas-task-popup') as HTMLElement,
    canvasPopupTitle: document.getElementById('canvas-popup-title') as HTMLElement,
    canvasPopupSubtasks: document.getElementById('canvas-popup-subtasks') as HTMLElement,
    canvasPopupNotes: document.getElementById('canvas-popup-notes') as HTMLElement,
    canvasPopupCloseBtn: document.getElementById('canvas-popup-close-btn') as HTMLButtonElement,
};

// --- State ---
let userId: string | null = null;
let notesCollectionRef: any, tasksCollectionRef: any, categoriesCollectionRef: any;
let currentFilter = 'Todos';
let showCompleted = false;
let activeTaskId: string | null = null;
let calendarDate = new Date();
let nodesCache: { [taskId: string]: HTMLElement } = {};
let connectionsCache: any[] = [];
let linkingStartNodeId: string | null = null;
let linkingLine: SVGLineElement | null = null;
let isCanvasView = false;

// --- Listener Management ---
let unsubs: { [key: string]: (() => void) | null } = {
    tasks: null,
    notes: null,
    categories: null,
    canvas_tasks: null,
    task_details: null,
    connections: null,
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

// --- Utility Functions ---
function showToast(message: string, duration: number = 4000) {
    if (!dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); }, 10);
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
     if(dom.toggleCompletedBtn) dom.toggleCompletedBtn.innerHTML = showCompleted ? `<i class="fas fa-eye-slash"></i> Ocultar Concluídas` : `<i class="fas fa-eye"></i> Mostrar Concluídas`;
}

function updateConnectionStatus() {
    if (!dom.connectionStatus || !dom.connectionText || !dom.offlineBanner) return;
    const isOnline = navigator.onLine;
    dom.connectionStatus.classList.toggle('online', isOnline);
    dom.connectionStatus.classList.toggle('offline', !isOnline);
    dom.connectionText.textContent = isOnline ? 'Online' : 'Offline';
    dom.connectionStatus.title = isOnline ? 'Conectado ao servidor.' : 'Você está offline.';
    dom.aiAnalyzeBtn.disabled = !isOnline;
    dom.aiAnalyzeBtn.title = isOnline ? 'Análise com IA' : 'Análise com IA (Indisponível offline)';
    dom.offlineBanner.classList.toggle('hidden', isOnline);
}

// --- Core App Logic ---
async function handleAddTask() {
    const taskText = dom.taskInput.value.trim();
    if (!taskText || !tasksCollectionRef) return;
    let category: string | null = dom.categorySelect.value;
    if (category === 'Nenhuma') category = null;
    const dueDateValue = dom.dueDateInput.value;
    const dueDate = dueDateValue ? Timestamp.fromDate(new Date(dueDateValue + 'T00:00:00')) : null;
    await addDoc(tasksCollectionRef, { text: taskText, completed: false, category, createdAt: Timestamp.now(), dueDate, subtaskCount: 0, noteCount: 0, completedSubtaskCount: 0 });
    if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    dom.taskInput.value = '';
    dom.dueDateInput.value = '';
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
        let tasks = snapshot.docs.map(doc => doc.data() as Task);
        if (!showCompleted) tasks = tasks.filter((task: Task) => !task.completed);
        dom.taskList.innerHTML = '';
        tasks.sort((a: Task, b: Task) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0))
             .forEach((task: Task) => renderTask(task.id, task));
    }, console.error);
}

function renderTask(id: string, data: Task) {
    const el = document.createElement('div');
    el.className = `task-item group p-3 rounded-lg border-b ${data.completed ? 'bg-green-50 text-gray-500' : 'bg-white'}`;
    let subtaskIconColor = 'text-gray-400';
    if (data.subtaskCount > 0) {
        if ((data.completedSubtaskCount || 0) === 0) subtaskIconColor = 'text-red-500';
        else if (data.completedSubtaskCount === data.subtaskCount) subtaskIconColor = 'text-green-500';
        else subtaskIconColor = 'text-yellow-500';
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
         snapshot.docs.sort((a,b) => (b.data() as Note).createdAt.toMillis() - (a.data() as Note).createdAt.toMillis())
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
    unsubs.categories = onSnapshot(categoriesCollectionRef, (snapshot: QuerySnapshot<DocumentData>) => {
        dom.categorySelect.innerHTML = '<option value="Nenhuma">Sem Categoria</option>';
        dom.filterContainer.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = 'filter-btn px-3 py-1 text-sm rounded-full';
        allBtn.textContent = 'Todos';
        allBtn.addEventListener('click', () => { currentFilter = 'Todos'; loadTasks(); updateActiveFilterButton(); });
        dom.filterContainer.appendChild(allBtn);
        snapshot.docs.forEach((categoryDoc: DocumentData) => {
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
        const db = await getDb();esCollectionRef, name), { name });
        await setDoc(doc(categoriesCollectionRef, name), { name });
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    }
}
function openTaskDetailModal(taskId: string, taskTitle: string) {
async function openTaskDetailModal(taskId: string, taskTitle: string) {
    activeTaskId = taskId;xtContent = taskTitle;
    dom.detailTaskTitle.textContent = taskTitle;{userId}/tasks/${taskId}`;
    const db = await getDb();
    const basePath = `artifacts/${appId}/users/${userId}/tasks/${taskId}`;);
    const subtasksRef = collection(db, `${basePath}/subtasks`);
    const taskNotesRef = collection(db, `${basePath}/taskNotes`);unsubscribe('task_details');
    
    unsubscribe('task_details');    const unsubSub = onSnapshot(query(subtasksRef), (snap: QuerySnapshot<DocumentData>) => {

    const unsubSub = onSnapshot(query(subtasksRef), (snap: QuerySnapshot<DocumentData>) => {, b: DocumentData)=> a.data().createdAt.toMillis() - b.data().createdAt.toMillis()).forEach((d: DocumentData) => renderSubtask(d.id, d.data() as Subtask));
        dom.subtaskList.innerHTML = '';
        snap.docs.sort((a: DocumentData, b: DocumentData)=> a.data().createdAt.toMillis() - b.data().createdAt.toMillis()).forEach((d: DocumentData) => renderSubtask(d.id, d.data() as Subtask));st unsubNotes = onSnapshot(query(taskNotesRef), (snap: QuerySnapshot<DocumentData>) => {
    });
    const unsubNotes = onSnapshot(query(taskNotesRef), (snap: QuerySnapshot<DocumentData>) => {b: DocumentData)=> a.data().createdAt.toMillis() - b.data().createdAt.toMillis()).forEach((d: DocumentData) => renderTaskNote(d.id, d.data() as Note));
        dom.taskNotesList.innerHTML = '';
        snap.docs.sort((a: DocumentData, b: DocumentData)=> a.data().createdAt.toMillis() - b.data().createdAt.toMillis()).forEach((d: DocumentData) => renderTaskNote(d.id, d.data() as Note));
    });    unsubs.task_details = () => {

    unsubs.task_details = () => {);
        unsubSub();
        unsubNotes();
    };dom.taskDetailModal.classList.remove('hidden');
    
    dom.taskDetailModal.classList.remove('hidden');
}function closeTaskDetailModal() {

function closeTaskDetailModal() {t.add('hidden');
    unsubscribe('task_details');
    dom.taskDetailModal.classList.add('hidden');iner.classList.remove('hidden');
    activeTaskId = null;
    dom.detailTitleContainer.classList.remove('hidden');
    dom.detailEditContainer.classList.add('hidden');
}function toggleMainTaskEdit() {
assList.toggle('hidden');
function toggleMainTaskEdit() {
    dom.detailTitleContainer.classList.toggle('hidden');tContent || '';
    dom.detailEditContainer.classList.toggle('hidden');
    dom.detailEditInput.value = dom.detailTaskTitle.textContent || '';async () => {
    dom.detailEditInput.focus();alue.trim();
    dom.detailSaveBtn.onclick = async () => {) {
        const newText = dom.detailEditInput.value.trim();skId), { text: newText });
        if (newText && activeTaskId && tasksCollectionRef) {
            await updateDoc(doc(tasksCollectionRef, activeTaskId), { text: newText });
            if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);oggleMainTaskEdit();
        }
        toggleMainTaskEdit();m.detailCancelBtn.onclick = () => toggleMainTaskEdit();
    };
    dom.detailCancelBtn.onclick = () => toggleMainTaskEdit();
}async function handleAddSubtask() {
alue.trim(); if (!text || !activeTaskId || !userId || !tasksCollectionRef) return;
async function handleAddSubtask() {
    const text = dom.subtaskInput.value.trim(); if (!text || !activeTaskId || !userId || !tasksCollectionRef) return; { text, completed: false, createdAt: Timestamp.now() });
    const db = await getDb();
    const subtasksRef = collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`);
    await addDoc(subtasksRef, { text, completed: false, createdAt: Timestamp.now() });
    await updateDoc(doc(tasksCollectionRef, activeTaskId), { subtaskCount: increment(1) });
    if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    dom.subtaskInput.value = '';unction renderSubtask(id: string, data: Subtask) {
}    const el = document.createElement('div');
-2 rounded-lg group';
function renderSubtask(id: string, data: Subtask) {
    const el = document.createElement('div');
    el.className = 'flex items-center bg-gray-100 p-2 rounded-lg group';ype="checkbox" data-id="${id}" ${data.completed ? 'checked' : ''} class="subtask-checkbox h-4 w-4 rounded border-gray-300">
    el.innerHTML = `.completed ? 'line-through text-gray-500' : ''}">${data.text}</span>
        <div class="flex-grow flex items-center">
            <input type="checkbox" data-id="${id}" ${data.completed ? 'checked' : ''} class="subtask-checkbox h-4 w-4 rounded border-gray-300">
            <span class="subtask-text ml-3 ${data.completed ? 'line-through text-gray-500' : ''}">${data.text}</span>utton class="edit-subtask text-gray-400 hover:text-blue-500 text-sm"><i class="fas fa-pencil-alt"></i></button>
        </div>id}"><i class="fas fa-trash-alt"></i></button>
        <div class="subtask-actions flex items-center gap-2 opacity-0 group-hover:opacity-100">
            <button class="edit-subtask text-gray-400 hover:text-blue-500 text-sm"><i class="fas fa-pencil-alt"></i></button>
            <button class="delete-subtask text-gray-400 hover:text-red-500 text-sm" data-id="${id}"><i class="fas fa-trash-alt"></i></button>iveTaskId) return;
        </div>`;
    (el.querySelector('.subtask-checkbox') as HTMLInputElement).addEventListener('change', async (e: Event) => {get.checked ? 1 : -1;
        if (!activeTaskId) return;s/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id), { completed: target.checked });
        const target = e.target as HTMLInputElement;askId), { completedSubtaskCount: increment(incrementValue) });
        const incrementValue = target.checked ? 1 : -1;owToast(OFFLINE_SAVE_MESSAGE);
        const db = await getDb();
        await updateDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id), { completed: target.checked });
        await updateDoc(doc(tasksCollectionRef, activeTaskId), { completedSubtaskCount: increment(incrementValue) });
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE); if(data.completed) {
    });pletedSubtaskCount: increment(-1) });
    (el.querySelector('.delete-subtask') as HTMLButtonElement).addEventListener('click', async () => {
        if (!activeTaskId) return;(doc(tasksCollectionRef, activeTaskId), { subtaskCount: increment(-1) });
        if(data.completed) {
             await updateDoc(doc(tasksCollectionRef, activeTaskId), { subtaskCount: increment(-1), completedSubtaskCount: increment(-1) });leteDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id));
        } else {
             await updateDoc(doc(tasksCollectionRef, activeTaskId), { subtaskCount: increment(-1) });
        }ask') as HTMLButtonElement).addEventListener('click', () => {
        const db = await getDb();
        await deleteDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id));input flex-grow p-1 border rounded" value="${currentText}">
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);                 <button class="save-subtask-edit bg-green-500 text-white px-2 py-1 rounded text-sm">Salvar</button>`;
    });
    (el.querySelector('.edit-subtask') as HTMLButtonElement).addEventListener('click', () => {
        const currentText = (el.querySelector('.subtask-text') as HTMLElement).textContent || '';
        el.innerHTML = `<input type="text" class="edit-subtask-input flex-grow p-1 border rounded" value="${currentText}">
                        <button class="save-subtask-edit bg-green-500 text-white px-2 py-1 rounded text-sm">Salvar</button>`;
        const input = el.querySelector('.edit-subtask-input') as HTMLInputElement;updateDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id), { text: newText });
        input.focus();
        (el.querySelector('.save-subtask-edit') as HTMLButtonElement).addEventListener('click', async () => {
            const newText = input.value.trim();
            if(newText && activeTaskId) {
                const db = await getDb();
                await updateDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id), { text: newText });
                if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
            }ion handleAddTaskNote() {
        });st text = dom.taskNoteInput.value.trim(); if (!text || !activeTaskId || !userId || !tasksCollectionRef) return;
    });db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/taskNotes`);
    dom.subtaskList.appendChild(el);   await addDoc(taskNotesRef, { text, createdAt: Timestamp.now() });
}    await updateDoc(doc(tasksCollectionRef, activeTaskId), { noteCount: increment(1) });
(OFFLINE_SAVE_MESSAGE);
async function handleAddTaskNote() {
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
        if (!activeTaskId) return;
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
            if(newText && activeTaskId) {
                await updateDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/taskNotes`), id), { text: newText });
                if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
            }
        });
    });
    dom.taskNotesList.appendChild(el);
}

// --- Calendar Functions ---
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
    tasksSnap.forEach((doc: DocumentData) => activeDays.add(doc.data().createdAt.toDate().getDate()));
    notesSnap.forEach((doc: DocumentData) => activeDays.add(doc.data().createdAt.toDate().getDate()));
    return activeDays;
}

async function fetchPendingDueDays(year: number, month: number) {
    if (!userId || !tasksCollectionRef) return new Set();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const q = query(tasksCollectionRef, where('dueDate', '>=', startOfMonth), where('dueDate', '<=', endOfMonth), where('completed', '==', false));
    const snap = await getDocs(q);
    const days = new Set<number>();
    snap.forEach((doc: DocumentData) => {
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
        dueSnap.forEach((doc: DocumentData) => {
            const data = doc.data();
            html += `<span class='calendar-task-link text-orange-900 hover:underline cursor-pointer' data-taskid='${doc.id}'>${data.text}</span><br>`;
        });
        html += '</div>';
    }
    html += '<div class="mb-4"><h4 class="font-bold">Tarefas criadas neste dia</h4>';
    if(tasksSnap.empty) html += '<p class="text-sm">Nenhuma tarefa.</p>';
    else tasksSnap.forEach((doc: DocumentData) => html += `<p class="text-sm bg-gray-100 p-1 rounded mt-1">${doc.data().text}</p>`);
    html += '</div><div><h4 class="font-bold">Anotações</h4>';
    if(notesSnap.empty) html += '<p class="text-sm">Nenhuma anotação.</p>';
    else notesSnap.forEach((doc: DocumentData) => html += `<p class="text-sm bg-yellow-100 p-1 rounded mt-1">${doc.data().text}</p>`);
    html += '</div>';
    dom.detailsContent.innerHTML = html;
    dom.detailsContent.querySelectorAll('.calendar-task-link').forEach(el => {
        el.addEventListener('click', function(this: HTMLElement) {
            const tid = this.getAttribute('data-taskid');
            const t = dueSnap.docs.find((d: DocumentData) => d.id === tid);
            if (tid && t) {
                const taskData = t.data() as Task;
                openTaskDetailModal(tid, taskData.text);
            }
        });
    });
}

// --- Canvas Functions ---
function setupCanvasPanning() {
    const container = dom.taskCanvasContainer;
    if (!container) return;

    let isPanning = false;
    let lastX: number, lastY: number;

    const onMouseDown = (e: MouseEvent) => {
        // Inicia o pan apenas se o clique for no container, não em um card
        if ((e.target as HTMLElement).id === 'canvas-content' || e.target === container) {
            isPanning = true;
            container.style.cursor = 'grabbing';
            lastX = e.clientX;
            lastY = e.clientY;
            e.preventDefault();
        }
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!isPanning) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        container.scrollLeft -= dx;
        container.scrollTop -= dy;
        lastX = e.clientX;
        lastY = e.clientY;
    };

    const onMouseUp = () => {
        isPanning = false;
        container.style.cursor = 'grab';
    };

    container.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    // Adiciona um listener para remover os outros quando o elemento for destruído
    // (Isso é uma boa prática, mas depende de como o ciclo de vida do seu app é gerenciado)
    eventManager.add(container, 'mousedown', onMouseDown);
    eventManager.add(document, 'mousemove', onMouseMove);
    eventManager.add(document, 'mouseup', onMouseUp);
}

function getCardCenter(card: HTMLElement): { x: number; y: number } {
    // Usa offsetLeft/Top para uma posição mais confiável dentro do container com scroll
    return {
        x: card.offsetLeft + card.offsetWidth / 2,
        y: card.offsetTop + card.offsetHeight / 2,
    };
}

function getEdgeIntersection(sourceNode: HTMLElement, targetNode: HTMLElement): { x: number; y: number } {
    const sourcePos = getCardCenter(sourceNode);
    const targetPos = getCardCenter(targetNode);

    const w = targetNode.offsetWidth;
    const h = targetNode.offsetHeight;

    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;

    if (dx === 0 && dy === 0) return targetPos;

    const abs_dx = Math.abs(dx);
    const abs_dy = Math.abs(dy);

    let ix, iy;

    // Se a linha é mais horizontal que a diagonal do retângulo
    if (abs_dx * h > abs_dy * w) {
        // Intersecta com a borda esquerda/direita
        const sign_x = Math.sign(dx);
        ix = targetPos.x - sign_x * w / 2;
        iy = targetPos.y - sign_x * w / 2 * (dy / dx);
    } else {
        // Intersecta com a borda superior/inferior
        const sign_y = Math.sign(dy);
        iy = targetPos.y - sign_y * h / 2;
        ix = targetPos.x - sign_y * h / 2 * (dx / dy);
    }

    return { x: ix, y: iy };
}

function renderCanvasTasks() {
    if (!dom.canvasContent || !tasksCollectionRef) return;
    unsubscribe('canvas_tasks');
    const q = query(tasksCollectionRef);
    unsubs.canvas_tasks = onSnapshot(q, (snapshot) => {
        dom.canvasContent.innerHTML = '';
        nodesCache = {};
        snapshot.docs.forEach(docSnap => {
            const task = docSnap.data() as Task;
            createCanvasNode(task);
        });
        loadAndDrawConnections();
    }, console.error);
}

function createCanvasNode(task: Task) {
    const node = document.createElement('div');
    node.className = `canvas-task-node absolute bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 border ${task.completed ? 'border-green-400 opacity-70' : 'border-gray-300 dark:border-gray-600'}`;
    node.style.left = `${task.canvasPos?.x || 50}px`;
    node.style.top = `${task.canvasPos?.y || 50}px`;
    node.dataset.taskId = task.id;
    node.innerHTML = `
        <div class="font-bold text-base mb-2 truncate">${task.text}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Criada: ${formatFirestoreTimestamp(task.createdAt)}</div>
        <div class="canvas-task-node-link-handle"></div>`;
    dom.canvasContent.appendChild(node);
    nodesCache[task.id] = node;
    setupNodeEventListeners(node, task);
}

function setupNodeEventListeners(node: HTMLElement, task: Task) {
    let offsetX: number, offsetY: number;
    let isDragging = false;
    let hasDragged = false;
    let startX: number, startY: number; // Para o limiar de arrasto

    // Lógica para MOVER o card
    const onMouseDownMove = (e: MouseEvent) => {
        if ((e.target as HTMLElement).classList.contains('canvas-task-node-link-handle')) return;
        
        isDragging = true;
        hasDragged = false; // Reseta a flag a cada clique
        startX = e.clientX; // Armazena a posição inicial
        startY = e.clientY;
        offsetX = e.clientX - node.offsetLeft;
        offsetY = e.clientY - node.offsetTop;
        node.style.zIndex = '1000';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUpMove);
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        
        // Apenas considera arrasto se o movimento exceder um limiar
        if (!hasDragged && (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5)) {
            hasDragged = true;
        }

        if (hasDragged) {
            node.style.left = `${e.clientX - offsetX}px`;
            node.style.top = `${e.clientY - offsetY}px`;
            drawAllConnections();
        }
    };

    const onMouseUpMove = async () => {
        if (!isDragging) return;
        isDragging = false;
        node.style.zIndex = '10';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUpMove);
        
        if (hasDragged) {
            const newPos = { x: node.offsetLeft, y: node.offsetTop };
            if (tasksCollectionRef) {
                await updateDoc(doc(tasksCollectionRef, task.id), { canvasPos: newPos });
            }
        } else {
            // Se não arrastou, foi um clique. Abre o popup.
            openCanvasPopup(task);
        }
    };
    
    node.addEventListener('mousedown', onMouseDownMove);
    // A lógica de clique agora é tratada no onMouseUpMove, então o dblclick é removido.

    // Lógica para CONECTAR os cards (arrastar do conector)
    const handle = node.querySelector('.canvas-task-node-link-handle') as HTMLElement;
    
    const onMouseDownLink = (e: MouseEvent) => {
        e.stopPropagation();
        
        linkingStartNodeId = task.id;
        dom.taskCanvasContainer.classList.add('linking-mode');

        const startPos = getCardCenter(node);

        linkingLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        linkingLine.setAttribute('x1', `${startPos.x}`);
        linkingLine.setAttribute('y1', `${startPos.y}`);
        linkingLine.setAttribute('x2', `${startPos.x}`);
        linkingLine.setAttribute('y2', `${startPos.y}`);
        linkingLine.setAttribute('class', 'linking-line');
        dom.canvasLinesSvg.appendChild(linkingLine);

        const onMouseMoveLink = (eMove: MouseEvent) => {
            if (!linkingLine) return;
            const containerRect = dom.taskCanvasContainer.getBoundingClientRect();
            const x = eMove.clientX - containerRect.left + dom.taskCanvasContainer.scrollLeft;
            const y = eMove.clientY - containerRect.top + dom.taskCanvasContainer.scrollTop;
            linkingLine.setAttribute('x2', `${x}`);
            linkingLine.setAttribute('y2', `${y}`);
        };

        const onMouseUpLink = (eUp: MouseEvent) => {
            const endNodeEl = (eUp.target as HTMLElement).closest('.canvas-task-node') as HTMLElement | null;
            if (endNodeEl && endNodeEl.dataset.taskId && endNodeEl.dataset.taskId !== linkingStartNodeId) {
                const endNodeId = endNodeEl.dataset.taskId;
                createConnection(linkingStartNodeId!, endNodeId);
            }
            
            // Limpeza
            if (linkingLine) {
                linkingLine.remove();
                linkingLine = null;
            }
            linkingStartNodeId = null;
            dom.taskCanvasContainer.classList.remove('linking-mode');
            document.removeEventListener('mousemove', onMouseMoveLink);
            document.removeEventListener('mouseup', onMouseUpLink);
        };

        document.addEventListener('mousemove', onMouseMoveLink);
        document.addEventListener('mouseup', onMouseUpLink, { once: true });
    };

    handle.addEventListener('mousedown', onMouseDownLink);
}

async function openCanvasPopup(task: Task) {
    if (!dom.canvasTaskPopup) return;

    // Posiciona e exibe o popup imediatamente com o estado de "carregando"
    const nodeEl = nodesCache[task.id];
    if (!nodeEl) return;

    const containerScrollLeft = dom.taskCanvasContainer.scrollLeft;
    const containerScrollTop = dom.taskCanvasContainer.scrollTop;

    // Usa offsetLeft/Top que são relativos ao pai posicionado (o container)
    dom.canvasTaskPopup.style.left = `${nodeEl.offsetLeft + nodeEl.offsetWidth + 10 - containerScrollLeft}px`;
    dom.canvasTaskPopup.style.top = `${nodeEl.offsetTop - containerScrollTop}px`;
    
    dom.canvasTaskPopup.classList.remove('hidden');
    
    dom.canvasPopupTitle.textContent = task.text;
    dom.canvasPopupSubtasks.innerHTML = 'Carregando...';
    dom.canvasPopupNotes.innerHTML = 'Carregando...';

    // Busca os dados e atualiza o conteúdo do popup
    const subtasksRef = collection(db, `artifacts/${appId}/users/${userId}/tasks/${task.id}/subtasks`);
    const notesRef = collection(db, `artifacts/${appId}/users/${userId}/tasks/${task.id}/taskNotes`);
    const [subtasksSnap, notesSnap] = await Promise.all([getDocs(subtasksRef), getDocs(notesRef)]);
    dom.canvasPopupSubtasks.innerHTML = subtasksSnap.empty ? '<p>Nenhuma sub-tarefa.</p>' : subtasksSnap.docs.map((d: DocumentData) => `<p class="${d.data().completed ? 'completed' : ''}">${d.data().text}</p>`).join('');
    dom.canvasPopupNotes.innerHTML = notesSnap.empty ? '<p>Nenhuma anotação.</p>' : notesSnap.docs.map((d: DocumentData) => `<p>${d.data().text}</p>`).join('');
}

function closeCanvasPopup() {
    if (dom.canvasTaskPopup) dom.canvasTaskPopup.classList.add('hidden');
}

// Funções de conexão (startLinking e cancelLinking foram removidas e integradas acima)
async function createConnection(fromId: string, toId: string) {
    if (!tasksCollectionRef || !userId) return;
    const connectionId = `${fromId}_${toId}`;
    const connectionRef = doc(collection(db, `artifacts/${appId}/users/${userId}/connections`), connectionId);
    await setDoc(connectionRef, { from: fromId, to: toId });
}

async function loadAndDrawConnections() {
    if (!userId) return;
    const connectionsRef = collection(db, `artifacts/${appId}/users/${userId}/connections`);
    
    // Usar onSnapshot para atualizações em tempo real
    unsubscribe('connections'); // Garante que não haja listeners duplicados
    unsubs.connections = onSnapshot(connectionsRef, 
        (snapshot: QuerySnapshot<DocumentData>) => {
            connectionsCache = snapshot.docs.map((doc: DocumentData) => doc.data());
            console.log(`[Canvas] Conexões carregadas: ${connectionsCache.length}`, connectionsCache);
            drawAllConnections();
        },
        console.error
    );
}

function drawAllConnections() {
    if (!dom.canvasLinesSvg) return;
    dom.canvasLinesSvg.innerHTML = ''; // Limpa linhas antigas

    // Define a ponta da seta para as linhas de conexão
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('viewBox', '0 -5 10 10');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '0');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0,-5L10,0L0,5');
    path.setAttribute('fill', '#9ca3af'); // Cor da seta, corresponde ao ícone de lixeira
    marker.appendChild(path);
    defs.appendChild(marker);
    dom.canvasLinesSvg.appendChild(defs);

    connectionsCache.forEach(conn => {
        const fromNode = nodesCache[conn.from];
        const toNode = nodesCache[conn.to];

        if (fromNode && toNode) {
            const fromPos = getEdgeIntersection(toNode, fromNode);
            const toPos = getEdgeIntersection(fromNode, toNode);
            
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.classList.add('canvas-line-group');

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', `${fromPos.x}`);
            line.setAttribute('y1', `${fromPos.y}`);
            line.setAttribute('x2', `${toPos.x}`);
            line.setAttribute('y2', `${toPos.y}`);
            line.setAttribute('class', 'canvas-line');
            line.setAttribute('marker-end', 'url(#arrowhead)'); // Adiciona a seta
            
            // Cria o ícone de lixeira no meio da linha (usando os centros dos cards)
            const fromCenter = getCardCenter(fromNode);
            const toCenter = getCardCenter(toNode);
            const iconSize = 24;
            const iconX = (fromCenter.x + toCenter.x) / 2 - iconSize / 2;
            const iconY = (fromCenter.y + toCenter.y) / 2 - iconSize / 2;
            
            const iconWrapper = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
            iconWrapper.setAttribute('x', `${iconX}`);
            iconWrapper.setAttribute('y', `${iconY}`);
            iconWrapper.setAttribute('width', `${iconSize}`);
            iconWrapper.setAttribute('height', `${iconSize}`);
            iconWrapper.classList.add('delete-line-icon-wrapper');

            const iconBody = document.createElement('div');
            iconBody.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
            iconBody.className = 'delete-line-icon';
            iconBody.innerHTML = '<i class="fas fa-trash-alt fa-xs"></i>';
            
            iconBody.addEventListener('click', (e) => {
                e.stopPropagation(); // Impede que o clique se propague para outros elementos
                deleteConnection(conn.from, conn.to);
            });

            iconWrapper.appendChild(iconBody);
            group.appendChild(line);
            group.appendChild(iconWrapper);
            dom.canvasLinesSvg.appendChild(group);
        }
    });
}

async function deleteConnection(fromId: string, toId: string) {
    if (!userId) return;
    const connectionId = `${fromId}_${toId}`;
    const connectionRef = doc(collection(db, `artifacts/${appId}/users/${userId}/connections`), connectionId);
    try {
        await deleteDoc(connectionRef);
        console.log(`[Canvas] Conexão ${connectionId} excluída.`);
    } catch (error) {
        console.error("Erro ao excluir conexão:", error);
        showToast("Erro ao excluir a conexão.");
    }
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
    eventManager.add(dom.userMenuTrigger, 'click', () => dom.userMenuDropdown.classList.toggle('hidden'));
    eventManager.add(document, 'click', (e: MouseEvent) => {
        const target = e.target as Node;
        if (dom.userMenuContainer && dom.userMenuDropdown && !dom.userMenuContainer.contains(target)) {
            dom.userMenuDropdown.classList.add('hidden');
        }
        // Modificado para fechar o popup apenas se o clique for fora dele E fora de um node
        if (dom.canvasTaskPopup && !dom.canvasTaskPopup.classList.contains('hidden')) {
            const clickedNode = (e.target as HTMLElement).closest('.canvas-task-node');
            const clickedPopup = (e.target as HTMLElement).closest('#canvas-task-popup');
            if (!clickedNode && !clickedPopup) {
                closeCanvasPopup();
            }
        }
    });
    eventManager.add(dom.logoutBtn, 'click', async () => { await signOut(auth); dom.userMenuDropdown.classList.add('hidden'); });
    eventManager.add(window, 'online', updateConnectionStatus);
    eventManager.add(window, 'offline', updateConnectionStatus);
    eventManager.add(dom.viewToggleBtn, 'click', toggleView);
    if (dom.canvasPopupCloseBtn) dom.canvasPopupCloseBtn.addEventListener('click', closeCanvasPopup);
    if (dom.closeCanvasModalBtn) dom.closeCanvasModalBtn.onclick = () => toggleView();
};

function toggleView() {
    isCanvasView = !isCanvasView;
    if (isCanvasView) {
        if (dom.mainContentApp) dom.mainContentApp.classList.add('hidden');
        if (dom.canvasModal) dom.canvasModal.classList.remove('hidden');
        renderCanvasTasks();
        if (dom.viewToggleIcon) dom.viewToggleIcon.className = 'fas fa-list fa-lg';
        if (dom.viewToggleBtn) dom.viewToggleBtn.title = 'Voltar para lista';
    } else {
        if (dom.canvasModal) dom.canvasModal.classList.add('hidden');
        if (dom.mainContentApp) dom.mainContentApp.classList.remove('hidden');
        if (dom.viewToggleIcon) dom.viewToggleIcon.className = 'fas fa-project-diagram fa-lg';
        if (dom.viewToggleBtn) dom.viewToggleBtn.title = 'Visualizar Canvas';
    }
}

const initApp = () => {
    setupFirestoreCollections();
    setupAppEventListeners();
    setupCanvasPanning(); // Adiciona a funcionalidade de arrastar o canvas
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
    nodesCache = {};
    connectionsCache = [];
    setButtonsDisabled(true);
};

const setupFirestoreCollections = () => {
    if (!userId) return;
    const basePath = `artifacts/${appId}/users/${userId}`;
    tasksCollectionRef = collection(db, `${basePath}/tasks`).withConverter(taskConverter);
    notesCollectionRef = collection(db, `${basePath}/notes`).withConverter(noteConverter);
    categoriesCollectionRef = collection(db, `${basePath}/categories`);
};

const loadAndRenderAll = () => {
    updateConnectionStatus();
    displayCurrentDate();
    updateToggleCompletedButton();
    loadCategories();
    loadTasks();
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

const start = async () => {
    // Garante que o DB esteja pronto antes de qualquer outra coisa
    await initializeOfflinePersistence(showToast); 
    
    setButtonsDisabled(true);
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

    onAuthStateChanged(auth, (user: User | null) => {
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

async function analyzeWithAI() {
    if (!tasksCollectionRef || !notesCollectionRef || !navigator.onLine || !userId) {
        showToast("A análise com IA requer uma conexão com a internet.");
        return;
    };
    dom.aiAnalyzeContent.innerHTML = 'Analisando com Gemini...';
    dom.aiAnalyzeModal.classList.remove('hidden');
    
    try {
        const tasksSnap = await getDocs(query(tasksCollectionRef, where('completed', '==', false)));
        const tasks = tasksSnap.docs.map((doc: DocumentData) => ({ id: doc.id, ...doc.data() } as Task));
        const notesSnap = await getDocs(query(notesCollectionRef));
        const notes = notesSnap.docs.map((doc: DocumentData) => ({ id: doc.id, ...doc.data() } as Note));

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

window.addEventListener('DOMContentLoaded', () => {
    start();
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
    if (dom.aiAnalyzeBtn) dom.aiAnalyzeBtn.onclick = analyzeWithAI;
    if (dom.closeAiAnalyzeModal) dom.closeAiAnalyzeModal.onclick = () => dom.aiAnalyzeModal.classList.add('hidden');
    if (dom.aiAnalyzeModal) dom.aiAnalyzeModal.addEventListener('click', e => { if (e.target === dom.aiAnalyzeModal) dom.aiAnalyzeModal.classList.add('hidden'); });
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
    updateThemeButton(savedTheme);
});