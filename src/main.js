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
const tasksList = document.querySelector(".tasks-list");
const emptyState = document.querySelector(".empty-state");
const taskCount = document.querySelector(".task-count");
const taskFormCard = document.querySelector(".card-form");
const tasksCard = document.querySelector(".card-tasks");
const authCard = document.querySelector(".card-auth");
const TASK_STATUSES = ["todo", "in_progress", "done"];
const filterButtons = document.querySelectorAll(".chip");
const authEmailInput = document.querySelector(".auth-email-input");
const authPasswordInput = document.querySelector(".auth-password-input");
const authSignUpButton = document.querySelector(".auth-sign-up-button");
const authSignInButton = document.querySelector(".auth-sign-in-button");
const authSignOutButton = document.querySelector(".topbar-sign-out-button");
const topbarUserInfo = document.querySelector(".topbar-user-info");
const topbarUserEmail = document.querySelector(".topbar-user-email");

let allTasks = [];

authSignUpButton.addEventListener("click", async () => {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();

  const { error } = await signUp(email, password);

  if (error) {
    console.error(error);
    return;
  }

  console.log("User signed up");
  await refreshSessionUI();
});

authSignInButton.addEventListener("click", async () => {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();

  const { error } = await signIn(email, password);

  if (error) {
    console.error(error);
    return;
  }

  console.log("User signed in");
  await refreshSessionUI();
});

authSignOutButton.addEventListener("click", async () => {
  const { error } = await signOut();

  if (error) {
    console.error(error);
    return;
  }

  console.log("User signed out");
  clearAuthInputs();
  updateAuthUI(null);
});

document.addEventListener("DOMContentLoaded", async function () {
  await refreshSessionUI();
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  await createTask(title);
  clearInput(taskInput);
  await initTasks();
});

tasksList.addEventListener("click", async (event) => {
  const buttonNext = event.target.closest(".task-next-status-button");
  const buttonDelete = event.target.closest(".task-delete-button");
  if (buttonNext) {
    const taskId = buttonNext.dataset.id;
    const currentStatus = buttonNext.dataset.status;

    await updateTask(taskId, currentStatus);
    await initTasks();
  }

  if (buttonDelete) {
    const taskId = buttonDelete.dataset.id;

    await deleteTask(taskId);
    await initTasks();
  }
});

async function createTask(title) {
  if (!title) {
    return;
  }
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  await supabase.from("tasks").insert([
    {
      title: title,
      status: TASK_STATUSES[0],
      user_id: user.id,
    },
  ]);
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
  const currentIndex = TASK_STATUSES.indexOf(currentStatus);
  const nextIndex = (currentIndex + 1) % TASK_STATUSES.length;
  const nextStatus = TASK_STATUSES[nextIndex];

  await supabase.from("tasks").update({ status: nextStatus }).eq("id", taskId);
}

async function deleteTask(taskId) {
  await supabase.from("tasks").delete().eq("id", taskId);
}

function renderTasks(tasks) {
  tasksList.innerHTML = "";

  if (tasks.length !== 0) {
    tasksList.removeAttribute("hidden");
    emptyState.setAttribute("hidden", true);

    tasks.forEach((task) => {
      const createdAt = formatTaskDate(task.created_at);
      const taskStatus = task.status;
      const statusLabel = formatTaskStatusLabel(taskStatus);
      tasksList.innerHTML += `

      <li class="task-item">
                  <div class="task-item-main">
                    <p class="task-item-title">${task.title}</p>
                    <div class="task-item-meta">
                      <span class="task-status task-status-${taskStatus}">${statusLabel}</span>
                      <time class="task-created-at" datetime="${task.created_at}">${createdAt}</time>
                    </div>
                  </div>

                  <div class="task-item-actions">
                    <button type="button" class="task-next-status-button"  data-id="${task.id}"  data-status="${task.status}">Next status</button>
                    
                    <button type="button" class="task-delete-button"  data-id="${task.id}"
>Delete</button>
                  </div>
                </li>
    `;
    });
  } else {
    tasksList.setAttribute("hidden", true);
    emptyState.removeAttribute("hidden");
  }
}

async function initTasks() {
  const tasks = await readTasks();
  allTasks = tasks;
  updateCounter(tasks, taskCount);
  renderTasks(tasks);
}

async function refreshSessionUI() {
  const { data, error } = await getCurrentSession();

  if (error) {
    console.error(error);
    return;
  }

  const session = data.session;
  console.log("Current session:", session);
  updateAuthUI(session);

  if (session) {
    await initTasks();
  }
}

function updateAuthUI(session) {
  const isLoggedIn = Boolean(session);
  const userEmail = session?.user?.email || "";

  taskFormCard.toggleAttribute("hidden", !isLoggedIn);
  tasksCard.toggleAttribute("hidden", !isLoggedIn);
  authCard.toggleAttribute("hidden", isLoggedIn);

  authSignUpButton.toggleAttribute("hidden", isLoggedIn);
  authSignInButton.toggleAttribute("hidden", isLoggedIn);
  authSignOutButton.toggleAttribute("hidden", !isLoggedIn);
  topbarUserInfo.toggleAttribute("hidden", !isLoggedIn);
  topbarUserEmail.textContent = userEmail;

  if (!isLoggedIn) {
    allTasks = [];
    tasksList.innerHTML = "";
    tasksList.setAttribute("hidden", true);
    emptyState.setAttribute("hidden", true);
    taskCount.textContent = "0";
  }
}

function clearAuthInputs() {
  authEmailInput.value = "";
  authPasswordInput.value = "";
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((item) => {
      item.classList.remove("chip-active");
    });

    button.classList.add("chip-active");
    const filterValue = button.dataset.state;

    if (filterValue === "all") {
      renderTasks(allTasks);
      return;
    }

    const filteredTasks = allTasks.filter(
      (task) => task.status === filterValue,
    );
    renderTasks(filteredTasks);
  });
});
