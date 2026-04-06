export function clearInput(input) {
  input.value = "";
}

export function formatTaskDate(dateString) {
  const date = new Date(dateString);

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function updateCounter(tasks, taskCountElement, taskCountLabelElement) {
  const counterValue = tasks.length;

  taskCountElement.textContent = String(counterValue);

  if (taskCountLabelElement) {
    taskCountLabelElement.textContent = counterValue === 1 ? "item" : "items";
  }
}

export function formatTaskStatusLabel(status) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
