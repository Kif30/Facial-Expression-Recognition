// app_fixed.js — final, compatible, defensive code
// Place this file in the same folder as index.html and style.css.

const video = document.getElementById("video");
const statusText = document.getElementById("status");
const debugText = document.getElementById("debug");

function setStatus(t) { statusText.innerText = t; }
function setDebug(t) { if (debugText) debugText.innerText = t; }

// Quick sanity log for faceapi global object
console.log("faceapi object present:", typeof window.faceapi !== "undefined");

// Verify that the model manifests are reachable before attempting to load
async function verifyManifest(filename) {
  try {
    const res = await fetch(`/models/${filename}`, { cache: "no-store" });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function loadModels() {
  setStatus("Checking model files…");

  const manifests = [
    "tiny_face_detector_model-weights_manifest.json",
    "face_expression_model-weights_manifest.json",
    "face_landmark_68_model-weights_manifest.json"
  ];

  for (const m of manifests) {
    const ok = await verifyManifest(m);
    if (!ok) {
      const msg = `Missing model file: /models/${m}`;
      console.error(msg);
      setStatus("Model files missing. Check /models folder.");
      throw new Error(msg);
    }
  }

  setStatus("Loading models…");
  try {
    // load sequentially so errors are clearer
    await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
    await faceapi.nets.faceExpressionNet.loadFromUri("/models");
    await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
    setStatus("Models loaded");
    console.log("Models loaded");
  } catch (err) {
    console.error("MODEL LOAD ERROR:", err);
    setStatus("Model loading failed. See console.");
    throw err;
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    // wait for metadata (dimensions) — fallback timeout to avoid infinite wait
    await new Promise(resolve => {
      if (video.readyState >= 1) return resolve();
      let resolved = false;
      video.onloadedmetadata = () => { if (!resolved) { resolved = true; resolve(); } };
      setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 3000);
    });

    await video.play();

    setStatus("Camera active. Starting detection…");
    setDebug(`face-api present: ${typeof faceapi !== "undefined" ? "yes" : "no"}`);
    detectLoop();
  } catch (err) {
    console.error("CAMERA ERROR:", err);
    setStatus("Camera access denied or unavailable.");
    throw err;
  }
}

function topExpressionFrom(expressions) {
  return Object.entries(expressions).sort((a, b) => b[1] - a[1])[0]; // [expr, conf]
}

function displayExpression(expr, conf) {
  const label = expr ? expr.toUpperCase() : "NEUTRAL";
  setStatus(`${label} (${Math.round(conf * 100)}%)`);
}

function detectLoop() {
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 160,
    scoreThreshold: 0.3
  });

  async function frame() {
    try {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        const res = await faceapi
          .detectSingleFace(video, options)
          .withFaceExpressions();

        if (!res) {
          setStatus("No face");
        } else if (!res.expressions) {
          setStatus("No expressions");
        } else {
          const [expr, conf] = topExpressionFrom(res.expressions);
          if (conf && conf >= 0.35) {
            displayExpression(expr, conf);
          } else {
            setStatus("Expression unclear");
          }
        }
      } else {
        setStatus("Camera active. Waiting for frames...");
      }
    } catch (err) {
      console.error("DETECTION ERROR:", err);
      setDebug(`Detection error: ${err.message || err}`);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// Init
(async function init() {
  try {
    await loadModels();
    await startCamera();
  } catch (err) {
    console.error("INIT ERROR:", err);
  }
})();
