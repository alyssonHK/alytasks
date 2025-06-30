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
        await setDoc(doc(categoriesCollectionRef, name), { name });
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    }
}
async function openTaskDetailModal(taskId: string, taskTitle: string) {
    activeTaskId = taskId;
    dom.detailTaskTitle.textContent = taskTitle;
    if (!userId) return;
    const db = await getDb();
    const basePath = `artifacts/${appId}/users/${userId}/tasks/${taskId}`;
    const subtasksRef = collection(db, `${basePath}/subtasks`);
    const taskNotesRef = collection(db, `${basePath}/taskNotes`);
    unsubscribe('task_details');
    const unsubSub = onSnapshot(query(subtasksRef), (snap: QuerySnapshot<DocumentData>) => {
        dom.subtaskList.innerHTML = '';
        snap.docs.sort((a: DocumentData, b: DocumentData) => a.data().createdAt.toMillis() - b.data().createdAt.toMillis())
            .forEach((d: DocumentData) => renderSubtask(d.id, d.data() as Subtask));
    });
    const unsubNotes = onSnapshot(query(taskNotesRef), (snap: QuerySnapshot<DocumentData>) => {
        dom.taskNotesList.innerHTML = '';
        snap.docs.sort((a: DocumentData, b: DocumentData) => a.data().createdAt.toMillis() - b.data().createdAt.toMillis())
            .forEach((d: DocumentData) => renderTaskNote(d.id, d.data() as Note));
    });
    unsubs.task_details = () => {
        unsubSub();
        unsubNotes();
    };
    dom.taskDetailModal.classList.remove('hidden');
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
    const text = dom.subtaskInput.value.trim();
    if (!text || !activeTaskId || !userId || !tasksCollectionRef) return;
    const db = await getDb();
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
        if (!activeTaskId) return;
        const target = e.target as HTMLInputElement;
        const incrementValue = target.checked ? 1 : -1;
        const db = await getDb();
        await updateDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id), { completed: target.checked });
        await updateDoc(doc(tasksCollectionRef, activeTaskId), { completedSubtaskCount: increment(incrementValue) });
        if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
    });
    (el.querySelector('.delete-subtask') as HTMLButtonElement).addEventListener('click', async () => {
        if (!activeTaskId) return;
        const db = await getDb();
        if (data.completed) {
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
            if (newText && activeTaskId) {
                const db = await getDb();
                await updateDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/subtasks`), id), { text: newText });
                if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
            }
        });
    });
    dom.subtaskList.appendChild(el);
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
        const db = await getDb();
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
            if (newText && activeTaskId) {
                const db = await getDb();
                await updateDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/tasks/${activeTaskId}/taskNotes`), id), { text: newText });
                if (!navigator.onLine) showToast(OFFLINE_SAVE_MESSAGE);
            }
        });
    });
    dom.taskNotesList.appendChild(el);
}

function getDb() {
    return db;
}