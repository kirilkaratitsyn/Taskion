const pomodoroCard = document.querySelector(".card-pomodoro");
const pomodoroModeButtons = document.querySelectorAll(".pomodoro-mode-button");
const pomodoroDurationInputs = document.querySelectorAll(".pomodoro-duration-input");
const pomodoroDurationGrid = document.querySelector(".pomodoro-duration-grid");
const pomodoroLabel = document.querySelector(".pomodoro-label");
const pomodoroTime = document.querySelector(".pomodoro-time");
const pomodoroPrimaryButton = document.querySelector(".pomodoro-primary-button");
const pomodoroResetButton = document.querySelector(".pomodoro-reset-button");
const pomodoroSettingsButton = document.querySelector(".pomodoro-settings-button");
const pomodoroSessionsValue = document.querySelector(".pomodoro-sessions-value");
const pomodoroTodayValue = document.querySelector(".pomodoro-today-value");
const initialPomodoroModeButton = document.querySelector(
  ".pomodoro-mode-button.chip-active",
);
const initialPomodoroMinutes = Number(initialPomodoroModeButton?.dataset.minutes || 25);
const initialPomodoroMode = initialPomodoroModeButton?.dataset.mode || "focus";
const initialPomodoroLabel =
  initialPomodoroModeButton?.dataset.label || pomodoroLabel?.dataset.label || "Focus Session";

const pomodoroState = {
  mode: initialPomodoroMode,
  label: initialPomodoroLabel,
  minutes: initialPomodoroMinutes,
  initialSeconds: initialPomodoroMinutes * 60,
  secondsLeft: initialPomodoroMinutes * 60,
  intervalId: null,
  isRunning: false,
  isFinished: false,
  sessionsCompleted: 0,
  totalFocusSeconds: 0,
  audioContext: null,
  oscillator: null,
  gainNode: null,
  isSettingsOpen: false,
  durations: {
    focus: getPomodoroMinutesFromButton("focus", 25),
    short_break: getPomodoroMinutesFromButton("short_break", 5),
    long_break: getPomodoroMinutesFromButton("long_break", 30),
  },
};

if (
  pomodoroCard &&
  pomodoroModeButtons.length &&
  pomodoroLabel &&
  pomodoroTime &&
  pomodoroPrimaryButton &&
  pomodoroResetButton &&
  pomodoroDurationGrid &&
  pomodoroSettingsButton
) {
  pomodoroModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (pomodoroState.isRunning) {
        return;
      }

      setPomodoroMode(button);
    });
  });

  pomodoroDurationInputs.forEach((input) => {
    input.addEventListener("change", () => {
      updatePomodoroDuration(input);
    });
  });

  pomodoroPrimaryButton.addEventListener("click", () => {
    handlePrimaryTimerAction();
  });

  pomodoroSettingsButton.addEventListener("click", () => {
    togglePomodoroSettings();
  });

  pomodoroResetButton.addEventListener("click", () => {
    resetPomodoro();
  });

  renderPomodoro();
}

function setPomodoroMode(button) {
  const nextMode = button.dataset.mode;
  const nextLabel = button.dataset.label;
  const nextMinutes = Number(button.dataset.minutes);

  clearInterval(pomodoroState.intervalId);

  pomodoroState.mode = nextMode;
  pomodoroState.label = nextLabel;
  pomodoroState.minutes = nextMinutes;
  pomodoroState.initialSeconds = nextMinutes * 60;
  pomodoroState.secondsLeft = nextMinutes * 60;
  pomodoroState.intervalId = null;
  pomodoroState.isRunning = false;
  pomodoroState.isFinished = false;

  renderPomodoro();
}

function updatePomodoroDuration(input) {
  const nextMode = input.dataset.mode;
  const nextMinutes = getValidPomodoroMinutes(input.value);
  const nextModeButton = document.querySelector(
    `.pomodoro-mode-button[data-mode="${nextMode}"]`,
  );

  input.value = String(nextMinutes);
  pomodoroState.durations[nextMode] = nextMinutes;

  if (nextModeButton) {
    nextModeButton.dataset.minutes = String(nextMinutes);
  }

  if (pomodoroState.mode !== nextMode || pomodoroState.isRunning) {
    renderPomodoro();
    return;
  }

  pomodoroState.minutes = nextMinutes;
  pomodoroState.initialSeconds = nextMinutes * 60;
  pomodoroState.secondsLeft = nextMinutes * 60;
  pomodoroState.isFinished = false;

  renderPomodoro();
}

function handlePrimaryTimerAction() {
  if (pomodoroState.isFinished) {
    stopPomodoro();
    return;
  }

  if (pomodoroState.isRunning) {
    pausePomodoro();
    return;
  }

  startPomodoro();
}

function startPomodoro() {
  if (pomodoroState.isRunning) {
    return;
  }

  pomodoroState.isRunning = true;

  pomodoroState.intervalId = window.setInterval(() => {
    pomodoroState.secondsLeft -= 1;

    if (pomodoroState.mode === "focus") {
      pomodoroState.totalFocusSeconds += 1;
    }

    if (pomodoroState.secondsLeft <= 0) {
      clearInterval(pomodoroState.intervalId);
      pomodoroState.intervalId = null;
      pomodoroState.secondsLeft = 0;
      pomodoroState.isRunning = false;
      pomodoroState.isFinished = true;

      if (pomodoroState.mode === "focus") {
        pomodoroState.sessionsCompleted += 1;
      }

      playPomodoroSound();
    }

    renderPomodoro();
  }, 1000);

  renderPomodoro();
}

function pausePomodoro() {
  clearInterval(pomodoroState.intervalId);
  pomodoroState.intervalId = null;
  pomodoroState.isRunning = false;
  renderPomodoro();
}

function stopPomodoro() {
  clearInterval(pomodoroState.intervalId);
  pomodoroState.intervalId = null;
  pomodoroState.isRunning = false;
  pomodoroState.isFinished = false;
  pomodoroState.secondsLeft = pomodoroState.initialSeconds;
  stopPomodoroSound();
  renderPomodoro();
}

function resetPomodoro() {
  clearInterval(pomodoroState.intervalId);
  pomodoroState.intervalId = null;
  pomodoroState.isRunning = false;
  pomodoroState.isFinished = false;
  stopPomodoroSound();
  pomodoroState.secondsLeft = pomodoroState.initialSeconds;
  renderPomodoro();
}

function renderPomodoro() {
  pomodoroCard.classList.toggle("is-running", pomodoroState.isRunning);
  pomodoroCard.classList.toggle("is-finished", pomodoroState.isFinished);
  pomodoroCard.classList.toggle("is-settings-open", pomodoroState.isSettingsOpen);

  pomodoroLabel.textContent = pomodoroState.label;
  pomodoroTime.textContent = formatPomodoroTime(pomodoroState.secondsLeft);

  pomodoroPrimaryButton.textContent = getPrimaryButtonLabel();
  pomodoroPrimaryButton.dataset.state = getPrimaryButtonState();

  pomodoroModeButtons.forEach((button) => {
    const isActive = button.dataset.mode === pomodoroState.mode;
    button.classList.toggle("chip-active", isActive);
    button.disabled = pomodoroState.isRunning;
  });

  pomodoroSettingsButton.setAttribute(
    "aria-expanded",
    String(pomodoroState.isSettingsOpen),
  );
  pomodoroSettingsButton.disabled = pomodoroState.isRunning;
  pomodoroDurationGrid.hidden = !pomodoroState.isSettingsOpen;

  pomodoroDurationInputs.forEach((input) => {
    const inputMode = input.dataset.mode;
    const nextMinutes = pomodoroState.durations[inputMode];

    input.value = String(nextMinutes);
    input.disabled = pomodoroState.isRunning;
  });

  if (pomodoroSessionsValue) {
    pomodoroSessionsValue.textContent = String(pomodoroState.sessionsCompleted);
  }

  if (pomodoroTodayValue) {
    const minutesToday = Math.floor(pomodoroState.totalFocusSeconds / 60);
    pomodoroTodayValue.textContent = `${minutesToday}m`;
  }

  emitPomodoroStateChange();
}

function getPrimaryButtonLabel() {
  if (pomodoroState.isFinished) {
    return "Stop";
  }

  if (pomodoroState.isRunning) {
    return "Pause";
  }

  return "Start";
}

function getPrimaryButtonState() {
  if (pomodoroState.isFinished) {
    return "finished";
  }

  if (pomodoroState.isRunning) {
    return "running";
  }

  return "idle";
}

function formatPomodoroTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function playPomodoroSound() {
  stopPomodoroSound();

  const audioContext = new window.AudioContext();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.06;

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  pomodoroState.audioContext = audioContext;
  pomodoroState.oscillator = oscillator;
  pomodoroState.gainNode = gainNode;
}

function stopPomodoroSound() {
  if (pomodoroState.oscillator) {
    pomodoroState.oscillator.stop();
    pomodoroState.oscillator.disconnect();
    pomodoroState.oscillator = null;
  }

  if (pomodoroState.gainNode) {
    pomodoroState.gainNode.disconnect();
    pomodoroState.gainNode = null;
  }

  if (pomodoroState.audioContext) {
    pomodoroState.audioContext.close();
    pomodoroState.audioContext = null;
  }
}

function getPomodoroMinutesFromButton(mode, fallbackMinutes) {
  const button = document.querySelector(`.pomodoro-mode-button[data-mode="${mode}"]`);
  const buttonMinutes = Number(button?.dataset.minutes);

  return Number.isFinite(buttonMinutes) && buttonMinutes > 0
    ? buttonMinutes
    : fallbackMinutes;
}

function getValidPomodoroMinutes(value) {
  const minutes = Number(value);

  if (!Number.isFinite(minutes) || minutes < 1) {
    return 1;
  }

  return Math.floor(minutes);
}

function emitPomodoroStateChange() {
  document.dispatchEvent(
    new CustomEvent("pomodoro:state-change", {
      detail: {
        mode: pomodoroState.mode,
        isRunning: pomodoroState.isRunning,
        isFinished: pomodoroState.isFinished,
      },
    }),
  );
}

function togglePomodoroSettings() {
  if (pomodoroState.isRunning) {
    return;
  }

  pomodoroState.isSettingsOpen = !pomodoroState.isSettingsOpen;
  renderPomodoro();
}
