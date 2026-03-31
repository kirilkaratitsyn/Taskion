import { supabase } from "./supabase.js";
import {
  clearInput,
  formatTaskDate,
  formatTaskStatusLabel,
  updateCounter,
} from "./helpers/task-helpers.js";

const taskForm = document.querySelector(".task-form");
const taskInput = document.querySelector(".task-input");
const tasksList = document.querySelector(".tasks-list");
const emptyState = document.querySelector(".empty-state");
const taskCount = document.querySelector(".task-count");
const TASK_STATUSES = ["todo", "in_progress", "done"];
const filterButtons = document.querySelectorAll(".chip");
let allTasks = [];

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

document.addEventListener("DOMContentLoaded", async function () {
  await initTasks();
});

async function createTask(title) {
  if (!title) {
    return;
  }
  await supabase.from("tasks").insert([
    {
      title: title,
      status: TASK_STATUSES[0],
    },
  ]);
}

async function readTasks() {
  const { data } = await supabase.from("tasks").select("*");

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
                      <time class="task-created-at" datetime="2026-03-31">${createdAt}</time>
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
