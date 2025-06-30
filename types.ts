/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export interface Task {
    id: string;
    text: string;
    completed: boolean;
    category: string | null;
    createdAt: Timestamp;
    dueDate: Timestamp | null;
    subtaskCount: number;
    noteCount: number;
    completedSubtaskCount: number;
    x?: number;
    y?: number;
    connections?: string[];
}

export interface Note {
    id: string;
    text: string;
    createdAt: Timestamp;
}

export interface Subtask {
    id: string;
    text: string;
    completed: boolean;
    createdAt: Timestamp;
}
