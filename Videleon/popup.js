'use strict';

// 外部モジュールからループコントローラーをインポート
import { LoopController } from './loop-controller.js';

// ===================================================
// DOM要素の取得
// ===================================================
const brightnessSlider = document.getElementById("brightness");
const brightnessValue = document.getElementById("brightnessValue");
const speedSlider = document.getElementById("speed");
const speedValue = document.getElementById("speedValue");
const volumeSlider = document.getElementById("volume");
const volumeValue = document.getElementById("volumeValue");
const voiceBoostSlider = document.getElementById("voiceBoost");
const voiceBoostValue = document.getElementById("voiceBoostValue");
const resetBtn = document.getElementById("resetBtn");
const rotateBtn = document.getElementById("rotateBtn");
const flipBtn = document.getElementById("flipBtn");
const setA_Btn = document.getElementById("setA_Btn");
const setB_Btn = document.getElementById("setB_Btn");
const clearLoop_Btn = document.getElementById("clearLoop_Btn");

// ===================================================
// 定数および状態変数
// ===================================================
const BRIGHTNESS_STYLE_ID = 'videleon-brightness-style-injector';
const TRANSFORM_STYLE_ID = 'videleon-transform-style-injector';
const DEFAULT_VALUES = {
  brightness: 100,
  speed: 1.0,
  volume: 100,
  voiceBoost: 0
};
let currentRotation = 0;
let isFlipped = false;

// ===================================================
// ヘルパー関数
// ===================================================
function execInTab(func, args = []) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || tabs[0].url?.startsWith('chrome://') || tabs[0].url?.startsWith('edge://')) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id, allFrames: true },
      func,
      args
    });
  });
}

// ===================================================
// スタイル注入関連の関数
// ===================================================
function applyBrightness(value) {
  const css = `video { filter: brightness(${value}%) !important; }`;
  execInTab((cssString, styleId) => {
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = cssString;
  }, [css, BRIGHTNESS_STYLE_ID]);
}

function removeBrightness() {
  execInTab((styleId) => {
    const styleElement = document.getElementById(styleId);
    if (styleElement) styleElement.remove();
  }, [BRIGHTNESS_STYLE_ID]);
}

function applyTransform() {
  const transformValue = `rotate(${currentRotation}deg) scaleX(${isFlipped ? -1 : 1})`;
  const css = `video { transform: ${transformValue} !important; transition: transform 0.2s; }`;
  execInTab((cssString, styleId) => {
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = cssString;
  }, [css, TRANSFORM_STYLE_ID]);
}

function removeTransform() {
  execInTab((styleId) => {
    const styleElement = document.getElementById(styleId);
    if (styleElement) styleElement.remove();
  }, [TRANSFORM_STYLE_ID]);
}

// ===================================================
// UI更新関数
// ===================================================
function updateSliderTrack(slider) {
  const min = slider.min || 0;
  const max = slider.max || 100;
  const value = slider.value;
  const percentage = ((value - min) / (max - min)) * 100;
  const activeColor = '#00ffff';
  const inactiveColor = '#333';
  slider.style.background = `linear-gradient(to right, ${activeColor} ${percentage}%, ${inactiveColor} ${percentage}%)`;
}

// ===================================================
// メインロジック (ループ機能は除く)
// ===================================================
function applyToAllVideos(action, value) {
  const funcToInject = (actionType, val) => {
    const videos = document.querySelectorAll("video");
    if (videos.length === 0) return;
    videos.forEach(video => {
      switch (actionType) {
        case 'speed':
          video.playbackRate = parseFloat(val);
          break;
        case 'volume':
        case 'voiceBoost':
          if (!video._audioCtx) {
            try {
              const ctx = new AudioContext();
              const source = ctx.createMediaElementSource(video);
              const eq = ctx.createBiquadFilter();
              eq.type = "peaking"; eq.frequency.value = 1500; eq.Q.value = 1.0; eq.gain.value = 0;
              const compressor = ctx.createDynamicsCompressor();
              compressor.threshold.value = -30; compressor.knee.value = 20; compressor.ratio.value = 6; compressor.attack.value = 0.003; compressor.release.value = 0.25;
              const gainNode = ctx.createGain();
              source.connect(eq).connect(compressor).connect(gainNode).connect(ctx.destination);
              video._audioCtx = ctx; video._gainNode = gainNode; video._eqNode = eq;
            } catch (e) {
              console.error("Videleon: AudioContextの初期化に失敗しました。", e);
              return;
            }
          }
          if (actionType === 'volume' && video._gainNode) video._gainNode.gain.value = parseInt(val) / 100;
          if (actionType === 'voiceBoost' && video._eqNode) video._eqNode.gain.value = (val / 100) * 20;
          break;
        case 'resetVolume':
          if (video._gainNode) video._gainNode.gain.value = 1.0;
          if (video._eqNode) video._eqNode.gain.value = 0;
          break;
      }
    });
  };
  execInTab(funcToInject, [action, value]);
}

// ===================================================
// イベントリスナーの設定
// ===================================================
brightnessSlider.addEventListener("input", (e) => {
  brightnessValue.textContent = e.target.value + "%";
  updateSliderTrack(e.target);
  applyBrightness(e.target.value);
});

speedSlider.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  speedValue.textContent = value.toFixed(2) + "x";
  updateSliderTrack(e.target);
  applyToAllVideos('speed', value);
});

volumeSlider.addEventListener("input", (e) => {
  volumeValue.textContent = e.target.value + "%";
  updateSliderTrack(e.target);
  applyToAllVideos('volume', e.target.value);
});

voiceBoostSlider.addEventListener("input", (e) => {
  const value = parseInt(e.target.value);
  voiceBoostValue.textContent = value === 0 ? "Off" : `${value}%`;
  updateSliderTrack(e.target);
  applyToAllVideos('voiceBoost', value);
});

rotateBtn.addEventListener("click", () => {
  currentRotation = (currentRotation + 90) % 360;
  applyTransform();
});

flipBtn.addEventListener("click", () => {
  isFlipped = !isFlipped;
  applyTransform();
});

setA_Btn.addEventListener("click", () => LoopController.setA());
setB_Btn.addEventListener("click", () => LoopController.setB());
clearLoop_Btn.addEventListener("click", () => LoopController.clear());

resetBtn.addEventListener("click", () => {
  brightnessSlider.value = DEFAULT_VALUES.brightness;
  brightnessValue.textContent = DEFAULT_VALUES.brightness + "%";
  speedSlider.value = DEFAULT_VALUES.speed;
  speedValue.textContent = DEFAULT_VALUES.speed.toFixed(2) + "x";
  volumeSlider.value = DEFAULT_VALUES.volume;
  volumeValue.textContent = DEFAULT_VALUES.volume + "%";
  voiceBoostSlider.value = DEFAULT_VALUES.voiceBoost;
  voiceBoostValue.textContent = "Off";

  removeBrightness();
  removeTransform();
  currentRotation = 0;
  isFlipped = false;
  LoopController.clear();
  applyToAllVideos('speed', DEFAULT_VALUES.speed);
  applyToAllVideos('resetVolume', null);
  
  document.querySelectorAll('input[type="range"]').forEach(updateSliderTrack);
});

// ===================================================
// 初期化処理
// ===================================================
function addWheelControl(slider, valueLabel, formatFn) {
  slider.addEventListener("wheel", (e) => {
    e.preventDefault();
    const step = parseFloat(slider.step) || 1;
    const delta = e.deltaY < 0 ? step : -step;
    let newValue = parseFloat(slider.value) + delta;
    newValue = Math.min(slider.max, Math.max(slider.min, newValue));
    slider.value = newValue;
    valueLabel.textContent = formatFn(newValue);
    slider.dispatchEvent(new Event("input"));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });

  addWheelControl(brightnessSlider, brightnessValue, (v) => Math.round(v) + "%");
  addWheelControl(speedSlider, speedValue, (v) => parseFloat(v).toFixed(2) + "x");
  addWheelControl(volumeSlider, volumeValue, (v) => Math.round(v) + "%");
  addWheelControl(voiceBoostSlider, voiceBoostValue, (v) => v === 0 ? "Off" : Math.round(v) + "%");

  document.querySelectorAll('input[type="range"]').forEach(updateSliderTrack);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || tabs[0].url?.startsWith('chrome://') || tabs[0].url?.startsWith('edge://')) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (bId, tId) => {
        const v = document.querySelector("video");
        if (!v) return null;
        let res = { speed: v.playbackRate, volume: 100, voiceBoost: 0, brightness: 100, rotation: 0, flipped: false };
        if (v._gainNode?.gain) res.volume = Math.round(v._gainNode.gain.value * 100);
        if (v._eqNode?.gain) res.voiceBoost = Math.round((v._eqNode.gain.value / 20) * 100);
        const bEl = document.getElementById(bId);
        if (bEl) { const m = bEl.textContent.match(/brightness\((\d+)\%\)/); if(m?.[1]) res.brightness = parseInt(m[1]); }
        const tEl = document.getElementById(tId);
        if (tEl) {
          const rM = tEl.textContent.match(/rotate\((\d+)deg\)/); if(rM?.[1]) res.rotation = parseInt(rM[1]);
          const fM = tEl.textContent.match(/scaleX\(-1\)/); if(fM) res.flipped = true;
        }
        return res;
      },
      args: [BRIGHTNESS_STYLE_ID, TRANSFORM_STYLE_ID]
    }, (injectionResults) => {
      if (chrome.runtime.lastError || !injectionResults?.[0]?.result) return;
      const { speed, brightness, volume, voiceBoost, rotation, flipped } = injectionResults[0].result;
      
      speedSlider.value = speed; speedValue.textContent = parseFloat(speed).toFixed(2) + "x";
      brightnessSlider.value = brightness; brightnessValue.textContent = brightness + "%";
      volumeSlider.value = volume; volumeValue.textContent = volume + "%";
      voiceBoostSlider.value = voiceBoost; voiceBoostValue.textContent = voiceBoost === 0 ? "Off" : `${voiceBoost}%`;
      currentRotation = rotation; isFlipped = flipped;
      
      document.querySelectorAll('input[type="range"]').forEach(updateSliderTrack);
    });
  });
});