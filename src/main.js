import { supabase } from "./supabase.js";
import { signUp, signIn, signOut, getCurrentSession } from "./auth.js";

import {
  clearInput,
  formatTaskDate,
  formatTaskStatusLabel,
  updateCounter,
} from "./task-helpers.js";

const taskForm = document.querySelector(".task-form");
const taskInput = document.querySelector(".task-input");
const taskProjectSelect = document.querySelector(".task-project-select");
const tasksList = document.querySelector(".tasks-list");
const tasksEmptyState = document.querySelector(".tasks-empty-state");
const taskCount = document.querySelector(".task-count");
const taskCountLabel = document.querySelector(".task-count-label");
const taskFormCard = document.querySelector(".card-form");
const projectsCard = document.querySelector(".card-projects");
const tasksCard = document.querySelector(".card-tasks");
const pomodoroCard = document.querySelector(".card-pomodoro");
const pomodoroCurrentTask = document.querySelector(".pomodoro-current-task");
const pomodoroCurrentTaskLabel = document.querySelector(".pomodoro-current-task-label");
const pomodoroCurrentTaskText = document.querySelector(".pomodoro-current-task-text");
const authCard = document.querySelector(".card-auth");
const TASK_STATUSES = ["todo", "in_progress", "done"];
const PROJECT_STATUS_OPTIONS = [
  "Ready to start",
  "In Progress",
  "Question",
  "Done",
];
const PROJECT_PRIORITY_OPTIONS = ["Urgent", "High", "Medium", "Low"];
const filterButtons = document.querySelectorAll(".tasks-toolbar .chip");
const authEmailInput = document.querySelector(".auth-email-input");
const authPasswordInput = document.querySelector(".auth-password-input");
const authSignUpButton = document.querySelector(".auth-sign-up-button");
const authSignInButton = document.querySelector(".auth-sign-in-button");
const authSignOutButton = document.querySelector(".topbar-sign-out-button");
const authMessage = document.querySelector(".auth-message");
const authMessageTitle = document.querySelector(".auth-message-title");
const authMessageText = document.querySelector(".auth-message-text");
const topbarUserInfo = document.querySelector(".topbar-user-info");
const topbarUserEmail = document.querySelector(".topbar-user-email");
const projectsList = document.querySelector(".projects-list");
const projectsEmptyState = document.querySelector(".projects-empty-state");
const projectsSyncButton = document.querySelector(".projects-sync-button");
const projectsMessage = document.querySelector(".projects-message");
const projectsMessageText = document.querySelector(".projects-message-text");
const projectsCount = document.querySelector(".projects-count");
const projectsCountLabel = document.querySelector(".projects-count-label");
const projectFilterButtons = document.querySelectorAll(".projects-toolbar .chip");
const projectsPagination = document.querySelector(".projects-pagination");
const projectsLoadMoreButton = document.querySelector(".projects-load-more-button");

let allTasks = [];
let activeTaskFilter = "all";
let activeProjectFilter = "all";
let isLoggedIn = false;
let isPomodoroRunning = false;
let currentPomodoroMode = "focus";
let allProjects = [];
let visibleProjectsCount = 5;
let editingTaskId = "";
let editingTaskValues = {
  title: "",
  projectId: "",
};
let editingProjectId = "";
let editingProjectValues = {
  name: "",
  status: "",
  priority: "",
};
let savingProjectId = "";

authSignUpButton.addEventListener("click", async () => {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();

  const { error } = await signUp(email, password);

  if (error) {
    console.error(error);
    showAuthMessage("error", "Sign up failed", error.message);
    return;
  }

  showAuthMessage(
    "success",
    "Account created",
    "Your account was created successfully. You can sign in now.",
  );
  await refreshSessionUI();
});

authSignInButton.addEventListener("click", async () => {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();

  const { error } = await signIn(email, password);

  if (error) {
    console.error(error);
    showAuthMessage("error", "Sign in failed", error.message);
    return;
  }

  showAuthMessage("success", "Signed in", "You are now signed in.");
  await refreshSessionUI();
});

authSignOutButton.addEventListener("click", async () => {
  const { error } = await signOut();

  if (error) {
    console.error(error);
    return;
  }

  clearAuthInputs();
  updateAuthUI(null);
  showAuthMessage("neutral", "Signed out", "You have been signed out.");
});

document.addEventListener("DOMContentLoaded", async function () {
  await refreshSessionUI();
});

projectsSyncButton?.addEventListener("click", async () => {
  await syncProjectsFromNotion(true);
});

projectsLoadMoreButton?.addEventListener("click", () => {
  visibleProjectsCount += 5;
  applyProjectFilter(activeProjectFilter);
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  const projectId = taskProjectSelect.value;

  if (!taskForm.reportValidity()) {
    return;
  }

  await createTask(title, projectId);
  clearInput(taskInput);
  taskProjectSelect.value = "";
  await initTasks();
});

tasksList.addEventListener("click", async (event) => {
  const buttonEdit = event.target.closest(".task-edit-button");
  const buttonSave = event.target.closest(".task-inline-save-button");
  const buttonCancel = event.target.closest(".task-inline-cancel-button");
  const buttonNext = event.target.closest(".task-next-status-button");
  const buttonDelete = event.target.closest(".task-delete-button");

  if (buttonEdit) {
    const taskId = buttonEdit.dataset.id;
    const currentTitle = decodeTaskTitle(buttonEdit.dataset.title);
    const currentProjectId = buttonEdit.dataset.projectId || "";

    startTaskEditing(taskId, currentTitle, currentProjectId);
    return;
  }

  if (buttonSave) {
    const taskId = buttonSave.dataset.id;

    await saveTaskChanges(taskId);
    return;
  }

  if (buttonCancel) {
    cancelTaskEditing();
    applyTaskFilter(activeTaskFilter);
    return;
  }

  if (buttonNext) {
    const taskId = buttonNext.dataset.id;
    const currentStatus = buttonNext.dataset.status;

    try {
      await updateTask(taskId, currentStatus);
      await initTasks();
    } catch (error) {
      console.error(error);
    }

    return;
  }

  if (buttonDelete) {
    const taskId = buttonDelete.dataset.id;

    await deleteTask(taskId);
    await initTasks();
  }
});

tasksList.addEventListener("input", (event) => {
  const titleInput = event.target.closest(".task-inline-edit-input");

  if (titleInput) {
    editingTaskValues = {
      ...editingTaskValues,
      title: titleInput.value,
    };
  }
});

tasksList.addEventListener("change", (event) => {
  const projectSelect = event.target.closest(".task-inline-edit-project-select");

  if (!projectSelect) {
    return;
  }

  editingTaskValues = {
    ...editingTaskValues,
    projectId: projectSelect.value,
  };
});

projectsList.addEventListener("click", async (event) => {
  const buttonEdit = event.target.closest(".project-edit-button");
  const buttonSave = event.target.closest(".project-inline-save-button");
  const buttonCancel = event.target.closest(".project-inline-cancel-button");
  const buttonNext = event.target.closest(".project-next-status-button");

  if (buttonEdit) {
    const projectId = buttonEdit.dataset.id;
    const currentName = decodeProjectValue(buttonEdit.dataset.name);
    const currentStatus = decodeProjectValue(buttonEdit.dataset.status);
    const currentPriority = decodeProjectValue(buttonEdit.dataset.priority);

    startProjectEditing(projectId, currentName, currentStatus, currentPriority);
    return;
  }

  if (buttonSave) {
    const projectId = buttonSave.dataset.id;

    await saveProjectChanges(projectId);
    return;
  }

  if (buttonNext) {
    const projectId = buttonNext.dataset.id;
    const currentStatus = decodeProjectValue(buttonNext.dataset.status);

    await moveProjectToNextStatus(projectId, currentStatus);
    return;
  }

  if (buttonCancel) {
    cancelProjectEditing();
    applyProjectFilter(activeProjectFilter);
  }
});

projectsList.addEventListener("input", (event) => {
  const nameInput = event.target.closest(".project-inline-edit-name-input");

  if (!nameInput) {
    return;
  }

  editingProjectValues = {
    ...editingProjectValues,
    name: nameInput.value,
  };
});

projectsList.addEventListener("change", (event) => {
  const statusSelect = event.target.closest(".project-inline-edit-status-select");
  const prioritySelect = event.target.closest(".project-inline-edit-priority-select");

  if (statusSelect) {
    editingProjectValues = {
      ...editingProjectValues,
      status: statusSelect.value,
    };
  }

  if (prioritySelect) {
    editingProjectValues = {
      ...editingProjectValues,
      priority: prioritySelect.value,
    };
  }
});

document.addEventListener("pomodoro:state-change", (event) => {
  isPomodoroRunning = Boolean(event.detail?.isRunning);
  currentPomodoroMode = event.detail?.mode || "focus";
  syncTaskFormCardVisibility();
  updatePomodoroCurrentTask();
});

async function createTask(title, projectId) {
  if (!title || !projectId) {
    return;
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const { error } = await supabase.from("tasks").insert([
    {
      title: title,
      status: normalizeTaskStatus(TASK_STATUSES[0]),
      project_notion_page_id: projectId,
      user_id: user.id,
    },
  ]);

  if (error) {
    throw error;
  }
}

async function readTasks() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id);

  return data;
}

async function updateTask(taskId, currentStatus) {
  const normalizedStatus = normalizeTaskStatus(currentStatus);
  const currentIndex = TASK_STATUSES.indexOf(normalizedStatus);
  const nextIndex = (currentIndex + 1) % TASK_STATUSES.length;
  const nextStatus = TASK_STATUSES[nextIndex];

  const { error } = await supabase
    .from("tasks")
    .update({ status: nextStatus })
    .eq("id", taskId);

  if (error) {
    throw error;
  }
}

function startTaskEditing(taskId, currentTitle, currentProjectId) {
  editingTaskId = getTaskIdValue(taskId);
  editingTaskValues = {
    title: currentTitle,
    projectId: currentProjectId || "",
  };
  applyTaskFilter(activeTaskFilter);
  focusInlineEditField(".task-inline-edit-input");
}

function cancelTaskEditing() {
  editingTaskId = "";
  editingTaskValues = {
    title: "",
    projectId: "",
  };
}

async function saveTaskChanges(taskId) {
  const normalizedTaskId = getTaskIdValue(taskId);
  const nextTitle = editingTaskValues.title.trim();
  const nextProjectId = editingTaskValues.projectId;
  const currentTask = allTasks.find((task) => getTaskIdValue(task.id) === normalizedTaskId);

  if (!nextTitle || !nextProjectId) {
    return;
  }

  if (
    currentTask &&
    currentTask.title === nextTitle &&
    (currentTask.project_notion_page_id || "") === nextProjectId
  ) {
    cancelTaskEditing();
    applyTaskFilter(activeTaskFilter);
    return;
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      title: nextTitle,
      project_notion_page_id: nextProjectId,
    })
    .eq("id", normalizedTaskId);

  if (error) {
    throw error;
  }

  cancelTaskEditing();
  await initTasks();
}

function startProjectEditing(projectId, currentName, currentStatus, currentPriority) {
  editingProjectId = projectId;
  editingProjectValues = {
    name: currentName,
    status: resolveProjectStatus(currentStatus) || currentStatus || PROJECT_STATUS_OPTIONS[0],
    priority: resolveProjectPriority(currentPriority) ?? "",
  };
  applyProjectFilter(activeProjectFilter);
  focusInlineEditField(".project-inline-edit-name-input");
}

function cancelProjectEditing() {
  editingProjectId = "";
  editingProjectValues = {
    name: "",
    status: "",
    priority: "",
  };
}

async function saveProjectChanges(projectId) {
  const nextName = editingProjectValues.name.trim();
  const nextStatus = resolveProjectStatus(editingProjectValues.status);
  const nextPriority = resolveProjectPriority(editingProjectValues.priority);
  const currentProject = allProjects.find((project) => {
    return (project.notion_page_id || project.id) === projectId;
  });

  if (!nextName) {
    showProjectsMessage("error", "Project name can't be empty.");
    return;
  }

  if (!nextStatus) {
    showProjectsMessage(
      "error",
      `Use one of these statuses: ${PROJECT_STATUS_OPTIONS.join(", ")}.`,
    );
    return;
  }

  if (nextPriority === null) {
    showProjectsMessage(
      "error",
      `Use one of these priorities: ${PROJECT_PRIORITY_OPTIONS.join(", ")}, or leave it empty.`,
    );
    return;
  }

  const hasChanges =
    nextName !== (currentProject?.name || "") ||
    nextStatus !== (currentProject?.status || "") ||
    nextPriority !== (currentProject?.priority || "");

  if (!hasChanges) {
    cancelProjectEditing();
    applyProjectFilter(activeProjectFilter);
    return;
  }

  showProjectsMessage("neutral", "Saving project changes...");
  savingProjectId = projectId;
  applyProjectFilter(activeProjectFilter);

  try {
    const updatedProject = await updateProjectInNotion(projectId, {
      name: nextName,
      status: nextStatus,
      priority: nextPriority,
    });

    await saveProjectsToSupabase([updatedProject], {
      removeMissingProjects: false,
    });
    cancelProjectEditing();
    await loadProjectsFromSupabase();
    hideProjectsMessage();
  } catch (error) {
    console.error(error);
    showProjectsMessage(
      "error",
      error.message || "Failed to update the Notion project.",
    );
  } finally {
    savingProjectId = "";
  }
}

async function moveProjectToNextStatus(projectId, currentStatus) {
  const nextStatus = getNextProjectStatus(currentStatus);

  showProjectsMessage("neutral", "Updating project status...");

  try {
    const currentProject = allProjects.find((project) => {
      return (project.notion_page_id || project.id) === projectId;
    });

    const updatedProject = await updateProjectInNotion(projectId, {
      name: currentProject?.name || "",
      status: nextStatus,
      priority: currentProject?.priority || "",
    });

    await saveProjectsToSupabase([updatedProject], {
      removeMissingProjects: false,
    });
    await loadProjectsFromSupabase();
    hideProjectsMessage();
  } catch (error) {
    console.error(error);
    showProjectsMessage(
      "error",
      error.message || "Failed to update the project status.",
    );
  }
}

async function deleteTask(taskId) {
  await supabase.from("tasks").delete().eq("id", taskId);
}

function renderTasks(tasks) {
  tasksList.innerHTML = "";

  if (tasks.length === 0) {
    tasksList.setAttribute("hidden", true);
    tasksEmptyState.removeAttribute("hidden");
    return;
  }

  tasksList.removeAttribute("hidden");
  tasksEmptyState.setAttribute("hidden", true);

  tasks.forEach((task) => {
    const taskId = getTaskIdValue(task.id);
    tasksList.innerHTML += editingTaskId === taskId
      ? renderTaskEditItem(task)
      : renderTaskItem(task);
  });
}

function renderTaskItem(task) {
  const createdAt = formatTaskDate(task.created_at);
  const taskStatus = normalizeTaskStatus(task.status);
  const statusLabel = getTaskStatusLabel(task.status);
  const projectName = getTaskProjectName(task);
  const safeTaskTitle = escapeHtml(task.title);
  const safeStatusLabel = escapeHtml(statusLabel);
  const safeCreatedAt = escapeHtml(createdAt);
  const safeCreatedAtValue = escapeHtml(task.created_at);
  const safeProjectName = escapeHtml(projectName);
  const projectMarkup = projectName
    ? `<span class="task-project-pill">${safeProjectName}</span>`
    : "";

  return `
    <li class="task-item">
      <div class="task-item-main">
        <p class="task-item-title">${safeTaskTitle}</p>
        <div class="task-item-meta">
          <span class="task-status task-status-${taskStatus}">${safeStatusLabel}</span>
          ${projectMarkup}
          <time class="task-created-at" datetime="${safeCreatedAtValue}">${safeCreatedAt}</time>
        </div>
      </div>

      <div class="task-item-actions">
        <button
          type="button"
          class="task-edit-button"
          data-id="${task.id}"
          data-title="${encodeTaskTitle(task.title)}"
          data-project-id="${escapeHtml(task.project_notion_page_id || "")}"
          aria-label="Edit task"
          title="Edit task"
        >
          <svg
            class="task-edit-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"
              fill="currentColor"
            ></path>
            <path
              d="M20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.84 1.84 3.75 3.75z"
              fill="currentColor"
            ></path>
          </svg>
        </button>

        <button
          type="button"
          class="task-next-status-button"
          data-id="${task.id}"
          data-status="${task.status}"
          aria-label="Next status"
          title="Next status"
        >
          <svg
            class="task-next-status-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M5 11h10.17l-3.58-3.59L13 6l6 6-6 6-1.41-1.41L15.17 13H5z"
              fill="currentColor"
            ></path>
          </svg>
        </button>

        <button
          type="button"
          class="task-delete-button"
          data-id="${task.id}"
          aria-label="Delete task"
          title="Delete task"
        >
          <svg
            class="task-delete-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M9 3h6l1 2h4v2H4V5h4z"
              fill="currentColor"
            ></path>
            <path
              d="M7 9h10l-.8 10.2A2 2 0 0 1 14.21 21H9.79a2 2 0 0 1-1.99-1.8z"
              fill="currentColor"
            ></path>
          </svg>
        </button>
      </div>
    </li>
  `;
}

function renderTaskEditItem(task) {
  const createdAt = formatTaskDate(task.created_at);
  const normalizedTaskStatus = normalizeTaskStatus(task.status);
  const statusLabel = getTaskStatusLabel(task.status);
  const projectOptionsMarkup = buildTaskProjectOptionsMarkup(
    editingTaskValues.projectId,
  );
  const safeCreatedAt = escapeHtml(createdAt);
  const safeCreatedAtValue = escapeHtml(task.created_at);
  const safeTaskTitle = escapeHtml(editingTaskValues.title);
  const safeStatusLabel = escapeHtml(statusLabel);

  return `
    <li class="task-item task-item-editing">
      <div class="inline-edit-state-row">
        <span class="inline-edit-state-badge">Editing task</span>
      </div>
      <div class="task-item-main task-item-main-editing">
        <div class="inline-edit-grid inline-edit-grid-task">
          <label class="field inline-edit-field inline-edit-field-wide">
            <span class="field-label">Task title</span>
            <input
              type="text"
              class="task-inline-edit-input inline-edit-input"
              data-id="${task.id}"
              value="${safeTaskTitle}"
            />
          </label>

          <label class="field inline-edit-field">
            <span class="field-label">Project</span>
            <select
              class="task-inline-edit-project-select inline-edit-select"
              data-id="${task.id}"
            >
              ${projectOptionsMarkup}
            </select>
          </label>
        </div>
        <div class="task-item-meta">
          <span class="task-status task-status-${normalizedTaskStatus}">${safeStatusLabel}</span>
          <time class="task-created-at" datetime="${safeCreatedAtValue}">${safeCreatedAt}</time>
        </div>
      </div>

      <div class="task-item-actions task-item-actions-editing">
        <button
          type="button"
          class="task-inline-save-button"
          data-id="${task.id}"
          aria-label="Save task changes"
          title="Save task changes"
        >
          <svg
            class="task-inline-save-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M20 6 9 17l-5-5"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
            ></path>
          </svg>
        </button>
        <button
          type="button"
          class="task-inline-cancel-button"
          aria-label="Cancel task changes"
          title="Cancel task changes"
        >
          <svg
            class="task-inline-cancel-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M6 6l12 12M18 6 6 18"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="2.5"
            ></path>
          </svg>
        </button>
      </div>
    </li>
  `;
}

async function initTasks() {
  const tasks = await readTasks();
  allTasks = tasks;

  if (
    editingTaskId &&
    !allTasks.some((task) => getTaskIdValue(task.id) === editingTaskId)
  ) {
    cancelTaskEditing();
  }

  applyTaskFilter(activeTaskFilter);
  updatePomodoroCurrentTask();
}

async function initProjects() {
  if (!isLoggedIn) {
    return;
  }

  await loadProjectsFromSupabase();
  await syncProjectsFromNotion(false);
}

async function refreshSessionUI() {
  const { data, error } = await getCurrentSession();

  if (error) {
    console.error(error);
    return;
  }

  const session = data.session;
  updateAuthUI(session);

  if (session) {
    await Promise.all([initTasks(), initProjects()]);
  }
}

function updateAuthUI(session) {
  isLoggedIn = Boolean(session);
  const userEmail = session?.user?.email || "";
  document.body.classList.toggle("auth-only-view", !isLoggedIn);

  syncTaskFormCardVisibility();
  projectsCard.toggleAttribute("hidden", !isLoggedIn);
  tasksCard.toggleAttribute("hidden", !isLoggedIn);
  pomodoroCard.toggleAttribute("hidden", !isLoggedIn);
  authCard.toggleAttribute("hidden", isLoggedIn);

  authSignUpButton.toggleAttribute("hidden", isLoggedIn);
  authSignInButton.toggleAttribute("hidden", isLoggedIn);
  authSignOutButton.toggleAttribute("hidden", !isLoggedIn);
  topbarUserInfo.toggleAttribute("hidden", !isLoggedIn);
  topbarUserEmail.textContent = userEmail;

  if (!isLoggedIn) {
    allTasks = [];
    allProjects = [];
    cancelTaskEditing();
    cancelProjectEditing();
    activeTaskFilter = "all";
    activeProjectFilter = "all";
    visibleProjectsCount = 5;
    setActiveFilterButton(activeTaskFilter);
    setActiveProjectFilterButton(activeProjectFilter);
    tasksList.innerHTML = "";
    tasksList.setAttribute("hidden", true);
    tasksEmptyState.setAttribute("hidden", true);
    projectsList.innerHTML = "";
    projectsList.setAttribute("hidden", true);
    projectsPagination.setAttribute("hidden", true);
    projectsEmptyState.setAttribute("hidden", true);
    projectsMessage.setAttribute("hidden", true);
    populateTaskProjectOptions();
    projectsCount.textContent = "0";
    projectsCountLabel.textContent = "items";
    taskCount.textContent = "0";
    taskCountLabel.textContent = "items";
    updatePomodoroCurrentTask();
  }
}

function clearAuthInputs() {
  authEmailInput.value = "";
  authPasswordInput.value = "";
}

function showAuthMessage(type, title, text) {
  authMessage.hidden = false;
  authMessage.classList.remove(
    "auth-message-success",
    "auth-message-error",
    "auth-message-neutral",
  );
  authMessage.classList.add(`auth-message-${type}`);
  authMessageTitle.textContent = title;
  authMessageText.textContent = text;
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filterValue = button.dataset.state;

    activeTaskFilter = filterValue;
    setActiveFilterButton(filterValue);
    applyTaskFilter(filterValue);
  });
});

projectFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filterValue = button.dataset.projectStatus;

    activeProjectFilter = filterValue;
    visibleProjectsCount = 5;
    setActiveProjectFilterButton(filterValue);
    applyProjectFilter(filterValue);
  });
});

function applyTaskFilter(filterValue) {
  const tasks = getFilteredTasks(filterValue);

  updateCounter(tasks, taskCount, taskCountLabel);
  renderTasks(tasks);
}

function getFilteredTasks(filterValue) {
  if (filterValue === "all") {
    return allTasks;
  }

  return allTasks.filter((task) => {
    return normalizeTaskStatus(task.status) === filterValue;
  });
}

function updatePomodoroCurrentTask() {
  if (!pomodoroCurrentTask || !pomodoroCurrentTaskLabel || !pomodoroCurrentTaskText) {
    return;
  }

  if (!isLoggedIn || currentPomodoroMode !== "focus") {
    pomodoroCurrentTask.setAttribute("hidden", true);
    pomodoroCurrentTaskText.textContent = "";
    return;
  }

  const inProgressTasks = allTasks.filter((task) => {
    return normalizeTaskStatus(task.status) === "in_progress";
  });

  pomodoroCurrentTask.removeAttribute("hidden");

  if (inProgressTasks.length === 0) {
    pomodoroCurrentTaskLabel.textContent = "Current task";
    pomodoroCurrentTaskText.textContent = "No task in progress right now.";
    return;
  }

  pomodoroCurrentTaskLabel.textContent =
    inProgressTasks.length === 1 ? "Current task" : "Current tasks";
  pomodoroCurrentTaskText.textContent = formatPomodoroCurrentTaskText(inProgressTasks);
}

function formatPomodoroCurrentTaskText(tasks) {
  const visibleTaskSummaries = tasks.slice(0, 2).map((task) => {
    return getPomodoroTaskSummary(task);
  });
  const hiddenTasksCount = tasks.length - visibleTaskSummaries.length;
  const summaryText = visibleTaskSummaries.join(" • ");

  if (hiddenTasksCount <= 0) {
    return summaryText;
  }

  return `${summaryText} +${hiddenTasksCount} more`;
}

function getPomodoroTaskSummary(task) {
  const projectName = getTaskProjectName(task);

  if (!projectName) {
    return task.title;
  }

  return `${task.title} (${projectName})`;
}

function getTaskStatusLabel(status) {
  const normalizedStatus = normalizeTaskStatus(status);

  if (normalizedStatus === "todo") {
    return "To do";
  }

  if (normalizedStatus === "in_progress") {
    return "In Progress";
  }

  if (normalizedStatus === "done") {
    return "Done";
  }

  return formatTaskStatusLabel(normalizedStatus);
}

function setActiveFilterButton(filterValue) {
  filterButtons.forEach((button) => {
    const isActive = button.dataset.state === filterValue;
    button.classList.toggle("chip-active", isActive);
  });
}

function syncTaskFormCardVisibility() {
  const shouldHideTaskFormCard = !isLoggedIn || isPomodoroRunning;

  taskFormCard.toggleAttribute("hidden", shouldHideTaskFormCard);
}

function encodeTaskTitle(title) {
  return window.encodeURIComponent(title);
}

function decodeTaskTitle(title) {
  return window.decodeURIComponent(title || "");
}

function encodeProjectValue(value) {
  return window.encodeURIComponent(value || "");
}

function decodeProjectValue(value) {
  return window.decodeURIComponent(value || "");
}

function getNotionProjectsEndpoint() {
  return import.meta.env.DEV ? "/__server/notion-projects" : "/api/notion-projects";
}

async function readNotionProjects() {
  const { data, error } = await getCurrentSession();

  if (error) {
    throw error;
  }

  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("You need to be signed in to pull Notion projects.");
  }

  const notionProjectsEndpoint = getNotionProjectsEndpoint();

  const response = await fetch(notionProjectsEndpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!payload) {
    const error = new Error("Projects sync returned an invalid server response.");
    error.debug = [
      `Endpoint used: ${notionProjectsEndpoint}`,
      "The response was not valid JSON.",
    ];
    throw error;
  }

  if (!response.ok) {
    throw new Error(payload?.error || "Failed to pull Notion projects.");
  }

  return {
    projects: payload?.projects || [],
  };
}

async function updateProjectInNotion(projectId, projectData) {
  const { data, error } = await getCurrentSession();

  if (error) {
    throw error;
  }

  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("You need to be signed in to update Notion projects.");
  }

  const response = await fetch(getNotionProjectsEndpoint(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pageId: projectId,
      ...projectData,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!payload) {
    throw new Error("Projects update returned an invalid server response.");
  }

  if (!response.ok) {
    throw new Error(payload?.error || "Failed to update the Notion project.");
  }

  return payload.project;
}

async function readProjects() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function loadProjectsFromSupabase() {
  try {
    const projects = await readProjects();
    allProjects = projects;
    populateTaskProjectOptions();

    if (
      editingProjectId &&
      !allProjects.some((project) => (project.notion_page_id || project.id) === editingProjectId)
    ) {
      cancelProjectEditing();
    }

    applyProjectFilter(activeProjectFilter);
    applyTaskFilter(activeTaskFilter);
  } catch (error) {
    console.error(error);
    allProjects = [];
    populateTaskProjectOptions();
    applyProjectFilter(activeProjectFilter);
    showProjectsMessage(
      "error",
      error.message || "Failed to load projects from Supabase.",
    );
  }
}

async function syncProjectsFromNotion(isManualSync) {
  if (!isLoggedIn) {
    return;
  }

  setProjectsLoadingState(true);

  if (isManualSync) {
    showProjectsMessage("neutral", "Pulling projects from Notion...");
  }

  try {
    const { projects } = await readNotionProjects();

    await saveProjectsToSupabase(projects);
    await loadProjectsFromSupabase();

    if (projects.length === 0) {
      showProjectsMessage("neutral", "No matching Notion projects were found.");
      return;
    }

    hideProjectsMessage();
  } catch (error) {
    console.error(error);
    showProjectsMessage(
      "error",
      error.message || "Failed to sync projects from Notion.",
    );
  } finally {
    setProjectsLoadingState(false);
  }
}

async function saveProjectsToSupabase(projects, options = {}) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const shouldRemoveMissingProjects = options.removeMissingProjects ?? true;

  if (!user) {
    throw new Error("You need to be signed in to save projects.");
  }

  const syncedAt = new Date().toISOString();
  const projectRows = projects.map((project) => {
    return {
      user_id: user.id,
      notion_page_id: project.id,
      name: project.name,
      status: project.status,
      priority: project.priority || null,
      source: "notion",
      last_synced_at: syncedAt,
      updated_at: syncedAt,
    };
  });

  if (projectRows.length > 0) {
    const { error } = await supabase.from("projects").upsert(projectRows, {
      onConflict: "user_id,notion_page_id",
    });

    if (error) {
      throw error;
    }
  }

  if (shouldRemoveMissingProjects) {
    await deleteRemovedProjects(
      user.id,
      projectRows.map((project) => project.notion_page_id),
    );
  }
}

async function deleteRemovedProjects(userId, notionProjectIds) {
  let deleteQuery = supabase
    .from("projects")
    .delete()
    .eq("user_id", userId)
    .eq("source", "notion");

  if (notionProjectIds.length > 0) {
    const escapedProjectIds = notionProjectIds.map((projectId) => {
      return `"${String(projectId).replaceAll('"', '\\"')}"`;
    });

    deleteQuery = deleteQuery.not(
      "notion_page_id",
      "in",
      `(${escapedProjectIds.join(",")})`,
    );
  }

  const { error } = await deleteQuery;

  if (error) {
    throw error;
  }
}

function renderProjects(projects) {
  projectsList.innerHTML = "";

  if (projects.length === 0) {
    projectsList.setAttribute("hidden", true);
    projectsEmptyState.removeAttribute("hidden");
    return;
  }

  projectsList.removeAttribute("hidden");
  projectsEmptyState.setAttribute("hidden", true);
  projectsEmptyState.hidden = true;

  projects.forEach((project) => {
    const projectId = project.notion_page_id || project.id;

    projectsList.innerHTML +=
      editingProjectId === projectId
        ? renderProjectEditItem(project)
        : renderProjectItem(project);
  });
}

function renderProjectItem(project) {
  const projectId = project.notion_page_id || project.id;
  const statusTone = getProjectStatusTone(project.status);
  const priorityTone = getProjectPriorityTone(project.priority);
  const safeProjectName = escapeHtml(project.name);
  const safeProjectStatus = escapeHtml(project.status);
  const safeProjectPriority = escapeHtml(project.priority || "");
  const projectPriorityMarkup = project.priority
    ? `
        <span class="project-priority project-priority-${priorityTone}">
          ${safeProjectPriority}
        </span>
      `
    : "";
  const projectMetaMarkup = projectPriorityMarkup
    ? `
        <div class="project-item-meta">
          ${projectPriorityMarkup}
        </div>
      `
    : "";

  return `
    <li class="project-item">
      <div class="project-item-main">
        <p class="project-item-title">${safeProjectName}</p>
        ${projectMetaMarkup}
      </div>
      <div class="project-item-actions">
        <span class="project-status project-status-${statusTone}">${safeProjectStatus}</span>
        <button
          type="button"
          class="project-next-status-button"
          data-id="${projectId}"
          data-status="${encodeProjectValue(project.status)}"
          aria-label="Next project status"
          title="Next project status"
        >
          <svg
            class="project-next-status-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M5 11h10.17l-3.58-3.59L13 6l6 6-6 6-1.41-1.41L15.17 13H5z"
              fill="currentColor"
            ></path>
          </svg>
        </button>
        <button
          type="button"
          class="project-edit-button"
          data-id="${projectId}"
          data-name="${encodeProjectValue(project.name)}"
          data-status="${encodeProjectValue(project.status)}"
          data-priority="${encodeProjectValue(project.priority || "")}"
          aria-label="Edit project"
          title="Edit project"
        >
          <svg
            class="project-edit-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"
              fill="currentColor"
            ></path>
            <path
              d="M20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.84 1.84 3.75 3.75z"
              fill="currentColor"
            ></path>
          </svg>
        </button>
      </div>
    </li>
  `;
}

function renderProjectEditItem(project) {
  const projectId = project.notion_page_id || project.id;
  const isSavingProject = savingProjectId === projectId;
  const disabledAttribute = isSavingProject ? " disabled" : "";
  const statusOptionsMarkup = buildProjectOptionsMarkup(
    PROJECT_STATUS_OPTIONS,
    editingProjectValues.status,
  );
  const priorityOptionsMarkup = buildProjectPriorityOptionsMarkup(
    editingProjectValues.priority,
  );

  return `
    <li class="project-item project-item-editing">
      <div class="inline-edit-state-row">
        <span class="inline-edit-state-badge">Editing project</span>
      </div>
      <div class="project-item-main project-item-main-editing">
        <div class="inline-edit-grid">
          <label class="field inline-edit-field inline-edit-field-wide">
            <span class="field-label">Project name</span>
            <input
              type="text"
              class="project-inline-edit-name-input inline-edit-input"
              data-id="${projectId}"
              value="${escapeHtml(editingProjectValues.name)}"
              ${disabledAttribute}
            />
          </label>

          <label class="field inline-edit-field">
            <span class="field-label">Status</span>
            <select
              class="project-inline-edit-status-select inline-edit-select"
              data-id="${projectId}"
              ${disabledAttribute}
            >
              ${statusOptionsMarkup}
            </select>
          </label>

          <label class="field inline-edit-field">
            <span class="field-label">Priority</span>
            <select
              class="project-inline-edit-priority-select inline-edit-select"
              data-id="${projectId}"
              ${disabledAttribute}
            >
              ${priorityOptionsMarkup}
            </select>
          </label>
        </div>
      </div>

      <div class="project-item-actions project-item-actions-editing">
        <button
          type="button"
          class="project-inline-save-button"
          data-id="${projectId}"
          aria-label="Save project changes"
          title="Save project changes"
          ${disabledAttribute}
        >
          <svg
            class="project-inline-save-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M20 6 9 17l-5-5"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
            ></path>
          </svg>
        </button>
        <button
          type="button"
          class="project-inline-cancel-button"
          aria-label="Cancel project changes"
          title="Cancel project changes"
          ${disabledAttribute}
        >
          <svg
            class="project-inline-cancel-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M6 6l12 12M18 6 6 18"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="2.5"
            ></path>
          </svg>
        </button>
      </div>
    </li>
  `;
}

function getProjectStatusTone(status) {
  const normalizedStatus = normalizeProjectStatus(status);

  if (normalizedStatus === "done") {
    return "done";
  }

  if (normalizedStatus === "in progress") {
    return "in-progress";
  }

  if (normalizedStatus === "question") {
    return "question";
  }

  if (normalizedStatus === "ready to start") {
    return "ready";
  }

  return "neutral";
}

function getProjectPriorityTone(priority) {
  const normalizedPriority = normalizeProjectPriority(priority);

  if (normalizedPriority === "urgent") {
    return "urgent";
  }

  if (normalizedPriority === "high") {
    return "high";
  }

  if (normalizedPriority === "medium") {
    return "medium";
  }

  if (normalizedPriority === "low") {
    return "low";
  }

  return "neutral";
}

function applyProjectFilter(filterValue) {
  const projects = getSortedProjects(getFilteredProjects(filterValue));
  const visibleProjects = projects.slice(0, visibleProjectsCount);

  updateCounter(projects, projectsCount, projectsCountLabel);
  renderProjects(visibleProjects);
  renderProjectsPagination(projects.length);
}

function getFilteredProjects(filterValue) {
  if (filterValue === "all") {
    return allProjects;
  }

  return allProjects.filter((project) => {
    return normalizeProjectStatus(project.status) === filterValue;
  });
}

function getSortedProjects(projects) {
  return [...projects].sort((firstProject, secondProject) => {
    const priorityOrderDifference =
      getProjectPriorityOrder(firstProject.priority) -
      getProjectPriorityOrder(secondProject.priority);

    if (priorityOrderDifference !== 0) {
      return priorityOrderDifference;
    }

    return String(firstProject.name || "").localeCompare(
      String(secondProject.name || ""),
    );
  });
}

function getProjectPriorityOrder(priority) {
  const normalizedPriority = normalizeProjectPriority(priority);

  if (normalizedPriority === "urgent") {
    return 0;
  }

  if (normalizedPriority === "high") {
    return 1;
  }

  if (normalizedPriority === "medium") {
    return 2;
  }

  if (normalizedPriority === "low") {
    return 3;
  }

  return 4;
}

function buildProjectOptionsMarkup(options, selectedValue) {
  return options
    .map((option) => {
      const isSelected = option === selectedValue ? " selected" : "";
      return `<option value="${escapeHtml(option)}"${isSelected}>${escapeHtml(option)}</option>`;
    })
    .join("");
}

function buildProjectPriorityOptionsMarkup(selectedValue) {
  const emptyOptionSelected = selectedValue ? "" : " selected";
  const emptyOptionMarkup = `<option value=""${emptyOptionSelected}>No priority</option>`;

  return `${emptyOptionMarkup}${buildProjectOptionsMarkup(
    PROJECT_PRIORITY_OPTIONS,
    selectedValue,
  )}`;
}

function buildTaskProjectOptionsMarkup(selectedProjectId) {
  const placeholderSelected = selectedProjectId ? "" : " selected";
  const placeholderOption = `<option value="" disabled${placeholderSelected}>Choose a project</option>`;
  const projectOptions = getSortedProjects(allProjects)
    .map((project) => {
      const projectId = project.notion_page_id || project.id;
      const isSelected = projectId === selectedProjectId ? " selected" : "";
      const safeProjectId = escapeHtml(projectId);
      const safeProjectName = escapeHtml(project.name);

      return `<option value="${safeProjectId}"${isSelected}>${safeProjectName}</option>`;
    })
    .join("");

  return `${placeholderOption}${projectOptions}`;
}

function populateTaskProjectOptions() {
  if (!taskProjectSelect) {
    return;
  }

  const hasProjects = allProjects.length > 0;

  taskProjectSelect.innerHTML = buildTaskProjectOptionsMarkup("");
  taskProjectSelect.disabled = !hasProjects;
  taskProjectSelect.required = hasProjects;

  if (!hasProjects) {
    taskProjectSelect.innerHTML = `<option value="">Sync projects first</option>`;
    taskProjectSelect.value = "";
  }
}

function getTaskProjectName(task) {
  const projectId = task.project_notion_page_id || "";

  if (!projectId) {
    return "";
  }

  const matchingProject = allProjects.find((project) => {
    return (project.notion_page_id || project.id) === projectId;
  });

  return matchingProject?.name || "";
}

function focusInlineEditField(selector) {
  window.requestAnimationFrame(() => {
    const input = document.querySelector(selector);
    input?.focus();
    input?.select?.();
  });
}

function resolveProjectStatus(status) {
  return resolveProjectOption(status, PROJECT_STATUS_OPTIONS);
}

function resolveProjectPriority(priority) {
  if (!String(priority || "").trim()) {
    return "";
  }

  return resolveProjectOption(priority, PROJECT_PRIORITY_OPTIONS) || null;
}

function resolveProjectOption(value, options) {
  const normalizedValue = String(value || "").trim().toLowerCase();

  return options.find((option) => option.toLowerCase() === normalizedValue) || "";
}

function getNextProjectStatus(currentStatus) {
  const normalizedStatus = resolveProjectStatus(currentStatus) || PROJECT_STATUS_OPTIONS[0];
  const currentIndex = PROJECT_STATUS_OPTIONS.indexOf(normalizedStatus);
  const nextIndex = (currentIndex + 1) % PROJECT_STATUS_OPTIONS.length;

  return PROJECT_STATUS_OPTIONS[nextIndex];
}

function setActiveProjectFilterButton(filterValue) {
  projectFilterButtons.forEach((button) => {
    const isActive = button.dataset.projectStatus === filterValue;
    button.classList.toggle("chip-active", isActive);
  });
}

function showProjectsMessage(type, text) {
  projectsMessage.hidden = false;
  projectsMessage.classList.remove(
    "projects-message-error",
    "projects-message-neutral",
  );
  projectsMessage.classList.add(`projects-message-${type}`);
  projectsMessageText.textContent = text;
}

function setProjectsLoadingState(isLoading) {
  if (!projectsSyncButton) {
    return;
  }

  projectsSyncButton.disabled = isLoading;
  projectsSyncButton.textContent = isLoading ? "Syncing..." : "Sync Notion";
}

function hideProjectsMessage() {
  projectsMessage.setAttribute("hidden", true);
}

function renderProjectsPagination(totalProjectsCount) {
  if (!projectsPagination || !projectsLoadMoreButton) {
    return;
  }

  const hasMoreProjects = totalProjectsCount > visibleProjectsCount;

  projectsPagination.toggleAttribute("hidden", !hasMoreProjects);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeProjectStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function normalizeProjectPriority(priority) {
  return String(priority || "").trim().toLowerCase();
}

function normalizeTaskStatus(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedStatus === "to do" || normalizedStatus === "todo") {
    return "todo";
  }

  if (normalizedStatus === "in progress" || normalizedStatus === "in_progress") {
    return "in_progress";
  }

  if (normalizedStatus === "done") {
    return "done";
  }

  return normalizedStatus;
}

function getTaskIdValue(taskId) {
  return String(taskId || "");
}
