let loaderElement = null;

function createLoader() {
  if (loaderElement) return loaderElement;

  // Use loader already placed in HTML
  loaderElement = document.getElementById("appLoader");

  if (loaderElement) {
    return loaderElement;
  }

  // Fallback loader
  loaderElement = document.createElement("div");

  loaderElement.id = "appLoader";

  loaderElement.className = `
    fixed inset-0 z-[9999]
    flex items-center justify-center
    bg-white
    transition-opacity duration-500
  `;

  loaderElement.innerHTML = `
    <div class="flex flex-col items-center">

      <div class="mb-6 animate-pulse">
        <img
          src="/images/qclogo2.png"
          alt="QC Bus"
          class="h-20 w-20 object-contain"
        />
      </div>

      <h1 class="text-xl font-bold tracking-tight text-qc-blue">
        QC Bus
      </h1>

      <p class="mt-2 text-sm text-gray-500">
        Loading
        <span class="inline-flex ml-1">
          <span class="animate-bounce [animation-delay:0ms]">.</span>
          <span class="animate-bounce [animation-delay:150ms]">.</span>
          <span class="animate-bounce [animation-delay:300ms]">.</span>
        </span>
      </p>

      <div class="mt-5 h-1 w-32 overflow-hidden rounded-full bg-gray-100">
        <div
          class="h-full w-1/2 rounded-full bg-qc-blue animate-pulse"
        ></div>
      </div>

    </div>
  `;

  document.body.appendChild(loaderElement);

  return loaderElement;
}

function showLoading() {
  const loader = createLoader();

  if (!loader) return;

  loader.classList.remove(
    "opacity-0",
    "pointer-events-none"
  );

  loader.classList.add("opacity-100");
}

function hideLoading() {
  if (!loaderElement) {
    loaderElement = document.getElementById("appLoader");
  }

  if (!loaderElement) return;

  loaderElement.classList.remove("opacity-100");

  loaderElement.classList.add(
    "opacity-0",
    "pointer-events-none"
  );

  setTimeout(() => {
    if (loaderElement) {
      loaderElement.remove();
      loaderElement = null;
    }
  }, 500);
}

window.showLoading = showLoading;
window.hideLoading = hideLoading;