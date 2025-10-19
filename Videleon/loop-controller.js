// loop-controller.js

'use strict';

/**
 * 指定されたアクションを、現在アクティブなタブの動画に対して実行する。
 * ループに関するロジックと状態管理は、すべて注入される関数内で完結する。
 * @param {string} action - 実行するアクション ('setLoopA', 'setLoopB', 'clearLoop')
 */
function executeLoopAction(action) {
  // これが実際にYouTubeのページで実行される関数の本体
  const funcToInject = (actionType) => {
    const videos = document.querySelectorAll("video");
    if (videos.length === 0) return;

    videos.forEach(video => {
      // ループ監視用の関数を、初回実行時にvideo要素自身に定義する
      if (video._checkLoop === undefined) {
        video._checkLoop = () => {
          // ループが有効で、B地点を越えたらA地点に戻す
          if (video._isLooping && video._loopB !== undefined && video.currentTime >= video._loopB) {
            // A/B地点が逆転していたらループしない
            if (video._loopA < video._loopB) {
              video.currentTime = video._loopA;
            }
          }
          // 監視を継続
          video._animationFrameId = requestAnimationFrame(video._checkLoop.bind(video));
        };
      }

      // ポップアップから受け取ったアクションに応じて処理を分岐
      switch (actionType) {
        case 'setLoopA':
          video._loopA = video.currentTime;
          // B地点がA地点より前にある場合は、B地点をリセットする
          if (video._loopB !== undefined && video._loopA > video._loopB) {
            video._loopB = undefined;
          }
          break;
        case 'setLoopB':
          // A地点がセットされている場合のみB地点をセット
          if (video._loopA !== undefined && video.currentTime > video._loopA) {
            video._loopB = video.currentTime;
            // まだ監視が始まっていなければ、ここから開始する
            if (!video._isLooping) {
              video._isLooping = true;
              video._checkLoop();
            }
          }
          break;
        case 'clearLoop':
          // 監視を停止し、状態をリセット
          video._isLooping = false;
          if (video._animationFrameId) {
            cancelAnimationFrame(video._animationFrameId);
          }
          video._loopA = undefined;
          video._loopB = undefined;
          break;
      }
    });
  };

  // アクティブなタブを取得して、上で定義した関数を注入・実行する
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || tabs[0].url?.startsWith('chrome://') || tabs[0].url?.startsWith('edge://')) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id, allFrames: true },
      func: funcToInject,
      args: [action], // 'setLoopA'などの文字列を引数として渡す
    });
  });
}

/**
 * ポップアップ(popup.js)に公開するインターフェース
 */
export const LoopController = {
  setA: () => executeLoopAction('setLoopA'),
  setB: () => executeLoopAction('setLoopB'),
  clear: () => executeLoopAction('clearLoop'),
};