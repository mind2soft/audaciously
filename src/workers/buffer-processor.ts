declare var self: ServiceWorkerGlobalScope;

export default null;

self.addEventListener("message", (e) => {
  const data = e.data;

  console.log("Worker message", data);

  postMessage({ response: "OK" });
});
